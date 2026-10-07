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


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command specified. Available: watermark, extract_images, convert_pdf_images, grayscale, redact, metadata_scrub_scan, metadata_scrub_scrub, pdf_to_markdown, blank_duplicate_scan, pdf_to_excel"}))
        sys.exit(1)

    command = sys.argv[1]
    # Remove the command from argv so each script's argparse / sys.argv logic works normally
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    if command == "watermark":
        from add_watermark import main as _main
        _main()
    elif command == "extract_images":
        from extract_images import main as _main
        _main()
    elif command == "convert_pdf_images":
        from convert_pdf_images import main as _main
        _main()
    elif command == "grayscale":
        from pdf_to_grayscale import main as _main
        _main()
    elif command == "redact":
        from redact_pdf import main as _main
        _main()
    elif command == "metadata_scrub_scan":
        from metadata_scrub_scan import main as _main
        _main()
    elif command == "metadata_scrub_scrub":
        from metadata_scrub_scrub import main as _main
        _main()
    elif command == "pdf_to_markdown":
        from pdf_to_markdown import main as _main
        _main()
    elif command == "blank_duplicate_scan":
        from blank_duplicate_scan import main as _main
        _main()
    elif command == "pdf_to_excel":
        from pdf_to_excel import main as _main
        _main()
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: '{command}'. Available: watermark, extract_images, convert_pdf_images, grayscale, redact, metadata_scrub_scan, metadata_scrub_scrub, pdf_to_markdown, blank_duplicate_scan, pdf_to_excel"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
