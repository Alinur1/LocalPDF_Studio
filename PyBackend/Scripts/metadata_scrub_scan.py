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
from metadata_scrub import scan_pdf


def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "error": "No arguments provided"}))
            return
        json_file_path = sys.argv[1]
        with open(json_file_path, "r", encoding="utf-8") as f:
            request = json.load(f)
        pdf_path = request.get("file_path")
        if not pdf_path or not os.path.exists(pdf_path):
            print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
            return
        result = scan_pdf(pdf_path)
        print(json.dumps(result))
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))


if __name__ == "__main__":
    main()
