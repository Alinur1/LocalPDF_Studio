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

import mmap
import os
import re
import zlib

try:
    import pikepdf
except Exception:
    pikepdf = None


ALLOWED_CATEGORIES = [
    "docinfo",
    "xmp",
    "trailer-id",
    "history",
    "javascript",
    "embedded-files",
    "layers",
    "annotations",
    "form-fields",
    "image-metadata",
    "fonts",
]

MAX_OBJECTS = 3_000_000          # hard cap on objects visited per traversal
MAX_ERRORS_KEPT = 25             # keep the first N error messages
_ACTIVE_ACTIONS = ("JavaScript", "Launch", "SubmitForm", "ImportData")
_ATTACH_SUBTYPES = ("FileAttachment", "Sound", "RichMedia")
_KEEP_SUBTYPES = ("Widget", "Link") + _ATTACH_SUBTYPES  # not part of the "annotations" category
_FONT_FILE_KEYS = ("/FontFile", "/FontFile2", "/FontFile3")


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def blank_findings():
    return {k: {"key": k, "found": False, "count": 0, "detail": ""} for k in ALLOWED_CATEGORIES}


class _Errors:
    """Collects problems so callers can report `incomplete` instead of a false 'clean'."""

    def __init__(self):
        self.items = []
        self.total = 0

    def add(self, msg):
        self.total += 1
        if len(self.items) < MAX_ERRORS_KEPT:
            self.items.append(str(msg)[:200])

    def __bool__(self):
        return self.total > 0


def _otype(o):
    return getattr(o, "_type_code", None)


def _is_stream(o):
    return _otype(o) == pikepdf.ObjectType.stream


def _is_dict(o):
    return _otype(o) in (pikepdf.ObjectType.dictionary, pikepdf.ObjectType.stream)


def _is_array(o):
    return _otype(o) == pikepdf.ObjectType.array


def _nm(v):
    """Name object -> bare string ('/Foo' -> 'Foo'); anything else -> None."""
    if v is not None and _otype(v) == pikepdf.ObjectType.name_:
        return str(v)[1:]
    return None


def _obj_key(obj):
    """Stable identity for INDIRECT objects only.

    Direct objects return None. pikepdf creates a fresh wrapper per access, so id()
    is not stable (addresses get reused), and direct objects cannot form cycles anyway.
    """
    try:
        og = tuple(obj.objgen)
        if og != (0, 0):
            return ("indirect", og)
    except Exception:
        pass
    return None


def _items(arr):
    return list(arr) if arr is not None and _is_array(arr) else []


def _engine_check(pdf):
    """Return an error message when the pikepdf build lacks APIs the engine relies on."""
    try:
        t = pikepdf.ObjectType
        for member in ("name_", "dictionary", "stream", "array"):
            if not hasattr(t, member):
                raise ValueError(f"ObjectType.{member} is missing")
        _ = pdf.Root._type_code
        if not hasattr(pikepdf, "parse_content_stream") or not hasattr(pikepdf, "unparse_content_stream"):
            raise ValueError("content stream parser is missing")
    except Exception as e:
        return f"Metadata scrub engine incompatible with the installed pikepdf build: {e}"
    return None


def walk(pdf, visitor, errs):
    """Visit every reachable Dictionary, Stream and Array exactly once.

    - Streams are visited (the visitor receives the stream; use dict-style access on it).
    - Iterative and cycle-safe (indirect objects are de-duplicated; direct ones cannot cycle).
    - Visitor failures are recorded in `errs`, never swallowed silently.
    """
    stack = [pdf.Root]
    seen = set()
    visited = 0
    while stack:
        obj = stack.pop()
        try:
            t = _otype(obj)
            is_stream = t == pikepdf.ObjectType.stream
            is_dict = is_stream or t == pikepdf.ObjectType.dictionary
            is_array = t == pikepdf.ObjectType.array
        except Exception as e:
            errs.add(f"walk/type: {e}")
            continue
        if not (is_dict or is_array):
            continue
        key = _obj_key(obj)
        if key is not None:
            if key in seen:
                continue
            seen.add(key)
        visited += 1
        if visited > MAX_OBJECTS:
            errs.add(f"object limit ({MAX_OBJECTS}) reached; traversal stopped early")
            break
        try:
            visitor(obj, is_dict)
        except Exception as e:
            errs.add(f"visitor: {e}")
        try:
            if is_stream:
                children = list(obj.stream_dict.values())
            elif is_dict:
                children = list(obj.values())
            else:
                children = list(obj)
        except Exception as e:
            errs.add(f"children: {e}")
            continue
        stack.extend(children)


def _pages(pdf, errs):
    try:
        return list(pdf.pages)
    except Exception as e:
        errs.add(f"page tree: {e}")
        return []


def _inherited(node, key):
    """Look up an inheritable attribute (/Resources, /FT ...) through /Parent."""
    hops = 0
    while node is not None and hops < 64:
        try:
            v = node.get(key)
        except Exception:
            return None
        if v is not None:
            return v
        try:
            node = node.get("/Parent")
        except Exception:
            return None
        hops += 1
    return None


# --------------------------------------------------------------------------- #
# Version history (prior incremental saves)
# --------------------------------------------------------------------------- #

_STARTXREF_RE = re.compile(rb"startxref\s+(\d+)\s+%%EOF")


