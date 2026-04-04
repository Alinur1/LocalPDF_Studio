import base64
import io
import json
import os
import re
import sys
from collections import Counter


SUPERSCRIPT_FLAG = 1
ITALIC_FLAG = 2
MONO_FLAG = 8
BOLD_FLAG = 16

LIST_MARKER_RE = re.compile(
    r"^(?P<marker>(?:\((?:\d+|[ivxlcdmIVXLCDM]{1,8}|[A-Za-z])\)|(?:\d+|[ivxlcdmIVXLCDM]{1,8}|[A-Za-z])[.)]))\s*(?P<rest>.*)$"
)
SENTENCE_END_RE = re.compile(r"[.!?:;…\"')\]>]$")
LOWERCASE_START_RE = re.compile(r"^[a-z]")
CONTINUATION_START_RE = re.compile(r"^[A-Za-z0-9(\"'`]")


def _progress(stage, value, page=None, total_pages=None):
    payload = {"stage": stage, "value": value}
    if page is not None:
        payload["page"] = page
    if total_pages is not None:
        payload["totalPages"] = total_pages
    sys.stderr.write("PROGRESS_JSON:" + json.dumps(payload) + "\n")
    sys.stderr.flush()


def _load_dependencies():
    missing = []
    modules = {}

    try:
        import fitz
        modules["fitz"] = fitz
    except Exception:
        missing.append("PyMuPDF (fitz)")

    try:
        import pdfplumber
        modules["pdfplumber"] = pdfplumber
    except Exception:
        missing.append("pdfplumber")

    try:
        import pandas as pd
        modules["pd"] = pd
    except Exception:
        missing.append("pandas")

    try:
        import pytesseract
        modules["pytesseract"] = pytesseract
    except Exception:
        missing.append("pytesseract")

    try:
        import spacy
        modules["spacy"] = spacy
    except Exception:
        missing.append("spacy")

    return modules, missing


def _load_nlp(spacy_mod):
    try:
        nlp = spacy_mod.blank("en")
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")
        return nlp
    except Exception:
        return None


def _escape_md(text):
    return (
        text.replace("\\", "\\\\")
        .replace("*", "\\*")
        .replace("_", "\\_")
        .replace("`", "\\`")
        .replace("[", "\\[")
        .replace("|", "\\|")
    )


