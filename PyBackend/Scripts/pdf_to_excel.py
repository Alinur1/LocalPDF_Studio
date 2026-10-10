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
import io
import re
import json
import time
import unicodedata
import pymupdf as fitz


FLAVORS = ("auto", "lattice", "stream", "hybrid")
FORMATS = ("xlsx", "csv")

LATTICE_SETTINGS = {"vertical_strategy": "lines", "horizontal_strategy": "lines",
                    "text_x_tolerance": 3, "text_y_tolerance": 3}
# Ruled rows but no vertical lines (typical financial statements).
HYBRID_SETTINGS = {"vertical_strategy": "text", "horizontal_strategy": "lines",
                   "text_x_tolerance": 6, "text_y_tolerance": 3}
STREAM_SETTINGS = {"vertical_strategy": "text", "horizontal_strategy": "text",
                   "text_x_tolerance": 6, "text_y_tolerance": 3}

MAX_CELL_CHARS = 32767          # Excel hard limit per cell
PAGE_TIME_BUDGET = 20.0         # soft budget (s): skip further fallbacks once exceeded
SHREDDED_CELL_THRESHOLD = 3     # cells per page before warning


# ------------------------------------------------------------
# Page selection
# ------------------------------------------------------------

def page_list(total_pages, pages, page_ranges):
    selected = set()
    if not pages and not page_ranges:
        return list(range(total_pages))
    if pages:
        for p in pages:
            try:
                if 1 <= int(p) <= total_pages:
                    selected.add(int(p) - 1)
            except (ValueError, TypeError):
                continue
    if page_ranges:
        for range_str in page_ranges:
            try:
                if '-' in str(range_str):
                    s, e = str(range_str).split('-', 1)
                    for p in range(int(s.strip()), int(e.strip()) + 1):
                        if 1 <= p <= total_pages:
                            selected.add(p - 1)
                elif 1 <= int(str(range_str).strip()) <= total_pages:
                    selected.add(int(str(range_str).strip()) - 1)
            except (ValueError, TypeError):
                continue
    return sorted(selected)


# ------------------------------------------------------------
# Text cleaning
# ------------------------------------------------------------

# Control characters illegal in XML 1.0 (and therefore in XLSX cells).
ILLEGAL_CHARS_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")

# NBSP-like spaces -> plain space; soft hyphen and zero-width space removed.
# ZWJ (U+200D) and ZWNJ (U+200C) are deliberately KEPT: they are meaningful
# in Bengali and other Indic scripts and in Persian.
TEXT_TRANSLATE = {0x00A0: " ", 0x2007: " ", 0x202F: " ", 0x00AD: None, 0x200B: None}

# Non-ASCII decimal digits -> ASCII (Arabic-Indic, Extended Arabic-Indic,
# Devanagari, Bengali). Used only for number detection / coercion.
DIGIT_MAP = {}
for _base in (0x0660, 0x06F0, 0x0966, 0x09E6):
    for _i in range(10):
        DIGIT_MAP[_base + _i] = ord("0") + _i

# Script ranges for complex-text handling, mirroring the watermark CJK
# ranges. JOIN: scripts with no intra-word spaces, where a space between
# single-cluster tokens inside a table cell is certainly a positioning
# artifact. NOTE: spaced languages — only detection + warning, never auto-join.
JOIN_RANGES = [
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana
    (0x3400, 0x4DBF),  # CJK Extension A
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
]
NOTE_RANGES = JOIN_RANGES + [
    (0x0900, 0x097F),  # Devanagari (Hindi, Marathi, ...)
    (0x0980, 0x09FF),  # Bengali
    (0xAC00, 0xD7AF),  # Hangul Syllables (spaced language: note only)
]


def in_ranges(cp, ranges):
    return any(lo <= cp <= hi for lo, hi in ranges)


def cluster_len(text):
    n = 0
    for ch in text:
        if n == 0 or (unicodedata.combining(ch) == 0 and unicodedata.category(ch) not in ("Mn", "Mc", "Me")):
            n += 1
    return n


def repair(value):
    """Join CJK tokens that were split by positioning artifacts."""
    if not isinstance(value, str) or " " not in value:
        return value
    toks = [t for t in value.split(" ") if t != ""]
    if len(toks) < 2:
        return value
    if all(cluster_len(t) == 1
           and all(in_ranges(ord(c), JOIN_RANGES) for c in t)
           for t in toks):
        return "".join(toks)
    return value


