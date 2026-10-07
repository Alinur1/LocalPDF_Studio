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

import os
import io
import json
import sys


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


def blank_findings():
    return {
        "docinfo": {"key": "docinfo", "found": False, "count": 0, "detail": ""},
        "xmp": {"key": "xmp", "found": False, "count": 0, "detail": ""},
        "trailer-id": {"key": "trailer-id", "found": False, "count": 0, "detail": ""},
        "history": {"key": "history", "found": False, "count": 0, "detail": ""},
        "javascript": {"key": "javascript", "found": False, "count": 0, "detail": ""},
        "embedded-files": {"key": "embedded-files", "found": False, "count": 0, "detail": ""},
        "layers": {"key": "layers", "found": False, "count": 0, "detail": ""},
        "annotations": {"key": "annotations", "found": False, "count": 0, "detail": ""},
        "form-fields": {"key": "form-fields", "found": False, "count": 0, "detail": ""},
        "image-metadata": {"key": "image-metadata", "found": False, "count": 0, "detail": ""},
        "fonts": {"key": "fonts", "found": False, "count": 0, "detail": ""},
    }


def walk(pdf, visitor):
    """Visit every reachable Dictionary/Array object once (cycle-safe)."""
    seen = set()

    def _obj_id(obj):
        try:
            og = tuple(obj.objgen)
            if og != (0, 0):
                return ("indirect", og)
        except Exception:
            pass
        return ("direct", id(obj))

    def _visit(obj):
        try:
            import pikepdf as _pikepdf
            is_dict = isinstance(obj, _pikepdf.Dictionary)
            is_array = isinstance(obj, _pikepdf.Array)
        except Exception:
            return
        if not (is_dict or is_array):
            return
        oid = _obj_id(obj)
        if oid in seen:
            return
        seen.add(oid)
        try:
            visitor(obj, is_dict)
        except Exception:
            pass
        try:
            if is_dict:
                keys = list(obj.keys())
            else:
                keys = list(range(len(obj)))
        except Exception:
            return
        children = []
        for k in keys:
            try:
                children.append(obj[k])
            except Exception:
                continue
        for child in children:
            _visit(child)

    _visit(pdf.Root)


