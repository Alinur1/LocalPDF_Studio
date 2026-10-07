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
import io
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


def sanitize_ocr_artifacts(md_text: str) -> str:
    """Remove HTML <br> tags and OCR picture-text blocks that break markdown renderers."""
    md_text = re.sub(r'<br\s*/?>', '\n', md_text)
    md_text = re.sub(
        r'-----\s*Start of picture text\s*-----[\s\S]*?-----\s*End of picture text\s*-----',
        '',
        md_text,
        flags=re.IGNORECASE
    )
    return md_text.strip()


def markdown_image_paths(md_text: str, tmp_dir: str, output_dir: str) -> str:
    """Safely convert absolute temp paths to relative filenames in markdown image syntax."""
    tmp_real = os.path.realpath(tmp_dir).replace("\\", "/")
    output_real = os.path.realpath(output_dir).replace("\\", "/")

    def _relativize(match):
        alt = match.group(1)
        raw_path = match.group(2).strip()

        if not os.path.isabs(raw_path):
            return match.group(0)

        real_path = os.path.realpath(raw_path).replace("\\", "/")

        if real_path.startswith(tmp_real + "/") or real_path == tmp_real:
            filename = os.path.basename(raw_path)
            safe_name = urllib.parse.quote(filename, safe="")
            return f"![{alt}]({safe_name})"

        return match.group(0)

    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _relativize, md_text)


def _load_dependencies():
    missing = []
    modules = {}
    for pkg in ["pymupdf", "pymupdf4llm"]:
        try:
            modules[pkg] = importlib.import_module(pkg)
        except Exception:
            missing.append(pkg)
    return modules, missing


def convert(input_path, output_folder, pdf_stem, options):
    """
    input_path - absolute path to the source PDF
    output_folder - absolute path to the folder C# created for this conversion
    pdf_stem - filename without extension, used as the .md filename
    options - dict of feature flags
    """
    modules, missing = _load_dependencies()

    if missing:
        return {
            "success":             False,
            "error":               "Missing required Python dependencies: " + ", ".join(missing),
            "missingDependencies": missing,
            "engine":              "pymupdf4llm",
        }

    fitz        = modules["pymupdf"]
    pymupdf4llm = modules["pymupdf4llm"]

    include_images = bool(options.get("includeImages", True))
    strip_header   = bool(options.get("stripHeader",   True))
    strip_footer   = bool(options.get("stripFooter",   True))
    char_margin    = float(options.get("charMargin",   0.5))

    output_md_path = os.path.join(output_folder, f"{pdf_stem}.md")

    progress("loading", 5)

    try:
        fitz_doc    = fitz.open(input_path)
        total_pages = len(fitz_doc)
        fitz_doc.close()
    except Exception as exc:
        return {"success": False, "error": f"Failed to open PDF: {exc}", "engine": "pymupdf4llm"}

    progress("analyzing", 10, total_pages=total_pages)

    tmp_image_dir = None

    try:
        progress("converting", 20, total_pages=total_pages)

        if include_images:
            tmp_image_dir = tempfile.mkdtemp(prefix="localpdf_md_images_")
            tmp_image_dir  = os.path.realpath(tmp_image_dir)
            image_path_arg = tmp_image_dir.rstrip("/\\") + os.sep
        else:
            image_path_arg = None

        _supported = set(inspect.signature(pymupdf4llm.to_markdown).parameters.keys())

        _kwargs = dict(
            doc          = input_path,
            write_images = include_images,
            image_path   = image_path_arg,
            image_format = "png",
            dpi          = 300,
            show_warning = False
        )
        if "show_warning"  in _supported: _kwargs["show_warning"]  = False
        if "header"        in _supported: _kwargs["header"]        = not strip_header
        if "footer"        in _supported: _kwargs["footer"]        = not strip_footer
        if "char_margin"   in _supported: _kwargs["char_margin"]   = char_margin
        if "ocr"           in _supported: _kwargs["ocr"]           = "off"

        md_text = pymupdf4llm.to_markdown(**_kwargs)

        progress("assembling", 90, total_pages=total_pages)

        asset_count = 0

        if include_images and tmp_image_dir and os.path.isdir(tmp_image_dir):
            image_extensions = (".png", ".jpg", ".jpeg", ".webp")

            for fname in os.listdir(tmp_image_dir):
                if not fname.lower().endswith(image_extensions):
                    continue
                src  = os.path.join(tmp_image_dir, fname)
                dest = os.path.join(output_folder, fname)
                shutil.move(src, dest)
                asset_count += 1

            md_text = markdown_image_paths(md_text, tmp_image_dir, output_folder)

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
                "assetCount": asset_count,
            },
        }

    except Exception as exc:
        return {"success": False, "error": str(exc), "engine": "pymupdf4llm"}

    finally:
        if tmp_image_dir and os.path.isdir(tmp_image_dir):
            try:
                shutil.rmtree(tmp_image_dir)
            except Exception:
                pass


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