def _count_prior_versions(pdf_path):
    """Count real prior revisions.

    Only `startxref <offset> %%EOF` trailers whose offset actually points at an xref
    table / xref-stream object are counted, which avoids false positives from embedded
    PDFs or compressed data. Linearized files' leading `startxref 0` is ignored.
    The file is memory-mapped, not read into RAM.
    """
    size = os.path.getsize(pdf_path)
    if size == 0:
        return 0
    real = 0
    with open(pdf_path, "rb") as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            for m in _STARTXREF_RE.finditer(mm):
                off = int(m.group(1))
                if off <= 0 or off >= size:
                    continue
                head = mm[off:off + 32].lstrip()
                if head.startswith(b"xref") or head[:1].isdigit():
                    real += 1
    return max(real - 1, 0)


# --------------------------------------------------------------------------- #
# JPEG metadata
# --------------------------------------------------------------------------- #

def _jpeg_metadata_spans(data):
    """Byte spans of APP1 (EXIF/XMP), APP3-APP15 (except APP14/Adobe) and COM segments."""
    spans = []
    n = len(data)
    if n < 4 or data[0] != 0xFF or data[1] != 0xD8:
        return spans
    i = 2
    while i + 4 <= n:
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            i += 2
            continue
        if marker == 0xD9:
            break
        seg_len = (data[i + 2] << 8) | data[i + 3]
        if seg_len < 2:
            break
        seg_end = i + 2 + seg_len
        if seg_end > n:
            break
        if marker in (0xE1, 0xFE) or (0xE3 <= marker <= 0xEF and marker != 0xEE):
            spans.append((i, seg_end))
        i = seg_end
        if marker == 0xDA:  # skip entropy-coded data quickly (C-speed find, not a byte loop)
            while True:
                j = data.find(b"\xff", i)
                if j == -1 or j + 1 >= n:
                    return spans
                nxt = data[j + 1]
                if nxt == 0x00 or 0xD0 <= nxt <= 0xD7:
                    i = j + 2
                    continue
                if nxt == 0xFF:
                    i = j + 1
                    continue
                i = j
                break
    return spans


def _strip_jpeg_metadata(data):
    spans = _jpeg_metadata_spans(data)
    if not spans:
        return None
    out = bytearray()
    last = 0
    for start, end in spans:
        out += data[last:start]
        last = end
    out += data[last:]
    return bytes(out)


def _single_filter(obj):
    """Return list of filter names on a stream."""
    filt = obj.get("/Filter")
    if filt is None:
        return []
    if _is_array(filt):
        return [_nm(x) for x in filt]
    return [_nm(filt)]


# --------------------------------------------------------------------------- #
# Form fields / signatures
# --------------------------------------------------------------------------- #

def _iter_fields(pdf, errs=None):
    """All fields reachable from /AcroForm /Fields (cycle-safe, iterative)."""
    result = []
    try:
        acro = pdf.Root.get("/AcroForm")
        if acro is None:
            return result
        stack = _items(acro.get("/Fields"))
        seen = set()
        while stack and len(result) < MAX_OBJECTS:
            f = stack.pop()
            if not _is_dict(f):
                continue
            key = _obj_key(f)
            if key is not None:
                if key in seen:
                    continue
                seen.add(key)
            result.append(f)
            stack.extend(_items(f.get("/Kids")))
    except Exception as e:
        if errs is not None:
            errs.add(f"form fields: {e}")
    return result


def _has_value(f):
    v = f.get("/V")
    if v is None:
        return False
    nm = _nm(v)
    if nm is not None:
        return nm != "Off"
    if _is_array(v):
        return len(v) > 0
    try:
        return str(v).strip() != ""
    except Exception:
        return True


# --------------------------------------------------------------------------- #
# Optional content (layers)
# --------------------------------------------------------------------------- #

def _ocg_key(ocg):
    k = _obj_key(ocg)
    if k is None:
        raise ValueError("direct (non-indirect) OCG cannot be resolved")
    return k


def _ocg_off_keys(pdf):
    """Return (set of OCG keys that are OFF in the default view, /OCProperties or None).

    Honors /BaseState (ON, OFF, Unchanged -> treated as ON), /ON, /OFF and the
    /View ViewState usage applied through /AS. /RBGroups only constrains user toggling
    and does not change the initial state, so it is deliberately ignored.
    """
    ocprops = pdf.Root.get("/OCProperties")
    off = set()
    if ocprops is None:
        return off, None
    d = ocprops.get("/D")
    if d is None:
        return off, ocprops

    def keys(arr):
        out = set()
        for it in _items(arr):
            k = _obj_key(it)
            if k is not None:
                out.add(k)
        return out

    on_keys = keys(d.get("/ON"))
    off_keys = keys(d.get("/OFF"))
    if (_nm(d.get("/BaseState")) or "ON") == "OFF":
        off = (keys(ocprops.get("/OCGs")) - on_keys) | off_keys
    else:
        off = set(off_keys)

    for entry in _items(d.get("/AS")):
        try:
            if _nm(entry.get("/Event")) != "View":
                continue
            if "View" not in [_nm(c) for c in _items(entry.get("/Category"))]:
                continue
            for ocg in _items(entry.get("/OCGs")):
                usage = ocg.get("/Usage")
                view = usage.get("/View") if usage is not None else None
                state = _nm(view.get("/ViewState")) if view is not None else None
                k = _obj_key(ocg)
                if k is None:
                    continue
                if state == "OFF":
                    off.add(k)
                elif state == "ON":
                    off.discard(k)
        except Exception:
            continue
    return off, ocprops


