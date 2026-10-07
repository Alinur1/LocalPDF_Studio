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
import base64
import pymupdf as fitz


def extract_images_from_pdf(pdf_path, pages=None, page_ranges=None, mode="extract"):
    try:
        doc = fitz.open(pdf_path)
        total_pages = doc.page_count
        pages_to_process = set()

        if not pages and not page_ranges:
            pages_to_process = set(range(total_pages))
        else:
            if pages:
                for page_num in pages:
                    if 1 <= page_num <= total_pages:
                        pages_to_process.add(page_num - 1)
            if page_ranges:
                for range_str in page_ranges:
                    if '-' in range_str:
                        start_str, end_str = range_str.split('-', 1)
                        try:
                            for page_num in range(int(start_str.strip()), int(end_str.strip()) + 1):
                                if 1 <= page_num <= total_pages:
                                    pages_to_process.add(page_num - 1)
                        except ValueError:
                            continue
                    else:
                        try:
                            page_num = int(range_str.strip())
                            if 1 <= page_num <= total_pages:
                                pages_to_process.add(page_num - 1)
                        except ValueError:
                            continue

        pages_to_process = sorted(pages_to_process)
        if mode == "extract":
            return extract(doc, pages_to_process)
        else:
            return remove(doc, pages_to_process, pdf_path)

    except Exception as e:
        return {"success": False, "error": f"Error processing PDF: {str(e)}", "extracted_count": 0, "processed_pages": 0}
    finally:
        if 'doc' in locals():
            doc.close()


def extract(doc, pages_to_process):
    all_images = []
    total_images = 0
    for page_index in pages_to_process:
        page = doc[page_index]
        for img_index, img in enumerate(page.get_images()):
            try:
                xref = img[0]
                pix = fitz.Pixmap(doc, xref)
                if pix.n - pix.alpha < 4:
                    all_images.append({
                        "page": page_index + 1,
                        "index": img_index,
                        "width": pix.width,
                        "height": pix.height,
                        "format": "png",
                        "data": base64.b64encode(pix.tobytes("png")).decode('ascii')
                    })
                    total_images += 1
                pix = None
            except Exception as e:
                print(f"Warning: Failed to extract image {img_index} from page {page_index + 1}: {e}", file=sys.stderr)
                continue
    return {"success": True, "extracted_count": total_images, "processed_pages": len(pages_to_process), "images": all_images}


def remove(doc, pages_to_process, original_path):
    try:
        new_doc = fitz.open()
        new_doc.insert_pdf(doc)
        images_removed_count = 0
        for page_index in pages_to_process:
            if page_index < len(new_doc):
                page = new_doc[page_index]
                for img in page.get_images():
                    xref = img[0]
                    try:
                        new_doc._deleteObject(xref)
                        images_removed_count += 1
                    except Exception as e:
                        print(f"Warning: Could not remove image xref {xref}: {e}", file=sys.stderr)
                        continue
        pdf_buffer = io.BytesIO()
        new_doc.save(pdf_buffer)
        pdf_data = pdf_buffer.getvalue()
        new_doc.close()
        if not pdf_data:
            return {"success": False, "error": "Failed to generate PDF data", "processed_pages": 0}
        return {
            "success": True,
            "processed_pages": len(pages_to_process),
            "pdf_data": base64.b64encode(pdf_data).decode('ascii'),
            "removed_images_count": images_removed_count
        }
    except Exception as e:
        if 'new_doc' in locals():
            new_doc.close()
        return {"success": False, "error": f"Error removing images: {str(e)}", "processed_pages": 0}


class extract_images:
    pass


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided"}))
        sys.exit(1)
    try:
        json_file_path = sys.argv[1]
        with open(json_file_path, 'r', encoding='utf-8') as f:
            request = json.load(f)
        pdf_path = request.get("file_path")
        pages = request.get("pages")
        page_ranges = request.get("page_ranges")
        mode = request.get("mode", "extract")
        if not pdf_path or not os.path.exists(pdf_path):
            print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
            sys.exit(1)
        result = extract_images_from_pdf(pdf_path, pages, page_ranges, mode)
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
        sys.exit(1)
