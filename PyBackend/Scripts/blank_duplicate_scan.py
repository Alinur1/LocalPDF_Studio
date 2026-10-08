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

from __future__ import annotations
import sys
import os
import json
import re
import hashlib
import difflib
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple
import pymupdf as fitz
from PIL import Image

# A page with a full sentence (30+ non-space chars) is content, not blank.
# Thresholds count only page-number/header/footer residue as ignorable text.
PRESETS: Dict[str, Dict[str, Any]] = {
    "strict":   {"maxTextChars": 5,  "maxInkRatio": 0.002, "dupHamming": 3},
    "balanced": {"maxTextChars": 10, "maxInkRatio": 0.005, "dupHamming": 6},
    "lenient":  {"maxTextChars": 20, "maxInkRatio": 0.01,  "dupHamming": 10},
}

# Pixels at/above this gray level count as paper white. 240 (not 250)
# tolerates JPEG/scan background noise; real text and lines are far darker.
WHITE_LEVEL = 240

# Production guards.
MAX_PAGES = 2000
MAX_WARNINGS = 20
# Visual agreement required to call two same-text pages "exact".
# Keeps signed vs. unsigned copies of the same contract out of exact groups.
EXACT_VISUAL_MAX = 3
# dHash is 64 bits; similarity is reported as 1 - maxPairDistance / 64.
DHASH_BITS = 64

# Text gate: pages with substantial text must also read alike before they
# may be grouped (dHash cannot tell two same-layout pages with different
# wording apart). Below this length the page is treated as image-only.
TEXT_GATE_MIN_CHARS = 30
TEXT_GATE_RATIO = 0.85
TEXT_SNIPPET_CHARS = 4000

# Progress lines are opt-in: the current ASP.NET host does not read stderr
# progress, so it stays silent unless a listener sets this variable.
PROGRESS_ENV = "LOCALPDF_PROGRESS"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass
class ScanConfig:
    max_text_chars: int
    max_ink_ratio: float
    dup_hamming: int
    ignore_footer: bool = True
    render_dpi: int = 100

    @property
    def exact_hamming(self) -> int:
        return min(EXACT_VISUAL_MAX, self.dup_hamming)


def resolve_config(preset: Optional[str], options: Optional[dict]) -> ScanConfig:
    """Merge a named preset with per-request overrides, clamped to sane ranges."""
    base = PRESETS.get((preset or "balanced").lower(), PRESETS["balanced"])
    opts = options or {}

    def as_int(key: str, lo: int, hi: int, default: int) -> int:
        try:
            return max(lo, min(hi, int(opts[key])))
        except (KeyError, TypeError, ValueError):
            return default

    def as_float(key: str, lo: float, hi: float, default: float) -> float:
        try:
            return max(lo, min(hi, float(opts[key])))
        except (KeyError, TypeError, ValueError):
            return default

    return ScanConfig(
        max_text_chars=as_int("maxTextChars", 0, 10000, int(base["maxTextChars"])),
        max_ink_ratio=as_float("maxInkRatio", 0.0, 0.2, float(base["maxInkRatio"])),
        dup_hamming=as_int("dupHamming", 0, 32, int(base["dupHamming"])),
        ignore_footer=bool(opts.get("ignoreFooter", True)),
        render_dpi=as_int("renderDpi", 72, 200, 100),
    )


# ---------------------------------------------------------------------------
# Text / render / hash primitives
# ---------------------------------------------------------------------------