def _ve_visible(ve, off, depth=0):
    if depth > 32:
        raise ValueError("visibility expression too deep")
    if _is_array(ve):
        parts = list(ve)
        op = _nm(parts[0]) if parts else None
        vals = [_ve_visible(a, off, depth + 1) for a in parts[1:]]
        if op == "And":
            return all(vals)
        if op == "Or":
            return any(vals)
        if op == "Not":
            return not vals[0]
        raise ValueError(f"unknown visibility operator {op}")
    return _ocg_key(ve) not in off


def _oc_hidden(oc, off):
    """True if the OCG/OCMD `oc` is hidden in the default view. Raises if undecidable."""
    if _nm(oc.get("/Type")) == "OCMD":
        ve = oc.get("/VE")
        if ve is not None:
            return not _ve_visible(ve, off)
        ocgs = oc.get("/OCGs")
        if ocgs is None:
            return False
        members = list(ocgs) if _is_array(ocgs) else [ocgs]
        if not members:
            return False
        on = [_ocg_key(m) not in off for m in members]
        policy = _nm(oc.get("/P")) or "AnyOn"
        if policy == "AllOn":
            visible = all(on)
        elif policy == "AnyOff":
            visible = not all(on)
        elif policy == "AllOff":
            visible = not any(on)
        else:
            visible = any(on)
        return not visible
    return _ocg_key(oc) in off


def _hidden_xobject_names(resources, off, ctx):
    names = set()
    if resources is None:
        return names
    xo = resources.get("/XObject")
    if xo is None or not _is_dict(xo):
        return names
    for name in xo.keys():
        try:
            cand = xo[name]
            if not _is_stream(cand):
                continue
            oc = cand.get("/OC")
            if oc is not None and _oc_hidden(oc, off):
                names.add(str(name))
        except Exception:
            ctx["unresolved"] += 1
    return names


def _resolve_bdc_oc(operand, resources):
    """Resolve the 2nd operand of a BDC to an OCG/OCMD dictionary.

    Covers `/OC <name> BDC` via /Properties, inline OCG/OCMD dicts, and inline
    property lists carrying /OC. Returns (oc, kind) where kind is 'oc' (definitely
    optional content), 'plain' (definitely not), or 'unknown' (cannot tell - fail-safe).
    """
    try:
        if _is_name_obj(operand):
            props = resources.get("/Properties") if resources is not None else None
            if props is None or not _is_dict(props):
                return None, "unknown"
            val = props.get(str(operand))
            if val is None:
                return None, "unknown"
            if _is_dict(val) and _nm(val.get("/Type")) in ("OCG", "OCMD"):
                return val, "oc"
            return None, "plain"
        if _is_dict(operand):
            if _nm(operand.get("/Type")) in ("OCG", "OCMD"):
                return operand, "oc"
            if "/OC" in operand:
                inner = operand["/OC"]
                if _is_dict(inner) and _nm(inner.get("/Type")) in ("OCG", "OCMD"):
                    return inner, "oc"
                return None, "unknown"
            return None, "plain"
    except Exception:
        pass
    return None, "unknown"


def _is_name_obj(o):
    return _otype(o) == pikepdf.ObjectType.name_


def _filter_ops(ops, resources, off, ctx):
    """Drop content of hidden layers and unwrap visible `/OC ... BDC ... EMC` wrappers.

    Returns (new_ops, changed). Unresolvable references are counted in ctx['unresolved'];
    they are KEPT, and the caller then refuses to delete the layer definitions.
    """
    hidden_names = _hidden_xobject_names(resources, off, ctx)
    out = []
    stack = []   # True for an OC wrapper we unwrapped, False for any other marked content
    skip = 0     # >0 while inside hidden marked content
    changed = False
    for ins in ops:
        try:
            op = str(ins.operator)
        except Exception:
            op = ""
        if skip:
            if op in ("BDC", "BMC"):
                skip += 1
            elif op == "EMC":
                skip -= 1
            continue
        if op in ("BDC", "BMC"):
            action = "keep"
            try:
                operands = list(ins.operands)
            except Exception:
                operands = []
            if op == "BDC" and len(operands) >= 2:
                oc, resolved = _resolve_bdc_oc(operands[1], resources)
                if resolved == "unknown":
                    ctx["unresolved"] += 1
                elif resolved == "oc":
                    try:
                        action = "skip" if _oc_hidden(oc, off) else "unwrap"
                    except Exception:
                        ctx["unresolved"] += 1
            if action == "skip":
                skip = 1
                ctx["removed"] += 1
                changed = True
                continue
            if action == "unwrap":
                stack.append(True)
                changed = True
                continue
            stack.append(False)
            out.append(ins)
            continue
        if op == "EMC":
            if stack and stack.pop():
                continue
            out.append(ins)
            continue
        if op == "Do" and hidden_names:
            try:
                if str(ins.operands[0]) in hidden_names:
                    ctx["removed"] += 1
                    changed = True
                    continue
            except Exception:
                pass
        out.append(ins)
    return out, changed


# --------------------------------------------------------------------------- #
# Actions (JavaScript and other active content)
# --------------------------------------------------------------------------- #

def _is_active_action(d):
    return _is_dict(d) and not _is_stream(d) and _nm(d.get("/S")) in _ACTIVE_ACTIONS