def clean_cell(value):
    """Sanitize one cell: illegal chars, odd spaces, per-line trim, CJK repair, length cap."""
    if not isinstance(value, str):
        return "" if value is None else value
    s = ILLEGAL_CHARS_RE.sub("", value).translate(TEXT_TRANSLATE)
    lines = [repair(ln.strip()) for ln in s.splitlines()]
    s = "\n".join(ln for ln in lines if ln != "")
    if len(s) > MAX_CELL_CHARS:
        s = s[:MAX_CELL_CHARS]
    return s


def looks_shredded(cell):
    """True when ONE cell holds many spaced single-cluster letters
    (glyph-by-glyph emission). Digits and legitimate single-character
    cells (男/女, 원, serial numbers) do not trigger this."""
    if not isinstance(cell, str):
        return False
    toks = cell.split()
    if len(toks) < 3:
        return False
    singles = 0
    for t in toks:
        if (cluster_len(t) == 1
                and unicodedata.category(t[0]) in ("Lo", "Mn", "Mc")
                and in_ranges(ord(t[0]), NOTE_RANGES)):
            singles += 1
    return singles / len(toks) >= 0.6


def shredded_cells(tables):
    return sum(1 for table in tables for row in table for c in row if looks_shredded(c))


def clean(raw):
    """Normalize one pdfplumber table: pad ragged rows, clean text, drop
    fully-empty rows/columns. Returns list-of-lists (all str) or None.
    Pure Python (no pandas)."""
    if not raw:
        return None
    width = max(len(r) for r in raw)
    if width == 0:
        return None
    norm = []
    for row in raw:
        padded = list(row) + [None] * (width - len(row))
        norm.append([clean_cell(c) for c in padded])
    rows = [r for r in norm if any(c != "" for c in r)]
    if not rows:
        return None
    keep = [c for c in range(width) if any(r[c] != "" for r in rows)]
    if not keep:
        return None
    return [[r[c] for c in keep] for r in rows]


def is_plausible(table, min_rows=2, min_cols=2, min_fill=0.35,
                 max_avg_len=60, min_multi=0.5):
    """Reject prose pages and 1x1 callout boxes mis-detected as tables."""
    if not table or len(table) < min_rows or len(table[0]) < min_cols:
        return False
    total = sum(len(r) for r in table)
    filled = [c for r in table for c in r if str(c).strip()]
    if not total or not filled or len(filled) / total < min_fill:
        return False
    if sum(len(str(c)) for c in filled) / len(filled) > max_avg_len:
        return False
    # Real tables have rows with several populated cells; paragraphs don't.
    multi = sum(1 for r in table if sum(1 for c in r if str(c).strip()) >= 2)
    return multi / len(table) >= min_multi


# ------------------------------------------------------------
# Numbers (opt-in) and header detection
# ------------------------------------------------------------

NUM_RE = re.compile(r"^[-+]?([0-9]{1,3}(,[0-9]{3})+|[0-9]+)(\.[0-9]+)?$")


def numeric_text(s):
    """Return (ascii_core, is_parenthesised_negative) if `s` looks like a
    plain number, else None. Accepts Bengali/Devanagari/Arabic digits."""
    t = s.strip().translate(DIGIT_MAP)
    paren = t.startswith("(") and t.endswith(")")
    if paren:
        t = t[1:-1].strip()
    elif t.startswith("(") or t.endswith(")"):
        return None
    if not NUM_RE.match(t):
        return None
    return t, paren


def coerce(value):
    """Conservative text -> number. Keeps leading-zero IDs, phone-like and
    >15-digit values as text. US-style separators only (1,234.56)."""
    if not isinstance(value, str) or "\n" in value:
        return value
    parsed = numeric_text(value)
    if parsed is None:
        return value
    t, paren = parsed
    digits = re.sub(r"[^0-9]", "", t)
    if len(digits) > 15:
        return value
    int_part = t.lstrip("+-").split(".")[0].replace(",", "")
    if len(int_part) > 1 and int_part[0] == "0":
        return value
    clean = t.replace(",", "")
    n = float(clean) if "." in clean else int(clean)
    return -abs(n) if paren else n


def is_header(rows):
    """Heuristic: first row is a header if the table has 2+ rows and at
    least half of its non-empty cells are non-numeric text."""
    if len(rows) < 2:
        return False
    cells = [c for c in rows[0] if isinstance(c, str) and c.strip()]
    if not cells:
        return False
    textual = sum(1 for c in cells if numeric_text(c) is None)
    return textual / len(cells) >= 0.5


# ------------------------------------------------------------
# Extraction
# ------------------------------------------------------------

