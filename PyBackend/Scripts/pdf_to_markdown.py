# LocalPDF Studio - Offline PDF Toolkit
# ======================================

# @author      Md. Alinur Hossain <alinur1160@gmail.com>
# @license     AGPL 3.0 (GNU Affero General Public License version 3)
# @website     https://alinur1.github.io/LocalPDF_Studio_Website/
# @repository  https://github.com/Alinur1/LocalPDF_Studio

# Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.

# Architecture:
# - Frontend: Electron + HTML/CSS/JS
# - Backend: ASP.NET Core Web API, Python
# - PDF Engine: PdfSharp + Mozilla PDF.js

import sys
import os
import json
import re
import shutil
import inspect
import importlib
import tempfile
import urllib.parse


def progress(stage, value, page=None, total_pages=None):
    payload = {"stage": stage, "value": value}
    if page is not None:
        payload["page"] = page
    if total_pages is not None:
        payload["totalPages"] = total_pages
    sys.stderr.write("PROGRESS_JSON:" + json.dumps(payload) + "\n")
    sys.stderr.flush()


def warn(msg):
    sys.stderr.write("WARNING: " + msg + "\n")
    sys.stderr.flush()


# Picture-text delimiter comes in two styles across pymupdf4llm versions:
#   legacy:  ----- Start of picture text -----
#   1.28.x+: <!-- Start of picture text -->
_PIC_TEXT_DELIM = r'(?:<!--+\s*{0}\s*--+>|[-]{{3,}}\s*{0}\s*[-]{{3,}})'

_OCR_PICTURE_BLOCK_RE = re.compile(
    _PIC_TEXT_DELIM.format('Start of picture text')
    + r'[\s\S]*?'
    + _PIC_TEXT_DELIM.format('End of picture text'),
    re.IGNORECASE
)


def sanitize_ocr_artifacts(md_text: str) -> str:
    """Remove HTML <br> tags and OCR picture-text blocks that break markdown renderers."""
    md_text = re.sub(r'<br\s*/?>', '\n', md_text)
    md_text = _OCR_PICTURE_BLOCK_RE.sub('', md_text)
    return md_text.strip()


# ---------------------------------------------------------------------------
# Own image extraction (extract_images.py-style, hardened)
# ---------------------------------------------------------------------------

MIN_IMAGE_EDGE_PT = 16.0        # both edges must be at least this wide in pt
MIN_IMAGE_AREA_RATIO = 0.0001   # ...and cover at least this fraction of the page


def _smask_map(doc):
    """Map xref -> smask xref for the whole document (page.get_images(full=True) rows)."""
    mapping = {}
    for page in doc:
        for entry in page.get_images(full=True):
            xref = entry[0]
            smask = entry[1]
            if smask and xref not in mapping:
                mapping[xref] = smask
    return mapping


def _pixmap_for_xref(doc, xref, smasks):
    """Return a PyMuPDF.Pixmap for xref with SMask alpha and CMYK color handling.

    Raises on hard failures so callers can fall back to region rendering.
    """
    pix = None
    smask_xref = smasks.get(xref, 0)

    try:
        info = doc.extract_image(xref)
        ext = info.get("ext", "")
        # Raw embedded bytes preserve original encoding/resolution exactly -
        # but only for formats browsers/markdown renderers can display.
        if smask_xref == 0 and ext in ("png", "jpg", "jpeg") and info.get("image"):
            return _RawImage(bytes(info["image"]), "png" if ext == "png" else "jpg")
        pix = pymupdf.Pixmap(doc, xref)

        if smask_xref:
            try:
                mask = pymupdf.Pixmap(doc, smask_xref)
                if mask.colorspace is not None and mask.colorspace.n != 1:
                    mask = pymupdf.Pixmap(pymupdf.csGRAY, mask)
                if mask.width == pix.width and mask.height == pix.height:
                    composed = pymupdf.Pixmap(pix, mask)  # attach alpha channel
                    pix = composed
                else:
                    warn(f"SMask for xref {xref} has size {mask.width}x{mask.height}, "
                         f"expected {pix.width}x{pix.height}; ignoring mask")
            except Exception as sm_err:
                warn(f"Failed to compose SMask for xref {xref}: {sm_err}")

        # CMYK and other >4 channel colorspaces -> RGB (extract_images.py skipped these!)
        if pix.colorspace is not None and (pix.colorspace.n - pix.alpha) >= 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)

        if pix.width <= 0 or pix.height <= 0:
            raise ValueError(f"xref {xref} rendered to an empty pixmap")

        return _RawImage(pix.tobytes("png"), "png")
    finally:
        pix = None