def _strip_active_actions(obj):
    """Remove active actions held by `obj` (/A, /OpenAction, /Next, /AA). Returns count."""
    n = 0
    for key in ("/A", "/OpenAction"):
        v = obj.get(key)
        if v is not None and _is_active_action(v):
            del obj[key]
            n += 1
    nxt = obj.get("/Next")
    if nxt is not None:
        if _is_active_action(nxt):
            del obj["/Next"]
            n += 1
        elif _is_array(nxt):
            kept = [a for a in nxt if not _is_active_action(a)]
            if len(kept) != len(nxt):
                n += len(nxt) - len(kept)
                if kept:
                    obj["/Next"] = pikepdf.Array(kept)
                else:
                    del obj["/Next"]
    aa = obj.get("/AA")
    if aa is not None and _is_dict(aa):
        for k in list(aa.keys()):
            if _is_active_action(aa[k]):
                del aa[k]
                n += 1
        if len(aa) == 0:
            del obj["/AA"]
    if "/JS" in obj and _nm(obj.get("/S")) in (None, "JavaScript"):
        del obj["/JS"]
        n += 1
    return n


# --------------------------------------------------------------------------- #
# Metrics: the single source of truth for scan AND post-scrub verification
# --------------------------------------------------------------------------- #

def _pdf_metrics(pdf, errs):
    f = blank_findings()
    out = {"findings": f, "signed": False, "signature_detail": "", "id_values": [], "warnings": []}

    # docinfo (read-only: don't use pdf.docinfo, it creates /Info when absent)
    try:
        info = pdf.trailer.get("/Info")
        if info is not None and _is_dict(info):
            entries = {}
            for k, v in info.items():
                try:
                    s = str(v)
                except Exception:
                    s = ""
                if s.strip():
                    entries[str(k)] = s
            if entries:
                shown = list(entries.items())[:2]
                rest = len(entries) - len(shown)
                detail = ", ".join(f"{k.strip('/')}: {v[:40]}" for k, v in shown)
                if rest > 0:
                    detail += f", +{rest} more"
                f["docinfo"] = {"key": "docinfo", "found": True, "count": len(entries), "detail": detail}
    except Exception as e:
        errs.add(f"docinfo: {e}")

    # trailer /ID
    try:
        tid = pdf.trailer.get("/ID")
        if tid is not None:
            out["id_values"] = [str(x) for x in _items(tid)]
            f["trailer-id"] = {"key": "trailer-id", "found": True, "count": 1,
                               "detail": "Document IDs present (can link copies of this file)"}
    except Exception as e:
        errs.add(f"trailer-id: {e}")

    # one pass over the whole object graph
    t = {
        "actions": {}, "ef": 0, "attach": 0, "ocg": 0, "xmp": 0, "piece": [], "piece_n": 0,
        "font_meta": 0, "img_total": 0, "img_meta": 0, "img_skipped": 0, "thumbs": 0,
    }
    font_stream_keys = set()

    def visitor(obj, is_dict):
        if not is_dict:
            return
        s = _nm(obj.get("/S"))
        if s in _ACTIVE_ACTIONS:
            t["actions"][s] = t["actions"].get(s, 0) + 1
        elif "/JS" in obj:
            t["actions"]["JavaScript"] = t["actions"].get("JavaScript", 0) + 1

        if "/EF" in obj:
            t["ef"] += 1
        if _nm(obj.get("/Subtype")) in ("Sound", "RichMedia"):
            t["attach"] += 1
        if _nm(obj.get("/Type")) == "OCG":
            t["ocg"] += 1
        if "/Thumb" in obj:
            t["thumbs"] += 1

        fontish = any(k in obj for k in _FONT_FILE_KEYS)
        if fontish:
            for k in _FONT_FILE_KEYS:
                ff = obj.get(k)
                if ff is not None:
                    fk = _obj_key(ff)
                    if fk is not None:
                        font_stream_keys.add(fk)
        if "/Metadata" in obj:
            if fontish or _obj_key(obj) in font_stream_keys:
                t["font_meta"] += 1
            else:
                t["xmp"] += 1
        if "/PieceInfo" in obj:
            t["piece_n"] += 1
            try:
                t["piece"].extend(str(k).strip("/") for k in obj["/PieceInfo"].keys())
            except Exception:
                pass

        if _is_stream(obj) and _nm(obj.get("/Subtype")) == "Image":
            t["img_total"] += 1
            names = _single_filter(obj)
            if names == ["DCTDecode"]:
                if _jpeg_metadata_spans(obj.read_raw_bytes()):
                    t["img_meta"] += 1
            elif "DCTDecode" in names or "JPXDecode" in names:
                t["img_skipped"] += 1

    walk(pdf, visitor, errs)

    xmp_total = t["xmp"] + t["piece_n"]
    if xmp_total:
        parts = []
        if t["xmp"]:
            parts.append(f"{t['xmp']} XMP metadata packet{'s' if t['xmp'] != 1 else ''}")
        if t["piece_n"]:
            names = sorted(set(n for n in t["piece"] if n))[:3]
            parts.append(f"private app data (PieceInfo: {', '.join(names) or 'unknown app'})")
        f["xmp"] = {"key": "xmp", "found": True, "count": xmp_total, "detail": ", ".join(parts)}

    n_actions = sum(t["actions"].values())
    if n_actions:
        label = ", ".join(f"{v} {k}" for k, v in sorted(t["actions"].items()))
        f["javascript"] = {"key": "javascript", "found": True, "count": n_actions,
                           "detail": f"{n_actions} script/active action{'s' if n_actions != 1 else ''} ({label})"}

    n_files = t["ef"] + t["attach"]
    if n_files:
        f["embedded-files"] = {"key": "embedded-files", "found": True, "count": n_files,
                               "detail": f"{n_files} embedded file/media item{'s' if n_files != 1 else ''}"}

    if t["ocg"]:
        hidden_n = 0
        try:
            hidden_n = len(_ocg_off_keys(pdf)[0])
        except Exception as e:
            errs.add(f"layers: {e}")
        detail = f"{t['ocg']} optional-content PDF layer{'s' if t['ocg'] != 1 else ''}"
        if hidden_n:
            detail += f" ({hidden_n} hidden by default)"
        f["layers"] = {"key": "layers", "found": True, "count": t["ocg"], "detail": detail}

    if t["font_meta"]:
        f["fonts"] = {"key": "fonts", "found": True, "count": t["font_meta"],
                      "detail": f"{t['font_meta']} embedded font{'s' if t['font_meta'] != 1 else ''} carrying metadata "
                                "(font names themselves are required for rendering and are kept)"}

    # pages: annotations + thumbnails (thumbnails are images of the page, possibly of old content)
    annot_total = 0
    for page in _pages(pdf, errs):
        try:
            for annot in _items(page.obj.get("/Annots")):
                if _is_dict(annot) and _nm(annot.get("/Subtype")) not in _KEEP_SUBTYPES:
                    annot_total += 1
        except Exception as e:
            errs.add(f"annotations: {e}")
    if annot_total:
        f["annotations"] = {"key": "annotations", "found": True, "count": annot_total,
                            "detail": f"{annot_total} comment/annotation{'s' if annot_total != 1 else ''} "
                                      "(links and form widgets are not counted)"}

    img_count = t["img_meta"] + t["thumbs"]
    if img_count:
        parts = []
        if t["img_meta"]:
            parts.append(f"{t['img_meta']} of {t['img_total']} image{'s' if t['img_total'] != 1 else ''} "
                         f"{'carries' if t['img_meta'] == 1 else 'carry'} EXIF/metadata")
        if t["thumbs"]:
            parts.append(f"{t['thumbs']} page thumbnail{'s' if t['thumbs'] != 1 else ''}")
        f["image-metadata"] = {"key": "image-metadata", "found": True, "count": img_count,
                               "detail": ", ".join(parts)}
    if t["img_skipped"]:
        out["warnings"].append(
            f"{t['img_skipped']} image(s) use compression chains that cannot be inspected or cleaned for metadata")

    # form fields + signatures
    try:
        fields = _iter_fields(pdf, errs)
        with_values = 0
        sig_names = []
        for fld in fields:
            ft = _nm(_inherited(fld, "/FT"))
            if ft == "Sig":
                v = fld.get("/V")
                if v is not None and _is_dict(v):  # an UNSIGNED signature field is not a signature
                    nm = str(fld.get("/T", ""))
                    sig_names.append(nm[:40] if nm else "")
            elif _has_value(fld):
                with_values += 1
        acro = pdf.Root.get("/AcroForm")
        has_xfa = acro is not None and "/XFA" in acro
        if with_values or has_xfa:
            detail = f"{with_values} form field{'s' if with_values != 1 else ''} with stored values (may hold personal data)"
            if has_xfa:
                detail += "; XFA form data present"
            f["form-fields"] = {"key": "form-fields", "found": True, "count": with_values + (1 if has_xfa else 0),
                                "detail": detail}

        certified = False
        try:
            perms = pdf.Root.get("/Perms")
            certified = perms is not None and "/DocMDP" in perms
        except Exception:
            pass
        if sig_names or certified:
            out["signed"] = True
            names = [n for n in sig_names if n]
            out["signature_detail"] = ("Signed" + (f" by {', '.join(names)}" if names else "")
                                       + " - scrubbing saves a new file and the signature will become invalid.")
        elif acro is not None:
            try:
                if int(acro.get("/SigFlags", 0)) > 0:
                    out["signed"] = True
                    out["signature_detail"] = ("Signature flags set - scrubbing saves a new file and "
                                               "signatures will become invalid.")
            except Exception:
                pass
    except Exception as e:
        errs.add(f"form fields: {e}")

    return out


