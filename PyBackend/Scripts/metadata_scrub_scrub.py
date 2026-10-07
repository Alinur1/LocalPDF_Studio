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
from metadata_scrub import scrub_pdf, ALLOWED_CATEGORIES


class metadata_scrub_scrub:
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
        categories = request.get("categories", [])
        if not pdf_path or not os.path.exists(pdf_path):
            print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
            sys.exit(1)
        if not output_path:
            print(json.dumps({"success": False, "error": "No output path provided"}))
            sys.exit(1)
        valid = [c for c in (categories or []) if c in ALLOWED_CATEGORIES]
        if not valid:
            print(json.dumps({"success": False, "error": "No valid categories selected"}))
            sys.exit(1)
        result = scrub_pdf(pdf_path, output_path, valid)
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
        sys.exit(1)