def normalize_text(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def page_text(page: "fitz.Page", ignore_footer: bool) -> str:
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
        cutoff = page.rect.height * 0.90
        parts: List[str] = []
        for block in page.get_text("blocks") or []:
            if len(block) < 5:
                continue
            y0, text = block[1], block[4]
            if len(block) >= 7 and block[6] != 0:
                continue  # image block, not text
            if y0 is not None and y0 >= cutoff:
                continue  # footer band: page numbers, running heads
            if text:
                parts.append(text)
        return "\n".join(parts)
    except Exception:
        return raw


def render_gray(page: "fitz.Page", dpi: int, ignore_footer: bool) -> Optional[Image.Image]:
    """Render a page to a grayscale PIL image (footer-cropped).

    Returns None on failure so callers can degrade gracefully.
    """
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


def ink_ratio_from_image(gray_img: Image.Image) -> float:
    """Fraction of pixels darker than paper white. 1.0 on failure (conservative)."""
    try:
        hist = gray_img.histogram()
        total = gray_img.width * gray_img.height
        nonwhite = total - sum(hist[WHITE_LEVEL:])
        return (nonwhite / total) if total else 0.0
    except Exception:
        return 1.0


def dhash(gray_img: Image.Image) -> int:
    """64-bit difference hash: resize to 9x8, compare horizontal neighbors."""
    small = gray_img.resize((9, 8), Image.LANCZOS)
    px = list(small.getdata())
    h = 0
    for row in range(8):
        for col in range(8):
            h = (h << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return h


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class PageFingerprint:
    page: int                    # 1-based page number
    text_norm: str = ""          # normalized, footer-cropped, capped
    text_chars: int = 0          # non-space character count
    text_hash: str = ""          # sha256 hex of text_norm; "" when page has no text
    dhash: Optional[int] = None  # 64-bit perceptual hash; None when render failed


@dataclass
class BlankPage:
    page: int
    confidence: float
    reason: str
    ink_ratio: float
    text_chars: int

    def to_json(self) -> Dict[str, Any]:
        # Keys intentionally match the C# model / frontend expectations.
        return {
            "page": self.page,
            "confidence": round(self.confidence, 2),
            "reason": self.reason,
            "inkRatio": round(self.ink_ratio, 5),
            "textChars": self.text_chars,
        }


@dataclass
class _PageObjects:
    """Cheap structural queries. None = the query failed (unknown)."""
    drawings: Optional[int] = None
    images: Optional[int] = None
    has_annot: bool = False
    has_widget: bool = False


class _WarningSink:
    """Caps warning volume but keeps the true count for `warningCount`."""

    def __init__(self, cap: int = MAX_WARNINGS) -> None:
        self.messages: List[str] = []
        self.total = 0
        self._cap = cap

    def add(self, message: str) -> None:
        self.total += 1
        if len(self.messages) < self._cap:
            self.messages.append(str(message)[:160])


class _RenderOnce:
    """Renders a page at most once; the single grayscale pixmap serves both
    the ink-ratio (blank check) and the dHash (duplicate fingerprint)."""

    __slots__ = ("_page", "_page_no", "_dpi", "_ignore_footer", "_warn", "_img", "_done")

    def __init__(self, page: "fitz.Page", page_no: int, cfg: ScanConfig,
                 warn: Callable[[str], None]) -> None:
        self._page = page
        self._page_no = page_no
        self._dpi = cfg.render_dpi
        self._ignore_footer = cfg.ignore_footer
        self._warn = warn
        self._img: Optional[Image.Image] = None
        self._done = False

    def get(self) -> Optional[Image.Image]:
        if not self._done:
            self._done = True
            self._img = render_gray(self._page, self._dpi, self._ignore_footer)
            if self._img is None:
                self._warn(f"page {self._page_no}: render failed")
        return self._img


def _emit_progress(percent: int) -> None:
    """Opt-in progress on stderr (PROGRESS:nn). See PROGRESS_ENV."""
    if os.environ.get(PROGRESS_ENV, "").lower() in ("", "0", "false"):
        return
    sys.stderr.write(f"PROGRESS:{percent}\n")
    sys.stderr.flush()


# ---------------------------------------------------------------------------
# Phase 1: per-page fingerprinting and blank detection
# ---------------------------------------------------------------------------


def _inspect_page_objects(page: "fitz.Page") -> _PageObjects:
    objects = _PageObjects()
    try:
        objects.drawings = len(page.get_drawings())
    except Exception:
        pass
    try:
        objects.images = len(page.get_images())
    except Exception:
        pass
    try:
        annots = page.annots()
        objects.has_annot = next(annots, None) is not None if annots is not None else False
    except Exception:
        pass
    try:
        objects.has_widget = len(list(page.widgets() or [])) > 0
    except Exception:
        pass
    return objects


def _classify_blank(fp: PageFingerprint, objects: _PageObjects,
                    renderer: _RenderOnce, cfg: ScanConfig) -> Optional[BlankPage]:
    """Decide whether a low-text page is blank.

    Only called when fp.text_chars <= cfg.max_text_chars.

    Pages with embedded images ARE ink-checked: a blank page in a scanned
    PDF is a full-page image of white paper, and the ink ratio is exactly
    what distinguishes it from a page carrying a real logo or photo.
    """
    if objects.has_annot or objects.has_widget:
        return None  # interactive content is never blank

    # Fast path: provably empty page, no render needed.
    if (fp.text_chars == 0
            and objects.drawings == 0
            and objects.images == 0):
        return BlankPage(fp.page, 0.99, "no-text-no-artwork", 0.0, fp.text_chars)

    gray = renderer.get()
    if gray is None:
        return None  # render failed -> stay conservative, never blank
    ink = ink_ratio_from_image(gray)
    if ink <= cfg.max_ink_ratio:
        if ink == 0.0:
            confidence = 0.99
        else:
            confidence = max(0.55, min(0.99, 1.0 - (ink / max(cfg.max_ink_ratio, 1e-9)) * 0.4))
        return BlankPage(fp.page, confidence, "low-ink", ink, fp.text_chars)
    return None


def collect_fingerprints(
    doc: "fitz.Document",
    cfg: ScanConfig,
    warn: Callable[[str], None],
    progress: Optional[Callable[[int], None]] = None,
) -> Tuple[List[PageFingerprint], List[BlankPage], Set[int]]:
    """One pass over the document. Memory stays flat: one pixmap at a time."""
    total = doc.page_count
    fingerprints: List[PageFingerprint] = []
    blanks: List[BlankPage] = []
    blank_pages: Set[int] = set()

    for index in range(total):
        page_no = index + 1
        try:
            page = doc[index]
            text_norm = normalize_text(page_text(page, cfg.ignore_footer))
            fp = PageFingerprint(
                page=page_no,
                text_norm=text_norm[:TEXT_SNIPPET_CHARS],
                text_chars=len(text_norm.replace(" ", "")),
                text_hash=(hashlib.sha256(text_norm.encode("utf-8")).hexdigest()
                           if text_norm else ""),
            )
            renderer = _RenderOnce(page, page_no, cfg, warn)

            if fp.text_chars <= cfg.max_text_chars:
                blank = _classify_blank(fp, _inspect_page_objects(page), renderer, cfg)
                if blank is not None:
                    blanks.append(blank)
                    blank_pages.add(page_no)

            if page_no not in blank_pages:
                gray = renderer.get()
                if gray is not None:
                    try:
                        fp.dhash = dhash(gray)
                    except Exception:
                        fp.dhash = None

            fingerprints.append(fp)
        except Exception as exc:
            # One corrupt page must not kill the whole scan.
            warn(f"page {page_no}: {exc}")
            fingerprints.append(PageFingerprint(page=page_no))

        if progress is not None and total >= 20 and page_no % 10 == 0:
            progress(int(page_no / total * 90))

    return fingerprints, blanks, blank_pages


# ---------------------------------------------------------------------------
# Phase 2: duplicate clustering (pure function -- unit-testable without PDFs)
# ---------------------------------------------------------------------------


class _BKNode:
    __slots__ = ("hash_value", "children")

    def __init__(self, hash_value: int) -> None:
        self.hash_value = hash_value
        self.children: Dict[int, "_BKNode"] = {}


class BKTree:
    """BK-tree over 64-bit hashes for exact radius-limited Hamming queries.

    Replaces the O(n^2) all-pairs comparison: pages pair up via their
    *distinct* hash values, and a radius query returns every hash within
    `dup_hamming` bits -- no false negatives, a fraction of the comparisons.
    """

    def __init__(self) -> None:
        self._root: Optional[_BKNode] = None

    def add(self, hash_value: int) -> None:
        if self._root is None:
            self._root = _BKNode(hash_value)
            return
        node = self._root
        while True:
            distance = hamming(hash_value, node.hash_value)
            if distance == 0:
                return
            child = node.children.get(distance)
            if child is None:
                node.children[distance] = _BKNode(hash_value)
                return
            node = child

    def query(self, hash_value: int, radius: int) -> List[Tuple[int, int]]:
        """All (hash_value, distance) pairs within `radius`, excluding self."""
        found: List[Tuple[int, int]] = []
        if self._root is None:
            return found
        stack = [self._root]
        while stack:
            node = stack.pop()
            distance = hamming(hash_value, node.hash_value)
            if 0 < distance <= radius:
                found.append((node.hash_value, distance))
            low, high = distance - radius, distance + radius
            for edge, child in node.children.items():
                if low <= edge <= high:
                    stack.append(child)
        return found


def _candidate_pairs(pages_by_hash: Dict[int, List[int]],
                     threshold: int) -> List[Tuple[int, int, int]]:
    """All (page_a, page_b, hamming) triples that could join one group.

    Complete: bit-identical dHashes pair up directly at distance 0, and the
    BK-tree radius query provably finds every distinct-hash pair within
    `threshold`. Deterministic: returned sorted.
    """
    pairs: Set[Tuple[int, int, int]] = set()

    # Pages sharing one dHash value are visual twins (distance 0).
    for same_hash in pages_by_hash.values():
        if len(same_hash) > 1:
            for i, page_a in enumerate(same_hash):
                for page_b in same_hash[i + 1:]:
                    pairs.add((page_a, page_b, 0))

    tree = BKTree()
    for hash_value in sorted(pages_by_hash):
        for neighbor_hash, distance in tree.query(hash_value, threshold):
            for page_a in pages_by_hash[hash_value]:
                for page_b in pages_by_hash[neighbor_hash]:
                    pairs.add((min(page_a, page_b), max(page_a, page_b), distance))
        tree.add(hash_value)

    return sorted(pairs)


def _make_text_gate(fp_by_page: Dict[int, PageFingerprint]) -> Callable[[int, int], bool]:
    """dHash cannot tell two text-heavy pages apart (same layout, different
    wording), so pages carrying substantial text must also read alike before
    they may be grouped. Results are memoized: the complete-link check
    re-tests the same pairs, and difflib ratios are the expensive part.
    """
    cache: Dict[Tuple[int, int], bool] = {}

    def similar(page_a: int, page_b: int) -> bool:
        key = (page_a, page_b) if page_a < page_b else (page_b, page_a)
        cached = cache.get(key)
        if cached is not None:
            return cached
        text_a = fp_by_page[page_a].text_norm
        text_b = fp_by_page[page_b].text_norm
        result = True
        if len(text_a) >= TEXT_GATE_MIN_CHARS and len(text_b) >= TEXT_GATE_MIN_CHARS:
            # autojunk=False: popular chars (spaces, 'e') must NOT count as
            # junk -- with it, one-word-drift pages score ~0.2 instead of ~0.99.
            matcher = difflib.SequenceMatcher(None, text_a, text_b, autojunk=False)
            # real_quick_ratio()/quick_ratio() are cheap upper bounds of
            # ratio(); if even the bound misses the threshold, the full
            # ratio() computation is skipped entirely.
            if (matcher.real_quick_ratio() < TEXT_GATE_RATIO
                    or matcher.quick_ratio() < TEXT_GATE_RATIO
                    or matcher.ratio() < TEXT_GATE_RATIO):
                result = False
        cache[key] = result
        return result

    return similar


def cluster_duplicates(fingerprints: List[PageFingerprint],
                       blank_pages: Set[int],
                       cfg: ScanConfig) -> List[Dict[str, Any]]:
    """Cluster non-blank pages into duplicate groups with complete-link
    semantics: every pair inside a group is visually within `dup_hamming`
    AND passes the text gate (no A~B~C chaining where A and C differ wildly).
    """
    fp_by_page = {fp.page: fp for fp in fingerprints}
    eligible = [fp for fp in fingerprints
                if fp.page not in blank_pages and fp.dhash is not None]
    if len(eligible) < 2:
        return []

    pages_by_hash: Dict[int, List[int]] = {}
    for fp in eligible:
        pages_by_hash.setdefault(fp.dhash, []).append(fp.page)
    hash_of = {fp.page: fp.dhash for fp in eligible}

    text_similar = _make_text_gate(fp_by_page)
    parent = {fp.page: fp.page for fp in eligible}
    members: Dict[int, Set[int]] = {fp.page: {fp.page} for fp in eligible}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path halving
            x = parent[x]
        return x

    def complete_link_ok(cluster_a: Set[int], cluster_b: Set[int]) -> bool:
        for x in cluster_a:
            hash_x = hash_of[x]
            for y in cluster_b:
                if hamming(hash_x, hash_of[y]) > cfg.dup_hamming:
                    return False
                if not text_similar(x, y):
                    return False
        return True

    for page_a, page_b, distance in _candidate_pairs(pages_by_hash, cfg.dup_hamming):
        if distance > cfg.dup_hamming:  # defensive; candidates are pre-filtered
            continue
        root_a, root_b = find(page_a), find(page_b)
        if root_a == root_b:
            continue
        if not text_similar(page_a, page_b):
            continue
        if not complete_link_ok(members[root_a], members[root_b]):
            continue
        parent[root_b] = root_a
        members[root_a] |= members[root_b]
        del members[root_b]

    # Assemble output groups. "exact" = identical text across the group AND
    # worst pair within the tight exact threshold; everything else "near".
    clusters: Dict[int, List[int]] = {}
    for fp in eligible:
        clusters.setdefault(find(fp.page), []).append(fp.page)

    groups: List[Dict[str, Any]] = []
    for cluster in clusters.values():
        if len(cluster) < 2:
            continue
        cluster.sort()
        distinct_texts = {fp_by_page[p].text_norm for p in cluster}
        max_distance = max(
            hamming(hash_of[x], hash_of[y])
            for i, x in enumerate(cluster) for y in cluster[i + 1:]
        )
        is_exact = len(distinct_texts) == 1 and max_distance <= cfg.exact_hamming
        groups.append({
            "pages": cluster,
            "kind": "exact" if is_exact else "near",
            "similarity": round(1.0 - max_distance / DHASH_BITS, 3),
        })
    groups.sort(key=lambda g: (g["pages"][0], len(g["pages"])))
    return groups


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def _failure(code: str, message: str) -> Dict[str, Any]:
    return {"success": False, "code": code, "error": message}


def scan_pdf(pdf_path: str, preset: Optional[str] = None,
             options: Optional[dict] = None) -> Dict[str, Any]:
    """Scan one PDF. Returns the result dict -- never raises for expected
    failures (encrypted, empty, oversized); the caller decides status."""
    cfg = resolve_config(preset, options)
    preset_name = (preset or "balanced").lower()
    if preset_name not in PRESETS:
        preset_name = "balanced"

    doc = None
    try:
        try:
            doc = fitz.open(pdf_path)
        except Exception as exc:
            message = str(exc)
            if "password" in message.lower() or "encrypt" in message.lower():
                return _failure("ENCRYPTED",
                                "ENCRYPTED: This PDF is password-protected. Unlock it first.")
            return _failure("OPEN_FAILED", f"Could not open PDF: {exc}")

        # needs_pass=True means no/wrong password supplied and the document
        # cannot be read. (is_encrypted alone can still be readable, e.g.
        # owner-locked with an empty user password -- do not block those.)
        try:
            needs_pass = bool(doc.needs_pass)
        except Exception:
            needs_pass = False
        if needs_pass:
            return _failure("ENCRYPTED",
                            "ENCRYPTED: This PDF is password-protected. Unlock it first.")

        total = doc.page_count
        if total <= 0:
            return _failure("EMPTY", "PDF has no pages.")
        if total > MAX_PAGES:
            return _failure("PAGE_LIMIT",
                            f"PDF has {total} pages (limit {MAX_PAGES}). Split it and scan in parts.")

        sink = _WarningSink()
        fingerprints, blanks, blank_pages = collect_fingerprints(
            doc, cfg, sink.add, _emit_progress)
        groups = cluster_duplicates(fingerprints, blank_pages, cfg)
        _emit_progress(100)

        result: Dict[str, Any] = {
            "success": True,
            "pageCount": total,
            "preset": preset_name,
            "blanks": [blank.to_json() for blank in blanks],
            "groups": groups,
        }
        if sink.messages:
            result["warnings"] = sink.messages
            if sink.total > len(sink.messages):
                result["warningCount"] = sink.total
        return result
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        return 1

    request_path = sys.argv[1]
    try:
        with open(request_path, "r", encoding="utf-8") as fh:
            request = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"success": False, "error": f"Invalid request file: {exc}"}))
        return 1
    if not isinstance(request, dict):
        print(json.dumps({"success": False, "error": "Invalid request: expected a JSON object."}))
        return 1

    pdf_path = request.get("file_path")
    preset = request.get("preset", "balanced")
    options = request.get("options")

    if not pdf_path or not os.path.exists(pdf_path):
        print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
        return 1

    # Keep stdout pristine: the host parses the ENTIRE stdout as one JSON
    # document, so any library print during the scan would corrupt the
    # payload. Stray writes are diverted to stderr until the result is out.
    real_stdout = sys.stdout
    sys.stdout = sys.stderr
    exit_code = 0
    try:
        result = scan_pdf(pdf_path, preset, options)
    except Exception as exc:  # last-resort guard for the harness
        result = _failure("UNEXPECTED", f"Processing error: {exc}")
        exit_code = 1
    finally:
        sys.stdout = real_stdout

    print(json.dumps(result))
    return exit_code

if __name__ == "__main__":
    sys.exit(main())