def _scan_core(pdf_path, errs):
    """Open + measure. Returns (metrics, pdf_was_encrypted_with_empty_password)."""
    pdf = pikepdf.open(pdf_path)
    try:
        return _pdf_metrics(pdf, errs), bool(pdf.is_encrypted)
    finally:
        pdf.close()


# --------------------------------------------------------------------------- #
# Public: scan
# --------------------------------------------------------------------------- #

def scan_pdf(pdf_path):
    if pikepdf is None:
        return {"success": False, "error": "Metadata scrub engine unavailable (pikepdf missing)."}

    errs = _Errors()
    warnings = []
    findings = blank_findings()

    try:
        pdf = pikepdf.open(pdf_path)
    except pikepdf.PasswordError:
        return {"success": True, "encrypted": True, "signed": False, "signatureDetail": "",
                "incomplete": True, "errors": ["password-protected: contents not scanned"], "warnings": [],
                "findings": [findings[k] for k in ALLOWED_CATEGORIES]}
    except Exception as e:
        return {"success": False, "error": f"Could not open PDF: {e}"}

    engine_error = _engine_check(pdf)
    if engine_error is not None:
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": False, "error": engine_error}

    try:
        metrics = _pdf_metrics(pdf, errs)
        if pdf.is_encrypted:
            warnings.append("PDF is encrypted (opened with an empty password); the cleaned copy will be decrypted")
    finally:
        try:
            pdf.close()
        except Exception:
            pass

    findings = metrics["findings"]
    warnings.extend(metrics["warnings"])

    try:
        versions = _count_prior_versions(pdf_path)
        if versions > 0:
            findings["history"] = {"key": "history", "found": True, "count": versions,
                                   "detail": f"{versions} prior saved version{'s' if versions != 1 else ''} "
                                             "kept in file history"}
    except Exception as e:
        errs.add(f"history: {e}")

    return {
        "success": True,
        "encrypted": False,
        "signed": metrics["signed"],
        "signatureDetail": metrics["signature_detail"],
        "incomplete": bool(errs),           # True => "nothing found" is NOT trustworthy
        "errors": errs.items,
        "warnings": warnings,
        "findings": [findings[k] for k in ALLOWED_CATEGORIES],
    }


