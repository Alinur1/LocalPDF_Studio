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
import json
import argparse
import pymupdf as fitz


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return (r / 255.0, g / 255.0, b / 255.0)


def apply_redactions(input_path, output_path, redactions):
    try:
        fitz.TOOLS.mupdf_display_errors(False)
        doc = fitz.open(input_path)
        total_redactions = 0
        pages_redacted = set()
        redactions_by_page = {}
        for redaction in redactions:
            page_num = redaction['page']
            redactions_by_page.setdefault(page_num, []).append(redaction)

        for page_num, page_redactions in redactions_by_page.items():
            if page_num < 1 or page_num > len(doc):
                print(f"Warning: Page {page_num} out of range, skipping", file=sys.stderr)
                continue
            page = doc[page_num - 1]
            page_width = page.rect.width
            page_height = page.rect.height
            for redact in page_redactions:
                try:
                    x0 = redact['x'] * page_width
                    y0 = redact['y'] * page_height
                    x1 = x0 + (redact['width'] * page_width)
                    y1 = y0 + (redact['height'] * page_height)
                    page.add_redact_annot(fitz.Rect(x0, y0, x1, y1), fill=hex_to_rgb(redact['color']))
                    total_redactions += 1
                except Exception as e:
                    print(f"Error applying redaction on page {page_num}: {str(e)}", file=sys.stderr)
                    continue
            page.apply_redactions(images=2, graphics=fitz.PDF_REDACT_IMAGE_REMOVE)
            pages_redacted.add(page_num)

        doc.save(output_path, garbage=4, deflate=True, clean=True)
        doc.close()
        result = {
            "success": True, "total_redactions": total_redactions,
            "pages_redacted": len(pages_redacted), "pages_list": sorted(list(pages_redacted)),
            "output_file": output_path
        }
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        return 1


class redact_pdf:
    pass


def main():
    parser = argparse.ArgumentParser(description='Securely redact PDF areas using PyMuPDF')
    parser.add_argument('payload_path', help='Path to the JSON file containing all redaction data')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()

    try:
        with open(args.payload_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        input_pdf = data.get('file_path')
        output_pdf = data.get('output_path')
        redactions_data = data.get('redactions')

        if not input_pdf or not output_pdf or not isinstance(redactions_data, list):
            raise ValueError("Payload missing required fields: file_path, output_path, or redactions")

        for i, redact in enumerate(redactions_data):
            if not all(k in redact for k in ('page', 'x', 'y', 'width', 'height', 'color')):
                print(json.dumps({"success": False, "error": f"Redaction index {i} is incomplete"}))
                return 1

    except Exception as e:
        print(json.dumps({"success": False, "error": f"Failed to parse payload: {str(e)}"}))
        return 1

    return apply_redactions(input_pdf, output_pdf, redactions_data)