def _normalize_ws(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _compute_base_font_size(pages):
    freq = Counter()
    for page in pages:
        for line in page["lines"]:
            for span in line["spans"]:
                text = _normalize_ws(span.get("text", ""))
                if not text:
                    continue
                size = round(float(span.get("size", 0)) * 2) / 2
                freq[size] += len(text)
    if not freq:
        return 12.0
    return max(freq.items(), key=lambda kv: kv[1])[0]


def _heading_levels_from_fonts(pages, base_font_size):
    larger = Counter()
    for page in pages:
        for line in page["lines"]:
            size = round(line["font_size"] * 2) / 2
            if size > base_font_size:
                larger[size] += max(1, len(line["plain_text"]))

    sizes = [size for size, _ in sorted(larger.items(), key=lambda kv: (-kv[0], -kv[1]))]
    heading_map = {}
    for idx, size in enumerate(sizes[:3]):
        heading_map[size] = idx + 1
    return heading_map


def _marker_body(marker):
    return marker.strip().lstrip("(").rstrip(")").rstrip(".)").lower()


def _is_roman(body):
    return bool(body) and bool(re.fullmatch(r"[ivxlcdm]+", body))


def _list_kind(marker):
    body = _marker_body(marker)
    if re.fullmatch(r"\d+", body):
        return "numeric"
    if len(body) == 1 and re.fullmatch(r"[a-z]", body):
        return "ambiguous"
    if _is_roman(body):
        return "roman"
    return "alpha"


def _detect_list(line):
    text = line["plain_text"]
    match = LIST_MARKER_RE.match(text)
    if not match:
        return None
    marker = match.group("marker")
    rest = match.group("rest").strip()
    return {
        "marker": marker,
        "rest": rest,
        "kind": _list_kind(marker)
    }


def _format_span(text, flags):
    if not text:
        return ""
    text = _escape_md(text)
    is_bold = bool(flags & BOLD_FLAG)
    is_italic = bool(flags & ITALIC_FLAG)
    is_mono = bool(flags & MONO_FLAG)
    is_super = bool(flags & SUPERSCRIPT_FLAG)

    if is_mono:
        text = f"`{text}`"
    elif is_bold and is_italic:
        text = f"***{text}***"
    elif is_bold:
        text = f"**{text}**"
    elif is_italic:
        text = f"*{text}*"

    if is_super:
        text = f"<sup>{text}</sup>"
    return text


def _join_spans(spans):
    if not spans:
        return "", ""

    plain = ""
    styled = ""
    prev_end = None
    for span in spans:
        text = span.get("text", "")
        if not text:
            continue
        x0 = float(span.get("x0", 0))
        x1 = float(span.get("x1", x0))
        gap = 0 if prev_end is None else x0 - prev_end
        needs_space = prev_end is not None and gap >= max(float(span.get("size", 10)) * 0.22, 2)
        if needs_space and not plain.endswith(" "):
            plain += " "
            styled += " "
        plain += text
        styled += _format_span(text, int(span.get("flags", 0)))
        prev_end = x1
    return _normalize_ws(plain), styled.strip()


def _line_from_raw(line):
    spans = []
    xs = []
    ys = []
    font_sizes = []
    for span in line.get("spans", []):
        text = span.get("text", "")
        if not text or not text.strip():
            continue
        spans.append(span)
        xs.extend([float(span.get("bbox", [0, 0, 0, 0])[0]), float(span.get("bbox", [0, 0, 0, 0])[2])])
        ys.extend([float(span.get("bbox", [0, 0, 0, 0])[1]), float(span.get("bbox", [0, 0, 0, 0])[3])])
        font_sizes.append(float(span.get("size", 0)))

    if not spans:
        return None

    plain_text, styled_text = _join_spans(spans)
    if not plain_text:
        return None

    return {
        "spans": spans,
        "plain_text": plain_text,
        "text": styled_text or _escape_md(plain_text),
        "x0": min(xs),
        "x1": max(xs),
        "y0": min(ys),
        "y1": max(ys),
        "font_size": sum(font_sizes) / len(font_sizes),
    }


def _bbox_intersects(a, b):
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def _extract_page_lines(page):
    raw = page.get_text("dict")
    lines = []
    for block in raw.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            item = _line_from_raw(line)
            if item:
                lines.append(item)
    lines.sort(key=lambda item: (item["y0"], item["x0"]))
    return lines


def _table_to_markdown(pd, rows):
    normalized = []
    max_cols = max((len(row) for row in rows), default=0)
    if max_cols < 2:
        return ""

    for row in rows:
        norm_row = [(_normalize_ws(cell) if cell is not None else "") for cell in row]
        if len(norm_row) < max_cols:
            norm_row.extend([""] * (max_cols - len(norm_row)))
        normalized.append(norm_row)

    header = normalized[0]
    body = normalized[1:] if len(normalized) > 1 else []
    if not any(cell.strip() for cell in header):
        header = [f"Column {i + 1}" for i in range(max_cols)]
    df = pd.DataFrame(body, columns=header)
    return df.to_markdown(index=False)


def _extract_tables(pdfplumber_page, pd):
    tables = []
    try:
        found = pdfplumber_page.find_tables()
    except Exception:
        found = []

    for idx, table in enumerate(found):
        rows = table.extract() or []
        if len(rows) < 2:
            continue
        markdown = _table_to_markdown(pd, rows)
        if not markdown:
            continue
        x0, top, x1, bottom = table.bbox
        tables.append({
            "type": "table",
            "text": markdown,
            "bbox": (float(x0), float(top), float(x1), float(bottom)),
            "x0": float(x0),
            "y0": float(top),
            "sort_y": float(top),
            "sort_x": float(x0),
            "table_index": idx,
        })
    return tables


def _extract_images(fitz_doc, page_index, asset_prefix):
    page = fitz_doc[page_index]
    images = []
    refs = []
    seen_xrefs = set()

    for img_index, img in enumerate(page.get_images(full=True)):
        xref = img[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        try:
            data = fitz_doc.extract_image(xref)
        except Exception:
            continue
        ext = data.get("ext", "png")
        name = f"{asset_prefix}-page-{page_index + 1:03d}-img-{len(images) + 1:02d}.{ext}"
        images.append({
            "filename": name,
            "mimeType": f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}",
            "data": base64.b64encode(data["image"]).decode("ascii"),
        })
        refs.append({
            "type": "image",
            "text": f"![Figure {len(images)}](assets/{name})",
            "sort_y": float(page.rect.height) + (len(refs) + 1) * 10,
            "sort_x": 0.0,
        })
    return images, refs


def _ocr_page(page, fitz_mod, pytesseract_mod):
    pix = page.get_pixmap(matrix=fitz_mod.Matrix(2.5, 2.5), alpha=False)
    try:
        from PIL import Image
    except Exception as exc:
        raise RuntimeError(f"Pillow is required for OCR fallback: {exc}")
    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return _normalize_ws(pytesseract_mod.image_to_string(image))


def _detect_heading(line, heading_map):
    rounded = round(line["font_size"] * 2) / 2
    level = heading_map.get(rounded)
    if not level:
        return None
    return {
        "type": f"h{level}",
        "text": line["text"],
        "plain_text": line["plain_text"],
        "x0": line["x0"],
        "y0": line["y0"],
        "sort_y": line["y0"],
        "sort_x": line["x0"],
    }


def _line_to_element(line, heading_map):
    heading = _detect_heading(line, heading_map)
    if heading:
        return heading

    list_info = _detect_list(line)
    if list_info:
        marker = list_info["marker"]
        prefix = "1. " if marker[0].isdigit() else f"- {marker} "
        return {
            "type": "list",
            "text": list_info["rest"],
            "plain_text": list_info["rest"],
            "marker": marker,
            "list_kind": list_info["kind"],
            "prefix": prefix,
            "x0": line["x0"],
            "content_x": line["x0"] + max(12, line["font_size"] * 1.2),
            "y0": line["y0"],
            "sort_y": line["y0"],
            "sort_x": line["x0"],
        }

    return {
        "type": "paragraph",
        "text": line["text"],
        "plain_text": line["plain_text"],
        "x0": line["x0"],
        "y0": line["y0"],
        "sort_y": line["y0"],
        "sort_x": line["x0"],
    }


def _heal_sentences(elements, nlp):
    out = []
    for el in elements:
        if el["type"] != "paragraph":
            out.append(el)
            continue

        prev = out[-1] if out else None
        if prev and prev["type"] == "list":
            if (
                CONTINUATION_START_RE.match(el["plain_text"])
                and (
                    LOWERCASE_START_RE.match(el["plain_text"])
                    or el["x0"] >= prev.get("content_x", prev["x0"]) - 12
                    or not SENTENCE_END_RE.search(prev["plain_text"])
                )
            ):
                joiner = "" if prev["text"].endswith("-") else " "
                if prev["text"].endswith("-"):
                    prev["text"] = prev["text"][:-1] + el["text"]
                    prev["plain_text"] = prev["plain_text"][:-1] + el["plain_text"]
                else:
                    prev["text"] += joiner + el["text"]
                    prev["plain_text"] += joiner + el["plain_text"]
                continue

        if prev and prev["type"] == "paragraph":
            if prev["plain_text"].endswith("-") and LOWERCASE_START_RE.match(el["plain_text"]):
                prev["text"] = prev["text"][:-1] + el["text"]
                prev["plain_text"] = prev["plain_text"][:-1] + el["plain_text"]
                continue

            join_candidate = prev["plain_text"] + " " + el["plain_text"]
            should_join = False
            if nlp is not None:
                try:
                    doc = nlp(join_candidate)
                    should_join = len(list(doc.sents)) <= 1
                except Exception:
                    should_join = False

            if should_join or (
                not SENTENCE_END_RE.search(prev["plain_text"])
                and LOWERCASE_START_RE.match(el["plain_text"])
            ):
                prev["text"] += " " + el["text"]
                prev["plain_text"] += " " + el["plain_text"]
                continue

        out.append(dict(el))
    return out


def _list_resolved_kind(element, same_level, parent):
    if element["list_kind"] != "ambiguous":
        return element["list_kind"]
    if same_level and same_level.get("resolved_kind") == "alpha":
        return "alpha"
    if same_level and same_level.get("resolved_kind") == "roman":
        return "roman"
    if parent and parent.get("resolved_kind") == "alpha":
        return "roman"
    return "alpha"


def _matching_depth(stack, element):
    for depth in range(len(stack) - 1, -1, -1):
        entry = stack[depth]
        if not entry:
            continue
        if entry["resolved_kind"] == "alpha" and element["list_kind"] in ("alpha", "ambiguous"):
            return depth
        if entry["resolved_kind"] == "numeric" and element["list_kind"] == "numeric":
            return depth
        if entry["resolved_kind"] == "roman" and element["list_kind"] in ("roman", "ambiguous"):
            return depth
    return None


def _resolve_list_depth(element, stack, previous_list):
    if not stack:
        return 0, _list_resolved_kind(element, None, None)

    depth = len(stack) - 1
    while depth > 0 and element["x0"] < stack[depth]["x0"] - 6:
        depth -= 1

    top = stack[depth]
    if top and element["x0"] > top.get("content_x", top["x0"]) + 8:
        return depth + 1, _list_resolved_kind(element, None, top)

    match = _matching_depth(stack, element)
    if match is not None:
        return match, _list_resolved_kind(element, stack[match], stack[match - 1] if match > 0 else None)

    if previous_list and previous_list["resolved_kind"] == "alpha" and element["list_kind"] in ("roman", "ambiguous"):
        return previous_list["depth"] + 1, _list_resolved_kind(element, None, previous_list)

    return 0, _list_resolved_kind(element, stack[0], None)


def _remove_edge_artifacts(page_markdowns):
    first_counts = Counter()
    last_counts = Counter()

    split_pages = []
    for part in page_markdowns:
        lines = [line for line in part.split("\n") if line.strip()]
        split_pages.append(lines)
        if lines:
            first_counts[_normalize_ws(lines[0])] += 1
            last_counts[_normalize_ws(lines[-1])] += 1

    cleaned = []
    for idx, lines in enumerate(split_pages, start=1):
        lines = list(lines)
        if lines and first_counts[_normalize_ws(lines[0])] > 1:
            lines.pop(0)
        if lines:
            last = _normalize_ws(lines[-1])
            if last == str(idx) or last_counts[last] > 1:
                lines.pop()
        if lines:
            cleaned.append("\n".join(lines).strip())
    return cleaned


def _render_elements(elements):
    lines = []
    prev_type = None
    stack = []
    previous_list = None

    for element in elements:
        if element["type"] in ("h1", "h2", "h3"):
            if prev_type:
                lines.append("")
            level = int(element["type"][1])
            lines.append("#" * level + " " + element["text"])
            stack = []
            previous_list = None
        elif element["type"] == "list":
            depth, resolved_kind = _resolve_list_depth(element, stack, previous_list)
            indent = "  " * depth
            lines.append(indent + element["prefix"] + element["text"])
            rendered = dict(element)
            rendered["depth"] = depth
            rendered["resolved_kind"] = resolved_kind
            stack = stack[:depth]
            stack.append(rendered)
            previous_list = rendered
        elif element["type"] == "table":
            if prev_type:
                lines.append("")
            lines.append(element["text"])
            stack = []
            previous_list = None
        else:
            if prev_type and prev_type != "paragraph":
                lines.append("")
            lines.append(element["text"])
            if prev_type != "list":
                stack = []
                previous_list = None
        prev_type = element["type"]
    return "\n".join(lines)


def convert_pdf_to_markdown(payload):
    modules, missing = _load_dependencies()
    if missing:
        return {
            "success": False,
            "error": "Missing Python dependencies: " + ", ".join(missing),
            "markdown": "",
            "assets": [],
            "engine": "python"
        }

    fitz = modules["fitz"]
    pdfplumber = modules["pdfplumber"]
    pd = modules["pd"]
    pytesseract = modules["pytesseract"]
    nlp = _load_nlp(modules["spacy"])

    input_path = payload["filePath"]
    options = payload.get("options", {})
    asset_prefix = re.sub(r"[^a-zA-Z0-9]+", "-", os.path.splitext(os.path.basename(input_path))[0]).strip("-").lower() or "document"

    include_images = bool(options.get("includeImages", True))
    detect_headings = bool(options.get("detectHeadings", True))
    detect_tables = bool(options.get("detectTables", True))
    detect_formatting = bool(options.get("detectFormatting", True))
    ocr_fallback = bool(options.get("ocrFallback", False))
    heal_paragraphs = bool(options.get("healParagraphs", True))

    _progress("loading", 3)
    fitz_doc = fitz.open(input_path)
    plumber_doc = pdfplumber.open(input_path)
    total_pages = len(fitz_doc)

    try:
        _progress("analyzing", 8, total_pages=total_pages)
        page_models = []
        for page_index in range(total_pages):
            page = fitz_doc[page_index]
            lines = _extract_page_lines(page)
            page_models.append({"page_index": page_index, "lines": lines})

        base_font_size = _compute_base_font_size(page_models)
        heading_map = _heading_levels_from_fonts(page_models, base_font_size) if detect_headings else {}

        assets = []
        page_markdowns = []

        for page_index in range(total_pages):
            page_num = page_index + 1
            _progress("page", 15 + int((page_index / max(total_pages, 1)) * 80), page=page_num, total_pages=total_pages)
            fitz_page = fitz_doc[page_index]
            plumber_page = plumber_doc.pages[page_index]

            text_lines = page_models[page_index]["lines"]
            tables = _extract_tables(plumber_page, pd) if detect_tables else []
            table_bboxes = [table["bbox"] for table in tables]

            text_present = bool(text_lines)
            if ocr_fallback and not text_present:
                ocr_text = _ocr_page(fitz_page, fitz, pytesseract)
                if ocr_text:
                    page_markdowns.append(ocr_text)
                continue

            elements = list(tables)
            seen_positions = set()

            for line in text_lines:
                line_bbox = (line["x0"], line["y0"], line["x1"], line["y1"])
                if any(_bbox_intersects(line_bbox, bbox) for bbox in table_bboxes):
                    continue

                dedup_key = (round(line["x0"], 1), round(line["y0"], 1), line["plain_text"])
                if dedup_key in seen_positions:
                    continue
                seen_positions.add(dedup_key)

                element = _line_to_element(line, heading_map)
                if not detect_formatting:
                    element["text"] = _escape_md(element.get("plain_text", element["text"]))
                elements.append(element)

            if include_images:
                page_assets, image_refs = _extract_images(fitz_doc, page_index, asset_prefix)
                assets.extend(page_assets)
                elements.extend(image_refs)

            elements.sort(key=lambda item: (item.get("sort_y", 0), item.get("sort_x", 0)))
            if heal_paragraphs:
                elements = _heal_sentences(elements, nlp)
            page_markdown = _render_elements(elements).strip()
            if page_markdown:
                page_markdowns.append(page_markdown)

        _progress("assembling", 98, total_pages=total_pages)
        cleaned_pages = _remove_edge_artifacts(page_markdowns)
        return {
            "success": True,
            "markdown": "\n\n".join(cleaned_pages),
            "assets": assets,
            "engine": "python",
            "meta": {
                "baseFontSize": base_font_size,
                "pageCount": total_pages
            }
        }
    finally:
        plumber_doc.close()
        fitz_doc.close()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Expected a JSON payload file path"}))
        return 1

    try:
        with open(sys.argv[1], "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Failed to read payload: {exc}"}))
        return 1

    try:
        result = convert_pdf_to_markdown(payload)
        print(json.dumps(result))
        return 0 if result.get("success") else 1
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc), "markdown": "", "assets": [], "engine": "python"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