class _RawImage:
    """Tiny struct so image payloads can be bytes-of-file or bytes-of-pixmap."""

    __slots__ = ("data", "ext")

    def __init__(self, data, ext):
        self.data = data
        self.ext = ext


def _collect_painted_images(doc, page_no):
    """Images actually painted on 0-based page_no, reading order (y then x).

    get_image_info() only returns images that are drawn on the page (unlike
    page.get_images(), which also lists dormant resource entries), and it
    includes their placement bbox - exactly what the placement work needs.
    """
    page = doc[page_no]
    painted = []
    for info in page.get_image_info(xrefs=True):
        bbox = info.get("bbox")
        if not bbox:
            continue
        r = pymupdf.Rect(bbox)
        if r.is_empty or r.is_infinite:
            continue
        painted.append({
            "xref": info.get("xref") or 0,
            "bbox": (r.x0, r.y0, r.x1, r.y1),
            "width": info.get("width") or r.width,
            "height": info.get("height") or r.height,
        })
    painted.sort(key=lambda i: (round(i["bbox"][1], 1), round(i["bbox"][0], 1)))
    return painted


def _extract_painted_data(doc, page_no, painted, smasks):
    """Extract the image bytes of one painted slot (raw bytes or clip render)."""
    page = doc[page_no]
    bbox = pymupdf.Rect(painted["bbox"])
    if not painted["xref"]:
        # Inline image (BI/ID/EI): no xref exists -> render the region.
        pix = page.get_pixmap(clip=bbox, dpi=300)
        if pix.width <= 0 or pix.height <= 0:
            return None
        return _RawImage(pix.tobytes("png"), "png")
    try:
        return _pixmap_for_xref(doc, painted["xref"], smasks)
    except Exception as exc:
        warn(f"Failed to extract xref {painted['xref']} (page {page_no + 1}): {exc}")
        return None


# ---------------------------------------------------------------------------
# pymupdf4llm interaction
# ---------------------------------------------------------------------------

def _load_dependencies():
    missing = []
    modules = {}
    for pkg in ["pymupdf", "pymupdf4llm"]:
        try:
            modules[pkg] = importlib.import_module(pkg)
        except Exception:
            missing.append(pkg)
    return modules, missing


class _PictureCapture:
    """Captures (bbox, md_filename) pairs for every image pymupdf4llm writes.

    On the pymupdf4llm 2.0 'layout' path each rendered image is stored on a
    LayoutBox dataclass that carries both the box bbox and the image path it
    will emit into the markdown. Patching LayoutBox records that pairing -
    the ONLY place where file names meet placement boxes.
    """

    def __init__(self):
        self.captured = []
        self._patched = False
        self._module = None
        self._original = None

    def install(self):
        try:
            import pymupdf4llm.helpers.document_layout as doc_layout
        except Exception:
            return False
        try:
            original = doc_layout.LayoutBox
            capture = self

            class _RecordingLayoutBox(original):
                def __setattr__(self, name, value):
                    super().__setattr__(name, value)
                    if name == "image" and isinstance(value, str) and value != "None":
                        capture.captured.append({
                            "bbox": (self.x0, self.y0, self.x1, self.y1),
                            "md_filename": value,
                        })

            doc_layout.LayoutBox = _RecordingLayoutBox
            self._patched = True
            self._module = doc_layout
            self._original = original
            return True
        except Exception:
            return False

    # NOTE: python runs one process per API request, so the patch is never
    # shared with concurrent conversions; restore is still best-effort.
    def uninstall(self):
        if self._patched and self._module is not None and self._original is not None:
            try:
                self._module.LayoutBox = self._original
            except Exception:
                pass
        self._patched = False