def strategies(flavor):
    if flavor == "lattice":
        return [("lattice", LATTICE_SETTINGS)]
    if flavor == "stream":
        return [("stream", STREAM_SETTINGS)]
    if flavor == "hybrid":
        return [("hybrid", HYBRID_SETTINGS)]
    return [("lattice", LATTICE_SETTINGS),
            ("hybrid", HYBRID_SETTINGS),
            ("stream", STREAM_SETTINGS)]


def extract_page(page, flavor, page_num, errors, slow_pages):
    """Try each strategy until one yields at least one PLAUSIBLE table.
    A spurious lattice box therefore no longer blocks the fallbacks.
    Returns (tables, strategy_name_or_None)."""
    started = time.monotonic()
    strategies_list = strategies(flavor)
    for i, (name, settings) in enumerate(strategies_list):
        if i > 0 and time.monotonic() - started > PAGE_TIME_BUDGET:
            slow_pages.append(page_num)
            break
        try:
            raw_tables = page.extract_tables(table_settings=dict(settings)) or []
        except Exception as e:
            errors.append((page_num, str(e)[:80]))
            continue
        good = []
        for raw in raw_tables:
            t = clean(raw)
            if t and is_plausible(t):
                good.append(t)
        if good:
            return good, name
    return [], None


def norm_row(row):
    return [str(c).strip().lower() for c in row]


def merge_continuations(sheets):
    """Merge a table that starts a page into the table that ended the
    previous page when the pages are consecutive and column counts match.
    A repeated header row is dropped."""
    merged = []
    for sheet in sheets:
        if merged:
            prev_sheet = merged[-1]
            prev = prev_sheet["tables"][-1]
            first = sheet["tables"][0]
            if (sheet["pages"][0] == prev_sheet["pages"][-1] + 1
                    and prev["rows"] and first["rows"]
                    and len(first["rows"][0]) == len(prev["rows"][0])):
                rows = first["rows"]
                if prev["header"] and norm_row(rows[0]) == norm_row(prev["rows"][0]):
                    rows = rows[1:]
                prev["rows"].extend(rows)
                prev_sheet["tables"].extend(sheet["tables"][1:])
                prev_sheet["pages"].append(sheet["pages"][0])
                continue
        merged.append({"pages": list(sheet["pages"]), "tables": list(sheet["tables"])})
    return merged


def label(pages):
    return f"Page_{pages[0]}" if len(pages) == 1 else f"Page_{pages[0]}-{pages[-1]}"


# ------------------------------------------------------------
# Writers
# ------------------------------------------------------------

def display_width(val):
    if val is None or val == "":
        return 0
    if not isinstance(val, str):
        return len(str(val))
    best = 0
    for line in val.split("\n"):
        w = sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in line)
        if w > best:
            best = w
    return best


def write_xlsx(sheets, fh):
    """Write workbook to an open binary file handle. Returns the number of
    cells that began with '=' and were stored as literal text."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    wrap = Alignment(wrap_text=True, vertical="top")
    escaped = 0

    for sheet in sheets:
        ws = wb.create_sheet(title=label(sheet["pages"]))
        widths = {}
        row = 1
        for ti, table in enumerate(sheet["tables"]):
            if ti > 0:
                row += 1
            for ri, trow in enumerate(table["rows"]):
                for ci, val in enumerate(trow):
                    cell = ws.cell(row=row, column=ci + 1, value=val)
                    # openpyxl turns any string starting with "=" into a live
                    # formula. Force literal text (formula-injection guard).
                    if isinstance(val, str) and val.startswith("="):
                        cell.data_type = "s"
                        escaped += 1
                    cell.alignment = wrap
                    if table["header"] and ri == 0:
                        cell.font = header_font
                        cell.fill = header_fill
                    w = display_width(val)
                    if w > widths.get(ci, 0):
                        widths[ci] = w
                row += 1
        for ci, w in widths.items():
            ws.column_dimensions[get_column_letter(ci + 1)].width = min(max(w + 2, 10), 50)
        if sheet["tables"] and sheet["tables"][0]["header"]:
            ws.freeze_panes = "A2"
    wb.save(fh)
    return escaped


NUMERIC_LIKE_RE = re.compile(r"^[+-]?[\d.,]+$")


def csv_safe(v):
    """Neutralize spreadsheet formulas in CSV: prefix risky strings with '.
    Genuine numeric strings (e.g. -5, +1,234.5) are left alone."""
    if v is None:
        return "", False
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r") \
            and not NUMERIC_LIKE_RE.match(v):
        return "'" + v, True
    return v, False


def csv_text(rows):
    import csv as _csv
    buf = io.StringIO(newline="")
    writer = _csv.writer(buf)
    escaped = 0
    for row in rows:
        out = []
        for v in row:
            safe, changed = csv_safe(v)
            escaped += 1 if changed else 0
            out.append(safe)
        writer.writerow(out)
    # UTF-8 BOM: without it Excel on Windows misdetects the encoding
    # (Bengali/CJK shown as mojibake). LibreOffice and parsers handle it.
    return "\ufeff" + buf.getvalue(), escaped


def csv_entries(sheets):
    """Yield (filename, rows) for every table."""
    for sheet in sheets:
        p = sheet["pages"]
        stem = f"page_{p[0]:03d}" if len(p) == 1 else f"pages_{p[0]:03d}-{p[-1]:03d}"
        many = len(sheet["tables"]) > 1
        for ti, table in enumerate(sheet["tables"], 1):
            yield (f"{stem}_table_{ti}.csv" if many else f"{stem}.csv"), table["rows"]


def write_csv_files(sheets, output_dir):
    """Write one .csv file per table into output_dir. Returns (error, escaped, files).
    CSV bytes are identical to the former write_csv_zip entries (UTF-8 with BOM,
    same csv_text content); only the zip container moved to C#."""
    try:
        os.makedirs(output_dir, exist_ok=True)
    except Exception as e:
        return str(e) or e.__class__.__name__, 0, []
    escaped = 0
    written = []
    for name, rows in csv_entries(sheets):
        text, esc = csv_text(rows)
        escaped += esc
        dest = os.path.join(output_dir, name)
        tmp = dest + ".part"
        try:
            with open(tmp, "w", encoding="utf-8", newline="") as fh:
                fh.write(text)
            os.replace(tmp, dest)
            written.append(name)
        except Exception as e:
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except OSError:
                pass
            # Best-effort cleanup of already-written files on failure.
            for done in written:
                try:
                    os.remove(os.path.join(output_dir, done))
                except OSError:
                    pass
            return str(e) or e.__class__.__name__, 0, []
    return "", escaped, written


