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
import io
import re
import hashlib
import difflib
import pymupdf as fitz
from PIL import Image


# A page with a full sentence (30+ non-space chars) is content, not blank.
# Thresholds count only page-number/header/footer residue as ignorable text.
PRESETS = {
    "strict":   {"maxTextChars": 5, "maxInkRatio": 0.002, "dupHamming": 3},
    "balanced": {"maxTextChars": 10, "maxInkRatio": 0.005, "dupHamming": 6},
    "lenient":  {"maxTextChars": 20, "maxInkRatio": 0.01,  "dupHamming": 10},
}
# Pixels at/above this gray level count as paper white. 240 (not 250)
# tolerates JPEG/scan background noise; real text and lines are far darker.
WHITE_LEVEL = 240

# Production guards for the blank/duplicate detector.
MAX_PAGES = 2000
# Visual agreement required to call two same-text pages "exact".
# Keeps signed vs. unsigned copies of the same contract out of exact groups.
EXACT_VISUAL_MAX = 3
MAX_WARNINGS = 20


def resolve_config(preset, options):
    base = PRESETS.get((preset or "balanced").lower(), PRESETS["balanced"])
    cfg = dict(base)
    opts = options or {}
    try:
        if opts.get("maxTextChars") is not None:
            cfg["maxTextChars"] = max(0, int(opts["maxTextChars"]))
        if opts.get("maxInkRatio") is not None:
            cfg["maxInkRatio"] = min(0.2, max(0.0, float(opts["maxInkRatio"])))
        if opts.get("dupHamming") is not None:
            cfg["dupHamming"] = min(32, max(0, int(opts["dupHamming"])))
    except (ValueError, TypeError):
        pass
    cfg["ignoreFooter"] = bool(opts.get("ignoreFooter", True))
    try:
        cfg["renderDpi"] = min(200, max(72, int(opts.get("renderDpi", 100))))
    except (ValueError, TypeError):
        cfg["renderDpi"] = 100
    return cfg