def _to_markdown(modules, input_path, tmp_dir, include_images, strip_header,
                 strip_footer, dpi):
    """Run pymupdf4llm; returns (chunks_or_text, capture or None).

    page_chunks=True is used to get per-page text plus the 1-based page number -
    that pairing is how markers/images are anchored to pages reliably,
    independently of how pymupdf4llm encodes page numbers in file names.
    """
    pymupdf4llm = modules["pymupdf4llm"]
    signature_params = set(inspect.signature(pymupdf4llm.to_markdown).parameters.keys())

    image_path_arg = None
    if include_images:
        image_path_arg = os.path.realpath(tmp_dir).rstrip("/\\") + os.sep

    kwargs = dict(
        doc=input_path,
        write_images=include_images,
        image_path=image_path_arg,
        image_format="png",
        dpi=dpi,
    )
    # Old releases exposed explicit named parameters; newer ones take **kwargs
    # and tolerate unknown extras on both the layout and rag path, so flags are
    # sent through unconditionally except where that historically broke.
    if signature_params and "args" not in signature_params:
        kwargs["show_warning"] = False
    kwargs["header"] = not strip_header
    kwargs["footer"] = not strip_footer
    kwargs["page_chunks"] = True

    capture = _PictureCapture() if include_images else None
    if capture is not None:
        capture.install()
    try:
        chunks = pymupdf4llm.to_markdown(**kwargs)
    finally:
        if capture is not None:
            capture.uninstall()
    return chunks, capture


# ---------------------------------------------------------------------------
# Assembly: rewrite markers, place leftover images
# ---------------------------------------------------------------------------

_MD_MARKER_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


def _resolve_tmp_path(raw_target, tmp_dir):
    """Absolute path of a marker target, whether it was written posix-absolute or relative."""
    target = urllib.parse.unquote(raw_target.replace("\\", "/"))
    if os.path.isabs(target) or re.match(r'^[A-Za-z]:/', target):
        return target
    candidate = os.path.join(os.getcwd(), target)
    if os.path.exists(candidate):
        return candidate
    return os.path.join(tmp_dir, os.path.basename(target))


def _containment_score(img_bbox, box_bbox):
    """Fraction of the image area covered by the box (1.0 = box fully covers it)."""
    ix0 = max(img_bbox[0], box_bbox[0])
    iy0 = max(img_bbox[1], box_bbox[1])
    ix1 = min(img_bbox[2], box_bbox[2])
    iy1 = min(img_bbox[3], box_bbox[3])
    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    inter = iw * ih
    area = max(0.0, img_bbox[2] - img_bbox[0]) * max(0.0, img_bbox[3] - img_bbox[1])
    return (inter / area) if area > 0 else 0.0


class _AssetStore:
    """Writes every placed image exactly once as <output>/images/pageNNN_imgMM.png."""

    def __init__(self, output_dir):
        self.dir = os.path.join(output_dir, "images")
        os.makedirs(self.dir, exist_ok=True)
        self.by_bytes = {}      # md5(data) -> canonical file name (dedupe)
        self.by_xref = {}       # xref -> canonical file name (cross-page dedupe)
        self.counts = {}        # page_no -> images emitted so far

    def canonical_name(self, page_no):
        n = self.counts.get(page_no, 0) + 1
        self.counts[page_no] = n
        return f"page{page_no:03d}_img{n:02d}"

    def add(self, page_no, raw_data, ext, xref=0):
        """Returns the canonical file name for these bytes (or None)."""
        if not raw_data:
            return None
        import hashlib
        digest = hashlib.md5(raw_data).hexdigest()
        if xref and xref in self.by_xref:
            return self.by_xref[xref]
        if digest in self.by_bytes:
            name = self.by_bytes[digest]
            if xref:
                self.by_xref[xref] = name
            return name
        name = self.canonical_name(page_no) + "." + ext
        with open(os.path.join(self.dir, name), "wb") as f:
            f.write(raw_data)
        self.by_bytes[digest] = name
        if xref:
            self.by_xref[xref] = name
        return name

    @property
    def file_count(self):
        return len(self.by_bytes)