def atomic_write(output_path, writer_fn):
    """Write to <output>.part then os.replace(), so a failed write never
    leaves a corrupt file at the destination. Returns (error, result)."""
    tmp = output_path + ".part"
    try:
        with open(tmp, "wb") as fh:
            result = writer_fn(fh)
        os.replace(tmp, output_path)
        return "", result
    except Exception as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return str(e) or e.__class__.__name__, 0


# ------------------------------------------------------------
# Notes / errors
# ------------------------------------------------------------

def page_summary(pages, limit=8):
    shown = ", ".join(str(p) for p in pages[:limit])
    rest = len(pages) - limit
    return shown + (f", +{rest} more" if rest > 0 else "")


def is_password_error(exc):
    name = type(exc).__name__.lower()
    text = (repr(exc) + " " + str(exc)).lower()
    return "password" in name or "password" in text or "encrypt" in text


def is_locked(pdf_path):
    """Cheap pre-check via PyMuPDF; pdfminer's password exception often has
    an empty message, so message sniffing alone is unreliable."""
    try:
        d = fitz.open(pdf_path)
        try:
            return bool(d.needs_pass)
        finally:
            d.close()
    except Exception:
        return False


ENCRYPTED_ERROR = "ENCRYPTED: This PDF is password-protected. Unlock it first."


# ------------------------------------------------------------
# Main conversion
# ------------------------------------------------------------