# --------------------------------------------------------------------------- #
# Scrub: per-category implementations
# Each takes (pdf, errs, notes) and returns nothing; counts come from verification.
# --------------------------------------------------------------------------- #

def _scrub_docinfo(pdf, errs, notes):
    if "/Info" in pdf.trailer:
        del pdf.trailer["/Info"]


def _make_metadata_stripper(do_xmp, do_fonts):
    font_stream_keys = set()

    def visitor(obj, is_dict):
        if not is_dict:
            return
        fontish = any(k in obj for k in _FONT_FILE_KEYS)
        if fontish:
            for k in _FONT_FILE_KEYS:
                ff = obj.get(k)
                if ff is not None:
                    fk = _obj_key(ff)
                    if fk is not None:
                        font_stream_keys.add(fk)
        if "/Metadata" in obj:
            is_font = fontish or _obj_key(obj) in font_stream_keys
            if (is_font and do_fonts) or (not is_font and do_xmp):
                del obj["/Metadata"]
        if do_xmp and "/PieceInfo" in obj:
            del obj["/PieceInfo"]

    return visitor


def _scrub_xmp(pdf, errs, notes):
    walk(pdf, _make_metadata_stripper(True, False), errs)


def _scrub_fonts(pdf, errs, notes):
    walk(pdf, _make_metadata_stripper(False, True), errs)
    notes.append("fonts: font names are required for rendering and were kept; only font metadata streams were removed")


def _scrub_trailer_id(pdf, errs, notes):
    if "/ID" in pdf.trailer:
        pdf.trailer["/ID"] = pikepdf.Array([
            pikepdf.String(os.urandom(16).hex().upper()),
            pikepdf.String(os.urandom(16).hex().upper()),
        ])


def _scrub_javascript(pdf, errs, notes):
    def visitor(obj, is_dict):
        if is_dict:
            _strip_active_actions(obj)

    walk(pdf, visitor, errs)

    names = pdf.Root.get("/Names")
    if names is not None and "/JavaScript" in names:
        del names["/JavaScript"]
    try:
        acro = pdf.Root.get("/AcroForm")
        if acro is not None and "/XFA" in acro:
            notes.append("javascript: XFA form scripts live in the XFA packet; select 'form-fields' to remove it")
    except Exception:
        pass


def _remove_annots(pdf, errs, predicate):
    """Remove annotations for which predicate(annot) is True; return how many were removed."""
    removed = 0
    for page in _pages(pdf, errs):
        try:
            annots = page.obj.get("/Annots")
            if annots is None:
                continue
            orig = _items(annots)
            kept = [a for a in orig if not (_is_dict(a) and predicate(a))]
            if len(kept) != len(orig):
                removed += len(orig) - len(kept)
                if kept:
                    page.obj["/Annots"] = pikepdf.Array(kept)
                else:
                    del page.obj["/Annots"]
        except Exception as e:
            errs.add(f"annotations: {e}")
    return removed


def _scrub_embedded_files(pdf, errs, notes):
    names = pdf.Root.get("/Names")
    if names is not None and "/EmbeddedFiles" in names:
        del names["/EmbeddedFiles"]

    def visitor(obj, is_dict):
        if is_dict and "/AF" in obj:
            del obj["/AF"]

    walk(pdf, visitor, errs)
    _remove_annots(pdf, errs, lambda a: _nm(a.get("/Subtype")) in _ATTACH_SUBTYPES)
    if "/Collection" in pdf.Root:
        del pdf.Root["/Collection"]
        notes.append("embedded-files: PDF portfolio shell removed")


def _scrub_annotations(pdf, errs, notes):
    _remove_annots(pdf, errs, lambda a: _nm(a.get("/Subtype")) not in _KEEP_SUBTYPES)
    notes.append("annotations: hyperlinks and form-field widgets are kept")


def _scrub_form_fields(pdf, errs, notes):
    acro = pdf.Root.get("/AcroForm")
    if acro is None:
        return
    ap_removed = 0
    sig_fields = 0
    for fld in _iter_fields(pdf, errs):
        ft = _nm(_inherited(fld, "/FT"))
        if ft == "Sig":
            sig_fields += 1
            continue
        for key in ("/V", "/RV", "/DV"):
            if key in fld:
                del fld[key]
        if _nm(fld.get("/Subtype")) == "Widget":
            if ft in ("Tx", "Ch"):
                # The appearance stream holds the RENDERED text; deleting /V alone leaves it recoverable.
                if "/AP" in fld:
                    del fld["/AP"]
                    ap_removed += 1
            elif ft == "Btn" and "/AS" in fld:
                fld["/AS"] = pikepdf.Name("/Off")
    if "/XFA" in acro:
        del acro["/XFA"]
        notes.append("form-fields: XFA form data removed (XFA-only dynamic forms will no longer work)")
    if ap_removed:
        acro["/NeedAppearances"] = True
        notes.append(f"form-fields: {ap_removed} text/choice appearance stream(s) removed so viewers redraw fields blank")
    if sig_fields:
        notes.append("form-fields: signature fields are left untouched")