def _replace_marker(page_md, target, canonical):
    """Replace the full ![alt](target) marker: with images/<canonical> when we
    got usable data, otherwise with a visible placeholder (never leave a
    reference to a temp path that is about to be deleted)."""
    pattern = r'!\[[^\]]*\]\(' + re.escape(target) + r'\)'
    if canonical:
        return re.sub(pattern, r'![Image](images/' + canonical + r')', page_md), True
    return re.sub(pattern, '*[image unavailable]*', page_md), False


def _assemble_page_md(page_no, page_md, painted, capture_boxes, store,
                      doc, smasks, tmp_dir):
    """Rewrite one page's markdown markers onto canonical images and append missed ones."""
    changed = 0
    used = set()
    plans = []  # (marker target string, canonical file name or None)

    if capture_boxes is not None:
        # Exact pairing available (layout path): each captured picture box
        # names the md file that appears in the text; match it to the painted
        # image whose bbox it covers.
        for slot in capture_boxes:
            md_fn = slot["md_filename"]
            if md_fn not in page_md:
                continue  # marker was suppressed upstream; keep for leftover pass
            bbox = slot["bbox"]
            box_area = max(0.0, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
            candidates = [
                p for p in painted
                if p["bbox"] not in used
                and _containment_score(p["bbox"], bbox) >= 0.9
                and (p["bbox"][2] - p["bbox"][0]) * (p["bbox"][3] - p["bbox"][1])
                >= 0.2 * box_area
            ]
            candidates.sort(
                key=lambda p: -((p["bbox"][2] - p["bbox"][0]) * (p["bbox"][3] - p["bbox"][1])))
            canonical = None
            if candidates:
                best = candidates[0]
                data = _extract_painted_data(doc, page_no - 1, best, smasks)
                if data:
                    canonical = store.add(page_no, data.data, data.ext, best["xref"])
                if canonical:
                    used.add(best["bbox"])
            if canonical is None:
                data = _region_fallback_bytes(md_fn, tmp_dir)
                if data:
                    canonical = store.add(page_no, data.data, data.ext)
            plans.append((md_fn, canonical))
    else:
        # Legacy rag path: markers only encode `<pdfname>-<page>-<seq>`; map
        # seq -> painted image using pymupdf_rag's own derivation (small and
        # contained images filtered, sorted by (y1, x0)).
        seq_list = _legacy_rect_order(painted)
        seq = 0
        for marker in _MD_MARKER_RE.finditer(page_md):
            target = marker.group(2)
            raw_path = _resolve_tmp_path(target, tmp_dir)
            try:
                inside = os.path.realpath(raw_path).startswith(
                    os.path.realpath(tmp_dir) + os.sep)
            except Exception:
                inside = False
            if not inside:
                continue
            canonical = None
            while seq < len(seq_list):
                pick = seq_list[seq]
                seq += 1
                if pick["bbox"] not in used:
                    data = _extract_painted_data(doc, page_no - 1, pick, smasks)
                    if data:
                        canonical = store.add(page_no, data.data, data.ext, pick["xref"])
                    if canonical:
                        used.add(pick["bbox"])
                    break
            if canonical is None:
                data = _region_fallback_file(raw_path)
                if data:
                    canonical = store.add(page_no, data.data, data.ext)
            plans.append((target, canonical))

    for target, canonical in plans:
        page_md, ok = _replace_marker(page_md, target, canonical)
        if ok:
            changed += 1

    # --- append painted images pymupdf4llm never emitted ------------------
    for p in painted:
        if p["bbox"] in used:
            continue
        bbox = p["bbox"]
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        try:
            page_area = doc[page_no - 1].rect.get_area()
        except Exception:
            page_area = 0.0
        if w < MIN_IMAGE_EDGE_PT or h < MIN_IMAGE_EDGE_PT:
            continue  # decorative speck (bullet dot, line art remnant)
        if page_area <= 0 or w * h < MIN_IMAGE_AREA_RATIO * page_area:
            continue
        data = _extract_painted_data(doc, page_no - 1, p, smasks)
        if not data:
            continue
        canonical = store.add(page_no, data.data, data.ext, p["xref"])
        if not canonical:
            continue
        page_md = page_md.rstrip() + f"\n\n![Image](images/{canonical})\n"
        changed += 1

    return page_md, changed


def _region_fallback_bytes(md_filename, tmp_dir):
    """Bytes of the region render pymupdf4llm already wrote for md_filename."""
    raw = _resolve_tmp_path(md_filename, tmp_dir)
    try:
        with open(raw, "rb") as f:
            return _RawImage(f.read(), "png")
    except Exception:
        return None


def _region_fallback_file(raw_path):
    try:
        with open(raw_path, "rb") as f:
            return _RawImage(f.read(), "png")
    except Exception:
        return None


def _legacy_rect_order(painted):
    """Replicas pymupdf4llm.helpers.pymupdf_rag.filter_small_images + extract_images_on_page_*
    ordering (box derivation): area descending, contained areas dropped, sorted by (y1, x0)."""
    items = []
    for p in painted:
        r = pymupdf.Rect(p["bbox"])
        if r.is_empty:
            continue
        items.append(p)
    # drop images fully contained in a larger one
    items.sort(key=lambda p: -((p["bbox"][2] - p["bbox"][0]) * (p["bbox"][3] - p["bbox"][1])))
    kept = []
    for i, item in enumerate(items):
        ri = pymupdf.Rect(item["bbox"])
        if any(ri in pymupdf.Rect(items[j]["bbox"]) for j in range(i)):
            continue
        kept.append(item)
    kept.sort(key=lambda p: (p["bbox"][3], p["bbox"][0]))  # (y1, x0)
    return kept


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def convert(input_path, output_folder, pdf_stem, options):
    """
    input_path - absolute path to the source PDF
    output_folder - absolute path to the folder C# created for this conversion
    pdf_stem - filename without extension, used as the .md filename
    options - dict of feature flags
    """
    global pymupdf
    modules, missing = _load_dependencies()

    if missing:
        return {
            "success":             False,
            "error":               "Missing required Python dependencies: " + ", ".join(missing),
            "missingDependencies": missing,
            "engine":              "pymupdf4llm",
        }

    pymupdf    = modules["pymupdf"]
    pymupdf4llm = modules["pymupdf4llm"]

    include_images = bool(options.get("includeImages", True))
    strip_header   = bool(options.get("stripHeader",   True))
    strip_footer   = bool(options.get("stripFooter",   True))
    # charMargin is accepted for CLI/C# compatibility but unused in the
    # pymupdf4llm 2.0 layout engine (it no longer exposes a char_margin knob).
    dpi            = int(options.get("dpi", 300))

    output_md_path = os.path.join(output_folder, f"{pdf_stem}.md")

    progress("loading", 5)

    try:
        doc = pymupdf.open(input_path)
        total_pages = doc.page_count
    except Exception as exc:
        return {"success": False, "error": f"Failed to open PDF: {exc}", "engine": "pymupdf4llm"}

    progress("analyzing", 10, total_pages=total_pages)

    tmp_image_dir = None
    store = None

    try:
        smasks = _smask_map(doc)
        painted_by_page = {}
        if include_images:
            for i in range(total_pages):
                painted_by_page[i] = _collect_painted_images(doc, i)
                value = 15 + int(10 * (i + 1) / max(1, total_pages))
                progress("extracting", value, page=i + 1, total_pages=total_pages)

        progress("converting", 30, total_pages=total_pages)

        tmp_image_dir = os.path.realpath(tempfile.mkdtemp(prefix="localpdf_md_images_"))
        chunks, capture = _to_markdown(
            modules, input_path, tmp_image_dir,
            include_images, strip_header, strip_footer, dpi,
        )

        progress("assembling", 85, total_pages=total_pages)

        store = _AssetStore(output_folder) if include_images else None
        failed_pages = 0

        parts = []
        for chunk_index, chunk in enumerate(chunks):
            page_no = chunk.get("metadata", {}).get("page_number", chunk_index + 1)
            page_md = chunk.get("text", "")
            capture_boxes = None
            if capture is not None and store is not None:
                capture_boxes = [
                    s for s in capture.captured
                    if re.search(r"-(\d{4})-\d{2}\.(?:png|jpe?g)$", s["md_filename"])
                    and int(re.search(r"-(\d{4})-\d{2}\.", s["md_filename"]).group(1)) == page_no
                ]
                if not capture_boxes:
                    capture_boxes = None  # trust markers, not parsed file names
            if store is not None:
                page_md, _changed = _assemble_page_md(
                    page_no, page_md, painted_by_page.get(page_no - 1, []),
                    capture_boxes, store, doc, smasks, tmp_image_dir,
                )
            parts.append(page_md.rstrip())
            page_value = 85 + int(10 * (chunk_index + 1) / max(1, len(chunks)))
            progress("assembling", page_value, page=page_no, total_pages=total_pages)

        md_text = "\n\n".join(parts)
        md_text = sanitize_ocr_artifacts(md_text)

        with open(output_md_path, "w", encoding="utf-8") as f:
            f.write(md_text)

        progress("done", 100, total_pages=total_pages)

        return {
            "success":      True,
            "outputMdPath": output_md_path,
            "outputFolder": output_folder,
            "engine":       "pymupdf4llm",
            "meta": {
                "pageCount":  total_pages,
                "assetCount": store.file_count if store is not None else 0,
            },
        }

    except Exception as exc:
        return {"success": False, "error": str(exc), "engine": "pymupdf4llm"}

    finally:
        try:
            doc.close()
        except Exception:
            pass
        if tmp_image_dir and os.path.isdir(tmp_image_dir):
            shutil.rmtree(tmp_image_dir, ignore_errors=True)


class pdf_to_markdown:
    pass


def main():
    """
    Usage:
        pdf_to_markdown <input.pdf> <output_folder> <pdf_stem>
                        [--no-images]
                        [--keep-header]
                        [--keep-footer]
    """
    args = {
        "input_path":    None,
        "output_folder": None,
        "pdf_stem":      None,
        "includeImages": True,
        "stripHeader":   True,
        "stripFooter":   True,
        "charMargin":    0.5,
    }

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if   arg == "--no-images":   args["includeImages"] = False
        elif arg == "--keep-header": args["stripHeader"]   = False
        elif arg == "--keep-footer": args["stripFooter"]   = False
        elif not arg.startswith("--"):
            if   args["input_path"]    is None: args["input_path"]    = arg
            elif args["output_folder"] is None: args["output_folder"] = arg
            elif args["pdf_stem"]      is None: args["pdf_stem"]      = arg
        i += 1

    if not args["input_path"] or not args["output_folder"] or not args["pdf_stem"]:
        print(json.dumps({
            "success": False,
            "error":   "Usage: pdf_to_markdown <input.pdf> <output_folder> <pdf_stem> [options]",
        }))
        return 1

    if not os.path.isfile(args["input_path"]):
        print(json.dumps({"success": False, "error": f"File not found: {args['input_path']}"}))
        return 1

    if not os.path.isdir(args["output_folder"]):
        print(json.dumps({"success": False, "error": f"Output folder not found: {args['output_folder']}"}))
        return 1

    options = {k: v for k, v in args.items()
               if k not in ("input_path", "output_folder", "pdf_stem")}

    result = convert(args["input_path"], args["output_folder"], args["pdf_stem"], options)
    print(json.dumps(result))
    return 0 if result.get("success") else 1