def convert(pdf_path, output_path, pages=None, page_ranges=None, flavor="auto", fmt="xlsx",
            coerce_numbers=False, merge_continuations=False):
    try:
        import pdfplumber
    except ImportError:
        return {"success": False, "error": "Table engine unavailable (pdfplumber missing).",
                "missingDependencies": ["pdfplumber"]}
    flavor = (flavor or "auto").lower()
    if flavor not in FLAVORS:
        flavor = "auto"
    fmt = (fmt or "xlsx").lower()
    if fmt not in FORMATS:
        fmt = "xlsx"
    if fmt == "xlsx":
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            return {"success": False, "error": "XLSX engine unavailable (openpyxl missing).",
                    "missingDependencies": ["openpyxl"]}

    if is_locked(pdf_path):
        return {"success": False, "error": ENCRYPTED_ERROR}
    try:
        pdf = pdfplumber.open(pdf_path)
    except Exception as e:
        if is_password_error(e):
            return {"success": False, "error": ENCRYPTED_ERROR}
        return {"success": False, "error": f"Could not open PDF: {e or e.__class__.__name__}"}

    try:
        total = len(pdf.pages)
        idx = page_list(total, pages, page_ranges)
        if not idx:
            return {"success": False, "error": "No valid pages selected."}

        sheets = []
        used = {}
        errors = []
        slow_pages = []
        pg_scanned, pg_notables, pg_shredded = [], [], []

        for n, pi in enumerate(idx):
            page = pdf.pages[pi]
            page_num = pi + 1
            tables, strategy = extract_page(page, flavor, page_num, errors, slow_pages)
            if tables:
                used[strategy] = used.get(strategy, 0) + 1
                sheets.append({
                    "pages": [page_num],
                    "tables": [{"rows": t, "header": is_header(t)} for t in tables],
                })
                if shredded_cells(tables) >= SHREDDED_CELL_THRESHOLD:
                    pg_shredded.append(page_num)
            else:
                try:
                    has_text = bool((page.extract_text() or "").strip())
                except Exception:
                    has_text = True
                (pg_notables if has_text else pg_scanned).append(page_num)
            try:
                page.flush_cache()   # keep memory flat on large PDFs
            except Exception:
                pass
            if len(idx) >= 5 and (n + 1) % 5 == 0:
                sys.stderr.write(f"PROGRESS:{int(((n + 1) / len(idx)) * 80)}\n")

        # Aggregate notes (one line per category, not one per page).
        notes = []
        if pg_scanned:
            notes.append(f"{len(pg_scanned)} page(s) have no extractable text (scanned? OCR them first): "
                         f"{page_summary(pg_scanned)}")
        if pg_notables:
            notes.append(f"{len(pg_notables)} page(s) contain text but no table was detected: "
                         f"{page_summary(pg_notables)}")
        if pg_shredded:
            notes.append(f"{len(pg_shredded)} page(s) store complex-script text glyph-by-glyph in the source PDF; "
                         f"words may show extra spaces (numbers and table structure are unaffected): "
                         f"{page_summary(pg_shredded)}")
        if errors:
            err_pages = sorted({p for p, _ in errors})
            notes.append(f"table detection raised errors on {len(err_pages)} page(s) "
                         f"({page_summary(err_pages)}); first error: {errors[0][1]}")
        if slow_pages:
            notes.append(f"slow pages skipped remaining fallback strategies: "
                         f"{page_summary(sorted(set(slow_pages)))}")

        if not sheets:
            return {"success": False, "error": "No extractable tables found in the selected pages.",
                    "notes": notes, "pageCount": total, "tableCount": 0}

        if merge_continuations and len(sheets) > 1:
            before = sum(len(s["tables"]) for s in sheets)
            sheets = merge_continuations(sheets)
            after = sum(len(s["tables"]) for s in sheets)
            if after < before:
                notes.append(f"merged {before - after} continuation table(s) across pages")

        if coerce_numbers:
            for sheet in sheets:
                for table in sheet["tables"]:
                    start = 1 if table["header"] else 0
                    for r in range(start, len(table["rows"])):
                        table["rows"][r] = [coerce(c) for c in table["rows"][r]]

        table_total = sum(len(s["tables"]) for s in sheets)

        out_path = output_path
        output_kind = fmt
        files = []
        if fmt == "xlsx":
            write_err, escaped = atomic_write(
                out_path, lambda fh: write_xlsx(sheets, fh))
        else:
            # CSV files are written individually; C# creates the zip archive.
            output_kind = "csv"
            write_err, escaped, files = write_csv_files(sheets, out_path)

        if write_err:
            return {"success": False, "error": f"Could not write {fmt.upper()}: {write_err}",
                    "notes": notes, "pageCount": total, "tableCount": table_total}
        if escaped:
            notes.append(f"{escaped} cell(s) starting with '=', '+', '-' or '@' were stored as literal text "
                         "so they cannot run as spreadsheet formulas")

        sys.stderr.write("PROGRESS:100\n")
        result = {"success": True, "pageCount": total, "tableCount": table_total,
                "sheetCount": len(sheets), "flavor": flavor, "strategiesUsed": used,
                "format": fmt, "outputKind": output_kind, "notes": notes, "output": out_path}
        if fmt == "csv":
            result["files"] = files
        return result
    finally:
        try:
            pdf.close()
        except Exception:
            pass


class pdf_to_excel:
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
        output_path = request.get("output_path")
        if not pdf_path or not os.path.exists(pdf_path):
            print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
            sys.exit(1)
        if not output_path:
            print(json.dumps({"success": False, "error": "No output path provided"}))
            sys.exit(1)
        result = convert(
            pdf_path, output_path,
            pages=request.get("pages"),
            page_ranges=request.get("page_ranges"),
            flavor=request.get("flavor", "auto"),
            fmt=request.get("format", "xlsx"),
            coerce_numbers=bool(request.get("coerce_numbers", False)),
            merge_continuations=bool(request.get("merge_continuations", False)),
        )
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
        sys.exit(1)