def _scrub_image_metadata(pdf, errs, notes):
    def visitor(obj, is_dict):
        if not (is_dict and _is_stream(obj) and _nm(obj.get("/Subtype")) == "Image"):
            return
        if _single_filter(obj) != ["DCTDecode"]:
            return
        cleaned = _strip_jpeg_metadata(obj.read_raw_bytes())
        if cleaned is not None:
            # keep /DecodeParms (e.g. /ColorTransform) or colours can change
            obj.write(cleaned, filter=pikepdf.Name("/DCTDecode"), decode_parms=obj.get("/DecodeParms"))

    walk(pdf, visitor, errs)
    for page in _pages(pdf, errs):
        try:
            if "/Thumb" in page.obj:
                del page.obj["/Thumb"]
        except Exception as e:
            errs.add(f"thumbnails: {e}")


def _scrub_layers(pdf, errs, notes):
    """Flatten optional content safely.

    Order matters and every step is safe on its own:
      A. rewrite content streams: hidden content removed, visible /OC wrappers unwrapped
      B. delete hidden XObjects / annotations
      C. ONLY if A and B were fully resolved: drop /OC references, OCG entries in
         /Properties, and /OCProperties.
    If anything was unresolvable we stop after B and KEEP the layer definitions, so
    hidden content that we could not strip can never become visible.
    Errors are tracked in a layer-scoped collector: unrelated problems elsewhere in the
    document must not block layer removal, while layer problems still feed `incomplete`.
    """
    layer_errs = _Errors()
    off, ocprops = _ocg_off_keys(pdf)

    owners = []      # (kind, handle, resources)
    res_dicts = []
    ocg_count = [0]
    has_oc_ref = [False]

    def collect(obj, is_dict):
        if not is_dict:
            return
        if _nm(obj.get("/Type")) == "OCG":
            ocg_count[0] += 1
        if "/OC" in obj:
            has_oc_ref[0] = True
        if _is_stream(obj) and (_nm(obj.get("/Subtype")) == "Form" or obj.get("/PatternType") is not None):
            owners.append(("stream", obj, obj.get("/Resources")))
        xo = obj.get("/XObject")
        if xo is not None and _is_dict(xo) and not _is_stream(xo):
            res_dicts.append(obj)

    walk(pdf, collect, layer_errs)
    pages = _pages(pdf, layer_errs)
    for page in pages:
        owners.append(("page", page, _inherited(page.obj, "/Resources")))

    if ocg_count[0] == 0 and ocprops is None and not has_oc_ref[0]:
        return

    ctx = {"unresolved": 0, "removed": 0, "failed": 0}

    # A. content streams
    for kind, handle, res in owners:
        try:
            ops = pikepdf.parse_content_stream(handle)
            new_ops, changed = _filter_ops(ops, res, off, ctx)
            if changed:
                data = pikepdf.unparse_content_stream(new_ops)
                if kind == "page":
                    try:
                        stream = pdf.make_stream(zlib.compress(data))
                        try:
                            stream.Filter = pikepdf.Name("/FlateDecode")
                        except Exception:
                            stream = pdf.make_stream(data)
                        handle.obj["/Contents"] = stream
                    except Exception:
                        handle.obj["/Contents"] = pdf.make_stream(data)
                else:
                    try:
                        handle.write(zlib.compress(data), filter=pikepdf.Name("/FlateDecode"))
                    except Exception:
                        handle.write(data)
        except Exception as e:
            ctx["failed"] += 1
            layer_errs.add(f"layers content: {e}")

    # B. hidden XObjects and annotations
    for rd in res_dicts:
        try:
            xo = rd.get("/XObject")
            for name in list(xo.keys()):
                cand = xo[name]
                if not _is_stream(cand):
                    continue
                oc = cand.get("/OC")
                if oc is None:
                    continue
                try:
                    if _oc_hidden(oc, off):
                        del xo[name]
                        ctx["removed"] += 1
                except Exception:
                    ctx["unresolved"] += 1
        except Exception as e:
            ctx["failed"] += 1
            layer_errs.add(f"layers xobjects: {e}")

    def hidden_annot(a):
        oc = a.get("/OC")
        if oc is None:
            return False
        try:
            return _oc_hidden(oc, off)
        except Exception:
            ctx["unresolved"] += 1
            return False

    ctx["removed"] += _remove_annots(pdf, layer_errs, hidden_annot)

    if ctx["removed"]:
        notes.append(f"layers: {ctx['removed']} hidden content block(s) removed")

    # C. drop the layer machinery only when everything was resolved
    if ctx["unresolved"] or ctx["failed"] or layer_errs:
        notes.append("layers: some references could not be resolved; layer definitions were KEPT "
                     "so hidden content cannot become visible")
        errs.add(f"layers: {ctx['unresolved']} unresolved / {ctx['failed']} failed reference(s); "
                 "layer definitions kept")
    else:
        strip_errs = _Errors()
        oc_ref_failures = [0]

        def strip_refs(obj, is_dict):
            if not is_dict:
                return
            try:
                if "/OC" in obj:
                    del obj["/OC"]
            except Exception:
                oc_ref_failures[0] += 1
            props = obj.get("/Properties")
            if props is not None and _is_dict(props) and not _is_stream(props):
                for k in list(props.keys()):
                    try:
                        v = props[k]
                        if _is_dict(v) and _nm(v.get("/Type")) in ("OCG", "OCMD"):
                            del props[k]
                    except Exception:
                        oc_ref_failures[0] += 1

        walk(pdf, strip_refs, strip_errs)
        if oc_ref_failures[0] or strip_errs:
            notes.append("layers: some /OC references could not be removed; /OCProperties was KEPT "
                         "so hidden content cannot become visible")
        elif "/OCProperties" in pdf.Root:
            del pdf.Root["/OCProperties"]

    for msg in layer_errs.items:
        errs.add(msg)