def normalize_text(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def page_text(page, ignore_footer):
    """Extractable text, optionally excluding the footer band (bottom 10%).

    Mirrors the footer crop applied to rendered images so a page number
    alone does not stop a page from counting as blank.
    """
    try:
        raw = page.get_text() or ""
    except Exception:
        return ""
    if not ignore_footer or not raw.strip():
        return raw
    try:
        height = page.rect.height
        cutoff = height * 0.90
        parts = []
        for b in page.get_text("blocks") or []:
            try:
                x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
            except Exception:
                continue
            if y0 is not None and y0 >= cutoff:
                continue  # footer band: page numbers, running heads
            if text:
                parts.append(text)
        return "\n".join(parts) if parts else ""
    except Exception:
        return raw


def dhash(gray_img):
    # gray_img: PIL grayscale. Resize to 9x8, compare adjacent pixels -> 64-bit int.
    small = gray_img.resize((9, 8), Image.LANCZOS)
    px = list(small.getdata())
    h = 0
    for row in range(8):
        for col in range(8):
            h = (h << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return h


def hamming(a, b):
    try:
        return bin(a ^ b).count("1")
    except Exception:
        x = a ^ b
        n = 0
        while x:
            n += x & 1
            x >>= 1
        return n


def render_gray(page, dpi, ignore_footer):
    """Render a page once to grayscale PIL image (footer-cropped). Returns None on failure."""
    try:
        zoom = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
        try:
            img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
        finally:
            pix = None
        if ignore_footer and img.height > 20:
            img = img.crop((0, 0, img.width, int(img.height * 0.90)))
        return img
    except Exception:
        return None


def ink_ratio_from_image(gray_img):
    """Ink ratio from an already-rendered grayscale image."""
    try:
        hist = gray_img.histogram()
        total = gray_img.width * gray_img.height
        # Pixels darker than near-white count as ink.
        nonwhite = total - sum(hist[WHITE_LEVEL:])
        return (nonwhite / total) if total else 0.0
    except Exception:
        return 1.0


def ink_ratio(page, dpi, ignore_footer):
    img = render_gray(page, dpi, ignore_footer)
    if img is None:
        return 1.0
    return ink_ratio_from_image(img)


def scan_pdf(pdf_path, preset="balanced", options=None):
    cfg = resolve_config(preset, options)
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        msg = str(e)
        if "password" in msg.lower() or "encrypt" in msg.lower():
            return {"success": False, "code": "ENCRYPTED",
                    "error": "ENCRYPTED: This PDF is password-protected. Unlock it first."}
        return {"success": False, "code": "OPEN_FAILED", "error": f"Could not open PDF: {e}"}
    try:
        if getattr(doc, "needs_pass", False) or getattr(doc, "is_encrypted", False):
            try:
                if doc.needs_pass:
                    return {"success": False, "code": "ENCRYPTED",
                            "error": "ENCRYPTED: This PDF is password-protected. Unlock it first."}
            except Exception:
                pass
        total = doc.page_count
        if total <= 0:
            return {"success": False, "code": "EMPTY", "error": "PDF has no pages."}
        if total > MAX_PAGES:
            return {"success": False, "code": "PAGE_LIMIT",
                    "error": f"PDF has {total} pages (limit {MAX_PAGES}). Split it and scan in parts."}
        blanks = []
        blank_set = set()
        infos = []  # per-page { page, textHash, dhash, textLen }
        warnings = []
        warned = [0]
        dhash_by_page = {}
        norm_by_page = {}

        def _warn(msg):
            if warned[0] < MAX_WARNINGS:
                warnings.append(msg[:160])
            warned[0] += 1

        for i in range(total):
            try:
                page = doc[i]
                raw_text = page_text(page, cfg["ignoreFooter"])
                norm = normalize_text(raw_text)
                text_chars = len(norm.replace(" ", ""))
                max_chars = cfg["maxTextChars"]

                # Render-once cache: a single grayscale pixmap serves both
                # ink-ratio (blank check) and dHash (duplicate fingerprint).
                gray_img = [None]
                gray_done = [False]

                def _get_gray():
                    if gray_done[0]:
                        return gray_img[0]
                    gray_done[0] = True
                    gray_img[0] = render_gray(page, cfg["renderDpi"], cfg["ignoreFooter"])
                    if gray_img[0] is None:
                        _warn(f"page {i + 1}: render failed")
                    return gray_img[0]

                ink = None
                is_blank = False
                reason = ""
                # Lazy structural queries: only needed when the page can be blank.
                if text_chars <= max_chars:
                    try:
                        n_draw = len(page.get_drawings())
                    except Exception:
                        n_draw = 1 if text_chars == 0 else 0
                    try:
                        n_img = len(page.get_images())
                    except Exception:
                        n_img = 0
                    try:
                        has_annot = next(page.annots() or iter([]), None) is not None
                    except Exception:
                        has_annot = False
                    try:
                        has_widget = len(list(page.widgets() or [])) > 0
                    except Exception:
                        has_widget = False

                    # Fast path: absolutely empty and no annotations/widgets.
                    if text_chars == 0 and n_draw == 0 and n_img == 0 and not has_annot and not has_widget:
                        is_blank = True
                        reason = "no-text-no-artwork"
                        ink = 0.0
                    elif not has_annot and not has_widget and n_img == 0:
                        # Tiny/no text + no embedded images — render decides
                        # (borders alone stay under the ink threshold).
                        img = _get_gray()
                        ink = ink_ratio_from_image(img) if img is not None else 1.0
                        if ink <= cfg["maxInkRatio"]:
                            is_blank = True
                            reason = "low-ink"
                    # Note: pages with embedded images + tiny text are never
                    # blank (a logo/photo counts as content), same as before.
                if is_blank:
                    conf = 0.99 if ink == 0.0 else max(0.55, min(0.99, 1.0 - (ink / max(cfg["maxInkRatio"], 1e-9)) * 0.4))
                    blanks.append({"page": i + 1, "confidence": round(conf, 2),
                                   "reason": reason, "inkRatio": round(ink or 0.0, 5), "textChars": text_chars})
                    blank_set.add(i + 1)
                # Fingerprint for duplicate detection (skip blanks to keep UI clean).
                dhash = None
                text_hash = hashlib.sha256(norm.encode("utf-8")).hexdigest() if norm else ""
                if (i + 1) not in blank_set:
                    img = _get_gray()
                    if img is not None:
                        try:
                            dhash = dhash(img)
                        except Exception:
                            dhash = None
                    if dhash is not None:
                        dhash_by_page[i + 1] = dhash
                    norm_by_page[i + 1] = norm[:4000]
                infos.append({"page": i + 1, "textHash": text_hash, "dhash": dhash, "textLen": text_chars,
                              "textNorm": norm[:4000]})
            except Exception as e_page:
                # One corrupt page must not kill the whole scan.
                _warn(f"page {i + 1}: {e_page}")
                infos.append({"page": i + 1, "textHash": "", "dhash": None, "textLen": 0, "textNorm": ""})
            if total >= 20 and (i + 1) % 10 == 0:
                sys.stderr.write(f"PROGRESS:{int(((i + 1) / total) * 90)}\n")
        # Exact groups: same non-empty normalized text AND visual agreement.
        # Text-only matching used to flag e.g. the same contract with a
        # different signature as "exact" — now visual distance must also be tiny.
        groups = []
        exact_max = min(EXACT_VISUAL_MAX, cfg["dupHamming"])
        by_text = {}
        for info in infos:
            if info["page"] in blank_set or not info["textHash"]:
                continue
            by_text.setdefault(info["textHash"], []).append(info)
        for bucket in by_text.values():
            if len(bucket) < 2:
                continue
            # Sub-cluster the text bucket by visual proximity.
            members = [b["page"] for b in bucket]
            eparent = {p: p for p in members}

            def _efind(x):
                while eparent[x] != x:
                    eparent[x] = eparent[eparent[x]]
                    x = eparent[x]
                return x

            for a in range(len(bucket)):
                for b in range(a + 1, len(bucket)):
                    pa, pb = bucket[a]["page"], bucket[b]["page"]
                    da, db = dhash_by_page.get(pa), dhash_by_page.get(pb)
                    if da is None or db is None:
                        continue  # render failed: stay conservative, no exact claim
                    if hamming(da, db) <= exact_max:
                        ra, rb = _efind(pa), _efind(pb)
                        if ra != rb:
                            eparent[rb] = ra
            eclusters = {}
            for b in bucket:
                eclusters.setdefault(_efind(b["page"]), []).append(b["page"])
            for pages in eclusters.values():
                if len(pages) > 1:
                    groups.append({"pages": sorted(pages), "kind": "exact", "similarity": 1.0})
        # Near groups: complete-link clustering — every pair in a group must be
        # within threshold (no A~B~C chaining where A and C differ wildly).
        idx = [info for info in infos if info["page"] not in blank_set and info["dhash"] is not None]
        parent = {info["page"]: info["page"] for info in idx}
        members_of = {info["page"]: {info["page"]} for info in idx}

        def _find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                pa, pb = idx[a], idx[b]
                # Same-text pairs were already handled above: never double-report.
                if pa["textHash"] and pa["textHash"] == pb["textHash"]:
                    continue
                if _find(pa["page"]) == _find(pb["page"]):
                    continue
                if hamming(pa["dhash"], pb["dhash"]) > cfg["dupHamming"]:
                    continue
                # Text gate: same layout + different wording is not a duplicate.
                # dHash alone cannot tell two textboxes apart, so pages with
                # substantial text must also read alike (fuzzy match allows a
                # word or two of scan/OCR drift). Image-only pages skip this.
                na, nb = pa.get("textNorm") or "", pb.get("textNorm") or ""
                if len(na) >= 30 and len(nb) >= 30:
                    try:
                        # autojunk=False: popular chars (spaces, 'e') must NOT
                        # count as junk — with it, one-word-drift pages score
                        # ~0.2 instead of ~0.99 (texts are 200+ chars).
                        if difflib.SequenceMatcher(None, na, nb, autojunk=False).ratio() < 0.85:
                            continue
                    except Exception:
                        continue
                ra, rb = _find(pa["page"]), _find(pb["page"])
                if ra == rb:
                    continue
                # Complete-link check: all cross pairs must fit the visual
                # threshold AND read alike (same text gate as above).
                ok = True
                for x in members_of[ra]:
                    dx = dhash_by_page[x]
                    nx = norm_by_page.get(x, "")
                    for y in members_of[rb]:
                        if hamming(dx, dhash_by_page[y]) > cfg["dupHamming"]:
                            ok = False
                            break
                        ny = norm_by_page.get(y, "")
                        if len(nx) >= 30 and len(ny) >= 30:
                            try:
                                if difflib.SequenceMatcher(None, nx, ny, autojunk=False).ratio() < 0.85:
                                    ok = False
                                    break
                            except Exception:
                                ok = False
                                break
                    if not ok:
                        break
                if ok:
                    parent[rb] = ra
                    members_of[ra] |= members_of[rb]
                    del members_of[rb]
        clusters = {}
        for info in idx:
            clusters.setdefault(_find(info["page"]), []).append(info)
        for pages_infos in clusters.values():
            if len(pages_infos) < 2:
                continue
            pages = sorted(info["page"] for info in pages_infos)
            # Max pairwise distance -> similarity.
            maxd = 0
            for a in range(len(pages_infos)):
                for b in range(a + 1, len(pages_infos)):
                    maxd = max(maxd, hamming(pages_infos[a]["dhash"], pages_infos[b]["dhash"]))
            sim = round(1.0 - maxd / 64.0, 3)
            groups.append({"pages": pages, "kind": "near", "similarity": sim})
        groups.sort(key=lambda g: (g["pages"][0], len(g["pages"])))
        sys.stderr.write("PROGRESS:100\n")
        result = {"success": True, "pageCount": total,
                  "preset": (preset or "balanced").lower() if (preset or "").lower() in PRESETS else "balanced",
                  "blanks": blanks, "groups": groups}
        if warnings:
            result["warnings"] = warnings
            if warned[0] > len(warnings):
                result["warningCount"] = warned[0]
        return result
    finally:
        try:
            doc.close()
        except Exception:
            pass


class blank_duplicate_scan:
    pass


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        sys.exit(1)
    try:
        json_file_path = sys.argv[1]
        with open(json_file_path, "r", encoding="utf-8") as f:
            request = json.load(f)
        pdf_path = request.get("file_path")
        preset = request.get("preset", "balanced")
        options = request.get("options")
        if not pdf_path or not os.path.exists(pdf_path):
            print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
            sys.exit(1)
        result = scan_pdf(pdf_path, preset, options)
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
        sys.exit(1)
