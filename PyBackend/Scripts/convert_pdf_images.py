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
import json
import zipfile
import argparse
import fitz  # PyMuPDF
from PIL import Image


def convert_pdf_to_images(input_path, output_path, dpi=150, fmt="jpg", include_page_numbers=True):
    try:
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}
        fmt = fmt.lower()
        if fmt not in ["jpg", "jpeg", "png"]:
            return {"success": False, "error": f"Unsupported format: {fmt}"}

        temp_dir = os.path.join(os.path.dirname(output_path), f"pdf_to_img_{os.getpid()}")
        os.makedirs(temp_dir, exist_ok=True)

        doc = fitz.open(input_path)
        total_pages = doc.page_count
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        image_files = []

        for i, page in enumerate(doc):
            zoom = dpi / 72.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            file_name = f"{base_name}_page_{i + 1:03d}.{fmt}" if include_page_numbers else f"{base_name}_{i + 1}.{fmt}"
            image_path = os.path.join(temp_dir, file_name)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            if fmt in ["jpg", "jpeg"]:
                img.save(image_path, "JPEG", quality=95)
            else:
                img.save(image_path, "PNG", compress_level=6)
            image_files.append(image_path)

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for f in image_files:
                zipf.write(f, os.path.basename(f))

        for f in image_files:
            try:
                os.remove(f)
            except Exception:
                pass
        try:
            os.rmdir(temp_dir)
        except Exception:
            pass

        return {"success": True, "page_count": total_pages, "output": output_path, "format": fmt, "dpi": dpi}
    except Exception as e:
        return {"success": False, "error": str(e)}


class convert_pdf_images:
    pass


def main():
    parser = argparse.ArgumentParser(description="Convert PDF pages to images and zip them.")
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--format", type=str, default="jpg")
    parser.add_argument("--include-page-numbers", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = convert_pdf_to_images(
        input_path=args.input, output_path=args.output,
        dpi=args.dpi, fmt=args.format, include_page_numbers=args.include_page_numbers
    )
    if args.json:
        print(json.dumps(result))
    else:
        if result["success"]:
            print(f"\u2705 Converted {result['page_count']} pages \u2192 {result['format'].upper()} (DPI={result['dpi']})")
        else:
            print(f"\u274c Error: {result['error']}")