_SCRUBBERS = {
    "docinfo": _scrub_docinfo,
    "xmp": _scrub_xmp,
    "trailer-id": _scrub_trailer_id,
    "javascript": _scrub_javascript,
    "embedded-files": _scrub_embedded_files,
    "layers": _scrub_layers,
    "annotations": _scrub_annotations,
    "form-fields": _scrub_form_fields,
    "image-metadata": _scrub_image_metadata,
    "fonts": _scrub_fonts,
}
# Order matters: actions/attachments are stripped before layers so that layer
# processing sees the final structure; layers run before form fields.
_ORDER = ["docinfo", "xmp", "fonts", "javascript", "embedded-files", "annotations",
          "layers", "form-fields", "image-metadata", "trailer-id"]


# --------------------------------------------------------------------------- #
# Public: scrub
# --------------------------------------------------------------------------- #

def scrub_pdf(pdf_path, output_path, categories):
    if pikepdf is None:
        return {"success": False, "error": "Metadata scrub engine unavailable (pikepdf missing)."}

    cats = set(categories or [])
    notes = []
    errs = _Errors()
    removed = {k: 0 for k in ALLOWED_CATEGORIES}
    status = {}

    try:
        pdf = pikepdf.open(pdf_path)
    except pikepdf.PasswordError:
        return {"success": False,
                "error": "ENCRYPTED: This PDF is password-protected. Unlock it first, then try Deep Clean again."}
    except Exception as e:
        return {"success": False, "error": f"Could not open PDF: {e}"}

    engine_error = _engine_check(pdf)
    if engine_error is not None:
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": False, "error": engine_error}

    try:
        if pdf.is_encrypted:
            notes.append("source file was protected; the saved copy is decrypted")

        before_errs = _Errors()
        before = _pdf_metrics(pdf, before_errs)
        if before["signed"]:
            notes.append("document is digitally signed; the saved copy will show invalid signatures")

        try:
            prior_versions = _count_prior_versions(pdf_path)
        except Exception as e:
            prior_versions = 0
            errs.add(f"history: {e}")

        for cat in _ORDER:
            if cat not in cats:
                continue
            cat_errs_before = errs.total
            try:
                _SCRUBBERS[cat](pdf, errs, notes)
                status[cat] = "ok" if errs.total == cat_errs_before else "partial"
            except Exception as e:
                status[cat] = "failed"
                notes.append(f"{cat}: FAILED - {e}")

        # 'history' is a property of the save, not an operation: pdf.save() always rewrites the
        # whole file (no incremental update), so old xref sections are always dropped.
        removed["history"] = prior_versions
        if "history" in cats:
            status["history"] = "ok"
        elif prior_versions:
            notes.append(f"history: {prior_versions} prior version(s) were also dropped because the file is always fully rewritten")

        pdf.save(output_path)
    except Exception as e:
        return {"success": False, "error": f"Scrub failed: {e}"}
    finally:
        try:
            pdf.close()
        except Exception:
            pass

    # ---- verification: re-scan the OUTPUT and report what is really left ----
    verify_errs = _Errors()
    try:
        after, _ = _scan_core(output_path, verify_errs)
    except Exception as e:
        return {"success": False, "error": f"Output could not be re-opened for verification: {e}"}

    remaining = {}
    for cat in cats:
        if cat == "history":
            continue
        if cat == "trailer-id":
            old, new = set(before["id_values"]), set(after["id_values"])
            changed = bool(old) and not (old & new)
            removed[cat] = 1 if changed else 0
            if old and not changed:
                status[cat] = "partial"
                remaining[cat] = 1
            continue
        b = before["findings"][cat]["count"] if before["findings"][cat]["found"] else 0
        a = after["findings"][cat]["count"] if after["findings"][cat]["found"] else 0
        removed[cat] = max(b - a, 0)
        if a > 0:
            remaining[cat] = a
            if status.get(cat) == "ok":
                status[cat] = "partial"
            notes.append(f"{cat}: {a} item(s) still present after cleaning")

    incomplete = bool(errs) or bool(before_errs) or bool(verify_errs)
    if incomplete:
        notes.append("some objects could not be fully inspected; results may be incomplete: "
                     + "; ".join((errs.items + before_errs.items + verify_errs.items)[:3]))

    return {
        "success": True,
        "removed": removed,
        "status": status,
        "notes": notes,
        "verification": {"ok": not remaining and not incomplete, "remaining": remaining, "incomplete": incomplete},
        "output": output_path,
    }