def scan_pdf(pdf_path):
    findings = blank_findings()
    encrypted = False
    signed = False
    signature_detail = ""

    # --- Incremental-save history: works on raw bytes, no library needed.
    try:
        with open(pdf_path, "rb") as f:
            raw = f.read()
        eofs = raw.count(b"%%EOF")
        if eofs > 1:
            findings["history"] = {
                "key": "history",
                "found": True,
                "count": eofs - 1,
                "detail": f"{eofs - 1} prior saved version{'s' if eofs - 1 != 1 else ''} kept in file history",
            }
        raw = None
    except Exception:
        pass

    # --- Object-structure scan via pikepdf (best effort per check).
    pikepdf = None
    pdf = None
    try:
        import pikepdf as _pikepdf
        pikepdf = _pikepdf
    except Exception:
        pikepdf = None

    if pikepdf is not None:
        try:
            pdf = pikepdf.open(pdf_path)
        except Exception as e:
            if pikepdf is not None and e.__class__.__name__ == "PasswordError":
                return {
                    "success": True,
                    "encrypted": True,
                    "signed": False,
                    "signatureDetail": "",
                    "findings": list(findings.values()),
                }
            pdf = None

    if pdf is not None:
        try:
            # DocInfo
            try:
                entries = {str(k): str(v) for k, v in pdf.docinfo.items() if str(v).strip()}
                if entries:
                    shown = list(entries.items())[:2]
                    rest = len(entries) - len(shown)
                    detail = ", ".join(f"{k.strip('/')}: {v[:40]}" for k, v in shown)
                    if rest > 0:
                        detail += f", +{rest} more"
                    findings["docinfo"] = {"key": "docinfo", "found": True, "count": len(entries), "detail": detail}
            except Exception:
                pass

            # XMP
            try:
                if pikepdf.Name.Metadata in pdf.Root:
                    findings["xmp"] = {"key": "xmp", "found": True, "count": 1, "detail": "1 XMP metadata packet found"}
            except Exception:
                pass

            # Trailer IDs (used to correlate copies of a file)
            try:
                trailer_id = pdf.trailer.get(pikepdf.Name.ID, None)
                if trailer_id is not None:
                    findings["trailer-id"] = {
                        "key": "trailer-id",
                        "found": True,
                        "count": 1,
                        "detail": "Document IDs present (can link copies of this file)",
                    }
            except Exception:
                pass

            # Structural walk: JS, embedded files, layers, annotations, signatures, form presence
            try:
                tally = {"js": 0, "filespec": 0, "attach_annots": 0, "ocg": 0, "annots": 0, "sig": 0}
                sig_names = []

                def _visitor(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if pikepdf.Name.JS in obj:
                            tally["js"] += 1
                        try:
                            action = obj.get(pikepdf.Name.S, None)
                            if action == pikepdf.Name.JavaScript:
                                tally["js"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/Filespec"):
                                tally["filespec"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/Annot"):
                                tally["annots"] += 1
                                try:
                                    if obj.get(pikepdf.Name.Subtype, None) in (
                                        pikepdf.Name("/FileAttachment"),
                                        pikepdf.Name("/Sound"),
                                    ):
                                        tally["attach_annots"] += 1
                                except Exception:
                                    pass
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/OCG"):
                                tally["ocg"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.FT, None) == pikepdf.Name("/Sig"):
                                tally["sig"] += 1
                                try:
                                    name = str(obj.get(pikepdf.Name.T, ""))
                                    if name:
                                        sig_names.append(name[:40])
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    except Exception:
                        pass

                walk(pdf, _visitor)

                if tally["js"] > 0:
                    findings["javascript"] = {
                        "key": "javascript",
                        "found": True,
                        "count": tally["js"],
                        "detail": f"{tally['js']} script/action location{'s' if tally['js'] != 1 else ''} detected",
                    }
                total_files = tally["filespec"] + tally["attach_annots"]
                if total_files > 0:
                    findings["embedded-files"] = {
                        "key": "embedded-files",
                        "found": True,
                        "count": total_files,
                        "detail": f"{total_files} embedded file{'s' if total_files != 1 else ''}",
                    }
                if tally["ocg"] > 0:
                    findings["layers"] = {
                        "key": "layers",
                        "found": True,
                        "count": tally["ocg"],
                        "detail": f"{tally['ocg']} hidden layer{'s' if tally['ocg'] != 1 else ''}",
                    }
                if tally["sig"] > 0:
                    signed = True
                    signature_detail = "Signed" + (f" by {', '.join(sig_names)}" if sig_names else "")
                    signature_detail += " - scrubbing saves a new file and the signature will become invalid."
            except Exception:
                pass

            # Annotations per page (visible count, friendlier than walk tally)
            try:
                annot_total = 0
                for page in pdf.pages:
                    try:
                        annots = page.get(pikepdf.Name.Annots, None)
                        if annots is not None:
                            annot_total += len(list(annots))
                    except Exception:
                        continue
                if annot_total > 0:
                    findings["annotations"] = {
                        "key": "annotations",
                        "found": True,
                        "count": annot_total,
                        "detail": f"{annot_total} comment/annotation{'s' if annot_total != 1 else ''}",
                    }
            except Exception:
                pass

            # Form fields (top-level count; values are the privacy leak)
            try:
                acro = pdf.Root.get(pikepdf.Name.AcroForm, None)
                if acro is not None:
                    try:
                        fields = list(acro.get(pikepdf.Name.Fields, []))
                        if fields:
                            findings["form-fields"] = {
                                "key": "form-fields",
                                "found": True,
                                "count": len(fields),
                                "detail": f"{len(fields)} top-level form field{'s' if len(fields) != 1 else ''} (values may hold personal data)",
                            }
                    except Exception:
                        pass
                    try:
                        if int(acro.get(pikepdf.Name.SigFlags, 0)) > 0 and not signed:
                            signed = True
                            signature_detail = "Signature flags set - scrubbing saves a new file and signatures will become invalid."
                    except Exception:
                        pass
            except Exception:
                pass
        finally:
            try:
                pdf.close()
            except Exception:
                pass

    # --- Images + fonts via PyMuPDF (independent of pikepdf).
    try:
        import pymupdf as _fitz

        doc = None
        try:
            doc = _fitz.open(pdf_path)
        except Exception as e:
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                encrypted = True
            doc = None

        if doc is not None:
            try:
                if doc.needs_pass:
                    encrypted = True
                else:
                    # Image metadata: EXIF/XMP inside embedded raster images
                    try:
                        from PIL import Image as _PILImage
                        from PIL import ExifTags as _ExifTags

                        seen_xrefs = set()
                        with_meta = 0
                        total_images = 0
                        for page in doc:
                            try:
                                for img in page.get_images(full=True):
                                    xref = img[0]
                                    if xref in seen_xrefs:
                                        continue
                                    seen_xrefs.add(xref)
                                    total_images += 1
                                    try:
                                        info = doc.extract_image(xref)
                                        pil_img = _PILImage.open(io.BytesIO(info["image"]))
                                        has_meta = False
                                        try:
                                            if pil_img.getexif():
                                                has_meta = True
                                        except Exception:
                                            pass
                                        if not has_meta:
                                            try:
                                                if getattr(pil_img, "info", {}):
                                                    keys = set(pil_img.info.keys()) - {"dpi"}
                                                    if keys:
                                                        has_meta = True
                                            except Exception:
                                                pass
                                        if has_meta:
                                            with_meta += 1
                                    except Exception:
                                        continue
                            except Exception:
                                continue
                        if with_meta > 0:
                            findings["image-metadata"] = {
                                "key": "image-metadata",
                                "found": True,
                                "count": with_meta,
                                "detail": f"{with_meta} of {total_images} image{'s' if total_images != 1 else ''} carry{'ies' if with_meta == 1 else 'y'} EXIF/metadata",
                            }
                    except Exception:
                        pass

                    # Fonts: embedded programs whose names can leak tools/systems
                    try:
                        font_names = set()
                        for page in doc:
                            try:
                                for f in page.get_fonts(full=True):
                                    basefont = f[3] if len(f) > 3 else ""
                                    if basefont:
                                        font_names.add(str(basefont).split("+")[-1])
                            except Exception:
                                continue
                        if font_names:
                            shown = sorted(font_names)[:2]
                            rest = len(font_names) - len(shown)
                            detail = ", ".join(shown)
                            if rest > 0:
                                detail += f", +{rest} more"
                            findings["fonts"] = {
                                "key": "fonts",
                                "found": True,
                                "count": len(font_names),
                                "detail": f"{len(font_names)} embedded font{'s' if len(font_names) != 1 else ''}: {detail}",
                            }
                    except Exception:
                        pass
            finally:
                try:
                    doc.close()
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "success": True,
        "encrypted": encrypted,
        "signed": signed,
        "signatureDetail": signature_detail,
        "findings": [findings[k] for k in ALLOWED_CATEGORIES],
    }


def scrub_pdf(pdf_path, output_path, categories):
    removed = {k: 0 for k in ALLOWED_CATEGORIES}
    notes = []
    cats = set(categories or [])

    try:
        import pikepdf as _pikepdf
    except Exception:
        return {"success": False, "error": "Metadata scrub engine unavailable (pikepdf missing)."}

    try:
        pdf = _pikepdf.open(pdf_path)
    except Exception as e:
        if e.__class__.__name__ == "PasswordError":
            return {"success": False, "error": "ENCRYPTED: This PDF is password-protected. Unlock it first, then try Deep Clean again."}
        return {"success": False, "error": f"Could not open PDF: {e}"}

    try:
        # --- DocInfo
        if "docinfo" in cats:
            try:
                keys = list(pdf.docinfo.keys())
                for key in keys:
                    try:
                        del pdf.docinfo[key]
                    except Exception:
                        continue
                removed["docinfo"] = len(keys)
            except Exception as e:
                notes.append(f"docinfo: {e}")

        # --- XMP
        if "xmp" in cats:
            try:
                if _pikepdf.Name.Metadata in pdf.Root:
                    del pdf.Root.Metadata
                    removed["xmp"] = 1
            except Exception as e:
                notes.append(f"xmp: {e}")

        # --- Trailer IDs: regenerate fresh random IDs (breaks cross-copy tracking, stays valid)
        if "trailer-id" in cats:
            try:
                new_id = os.urandom(16).hex().upper()
                pdf.trailer[_pikepdf.Name.ID] = _pikepdf.Array(
                    [_pikepdf.String(new_id), _pikepdf.String(new_id)]
                )
                removed["trailer-id"] = 1
            except Exception as e:
                notes.append(f"trailer-id: {e}")

        # --- JavaScript / actions
        if "javascript" in cats:
            try:
                count = [0]

                def _strip_js(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if _pikepdf.Name.JS in obj:
                            del obj[_pikepdf.Name.JS]
                            count[0] += 1
                    except Exception:
                        pass
                    try:
                        if obj.get(_pikepdf.Name.S, None) == _pikepdf.Name.JavaScript:
                            try:
                                del obj[_pikepdf.Name.JS]
                            except Exception:
                                pass
                            try:
                                del obj[_pikepdf.Name.S]
                            except Exception:
                                pass
                            count[0] += 1
                    except Exception:
                        pass

                walk(pdf, _strip_js)
                for holder in ("OpenAction", "AA", "Names"):
                    try:
                        key = _pikepdf.Name("/" + holder)
                        if key in pdf.Root:
                            target = pdf.Root[key]
                            try:
                                blob = str(target)
                            except Exception:
                                blob = ""
                            has_js = "JavaScript" in blob or "/JS" in blob
                            if holder == "Names":
                                try:
                                    if _pikepdf.Name.JavaScript in target:
                                        del target[_pikepdf.Name.JavaScript]
                                        count[0] += 1
                                except Exception:
                                    pass
                            elif has_js:
                                try:
                                    del pdf.Root[key]
                                    count[0] += 1
                                except Exception:
                                    pass
                    except Exception:
                        continue
                removed["javascript"] = count[0]
            except Exception as e:
                notes.append(f"javascript: {e}")

        # --- Embedded files
        if "embedded-files" in cats:
            try:
                count = [0]
                try:
                    names = pdf.Root.get(_pikepdf.Name.Names, None)
                    if names is not None and _pikepdf.Name.EmbeddedFiles in names:
                        del names[_pikepdf.Name.EmbeddedFiles]
                        count[0] += 1
                except Exception:
                    pass
                try:
                    if _pikepdf.Name.AF in pdf.Root:
                        del pdf.Root[_pikepdf.Name.AF]
                except Exception:
                    pass
                try:
                    for page in pdf.pages:
                        try:
                            annots = page.get(_pikepdf.Name.Annots, None)
                            if annots is None:
                                continue
                            kept = []
                            for annot in list(annots):
                                try:
                                    subtype = annot.get(_pikepdf.Name.Subtype, None)
                                except Exception:
                                    kept.append(annot)
                                    continue
                                if subtype in (_pikepdf.Name("/FileAttachment"), _pikepdf.Name("/Sound")):
                                    count[0] += 1
                                else:
                                    kept.append(annot)
                            if len(kept) != len(list(annots)):
                                if kept:
                                    page[_pikepdf.Name.Annots] = _pikepdf.Array(kept)
                                else:
                                    del page[_pikepdf.Name.Annots]
                        except Exception:
                            continue
                except Exception:
                    pass
                removed["embedded-files"] = count[0]
            except Exception as e:
                notes.append(f"embedded-files: {e}")

        # --- Hidden layers: drop optional-content properties, keep visible content intact
        if "layers" in cats:
            try:
                count = [0]
                try:
                    if _pikepdf.Name.OCProperties in pdf.Root:
                        try:
                            ocgs = list(pdf.Root.OCProperties.get(_pikepdf.Name.OCGs, []))
                            count[0] = len(ocgs)
                        except Exception:
                            count[0] = 1
                        del pdf.Root[_pikepdf.Name.OCProperties]
                except Exception:
                    pass
                try:
                    for page in pdf.pages:
                        try:
                            if _pikepdf.Name.OC in page:
                                del page[_pikepdf.Name.OC]
                        except Exception:
                            continue
                except Exception:
                    pass
                removed["layers"] = count[0]
            except Exception as e:
                notes.append(f"layers: {e}")

        # --- Annotations / comments
        if "annotations" in cats:
            try:
                total = [0]
                for page in pdf.pages:
                    try:
                        annots = page.get(_pikepdf.Name.Annots, None)
                        if annots is None:
                            continue
                        total[0] += len(list(annots))
                        del page[_pikepdf.Name.Annots]
                    except Exception:
                        continue
                removed["annotations"] = total[0]
            except Exception as e:
                notes.append(f"annotations: {e}")

        # --- Form values: clear entered data, keep the form structure
        if "form-fields" in cats:
            try:
                cleared = [0]

                def _clear_values(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if _pikepdf.Name.T in obj and _pikepdf.Name.V in obj:
                            try:
                                if obj.get(_pikepdf.Name.FT, None) == _pikepdf.Name("/Sig"):
                                    return
                            except Exception:
                                pass
                            del obj[_pikepdf.Name.V]
                            cleared[0] += 1
                    except Exception:
                        pass

                walk(pdf, _clear_values)
                removed["form-fields"] = cleared[0]
            except Exception as e:
                notes.append(f"form-fields: {e}")

        # --- Image metadata: re-encode JPEG streams without EXIF (others skipped, reported)
        if "image-metadata" in cats:
            try:
                stripped = [0]
                skipped = [0]
                try:
                    from PIL import Image as _PILImage
                except Exception:
                    _PILImage = None
                if _PILImage is None:
                    notes.append("image-metadata: image engine unavailable, skipped")
                else:
                    def _strip_images(obj, is_dict):
                        if not is_dict:
                            return
                        try:
                            if obj.get(_pikepdf.Name.Subtype, None) != _pikepdf.Name("/Image"):
                                return
                            filt = obj.get(_pikepdf.Name.Filter, None)
                            names = []
                            try:
                                if isinstance(filt, _pikepdf.Array):
                                    names = [str(n) for n in filt]
                                elif filt is not None:
                                    names = [str(filt)]
                            except Exception:
                                names = []
                            if "/DCTDecode" not in names:
                                skipped[0] += 1
                                return
                            raw = obj.read_bytes()
                            img = _PILImage.open(io.BytesIO(raw))
                            img.load()
                            out = io.BytesIO()
                            save_kwargs = {"format": "JPEG", "quality": 95}
                            try:
                                icc = img.info.get("icc_profile")
                                if icc:
                                    save_kwargs["icc_profile"] = icc
                            except Exception:
                                pass
                            rgb = img.convert("RGB") if img.mode not in ("RGB", "L") else img
                            rgb.save(out, **save_kwargs)
                            obj.write(out.getvalue(), filter=_pikepdf.Name("/DCTDecode"))
                            stripped[0] += 1
                        except Exception:
                            skipped[0] += 1

                    walk(pdf, _strip_images)
                    if skipped[0]:
                        notes.append(f"image-metadata: {skipped[0]} non-JPEG image(s) left untouched")
                    removed["image-metadata"] = stripped[0]
            except Exception as e:
                notes.append(f"image-metadata: {e}")

        # --- Fonts: names are required for rendering and cannot be stripped safely.
        # Full rewrite below still normalizes the file; report honestly.
        if "fonts" in cats:
            notes.append("fonts: font program names preserved (required for rendering); file normalized")

        # --- History is eliminated by the full rewrite itself (never incremental).
        # --- Full rewrite save (this is what drops prior-version history).
        pdf.save(output_path)
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": True, "removed": removed, "notes": notes, "output": output_path}
    except Exception as e:
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": False, "error": f"Scrub failed: {e}"}
