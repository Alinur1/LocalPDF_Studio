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
import importlib
import json

COMMANDS = {
    "watermark": "add_watermark",
    "extract_images": "extract_images",
    "convert_pdf_images": "convert_pdf_images",
    "grayscale": "pdf_to_grayscale",
    "redact": "redact_pdf",
    "metadata_scrub_scan": "metadata_scrub_scan",
    "metadata_scrub_scrub": "metadata_scrub_scrub",
    "pdf_to_markdown": "pdf_to_markdown",
    "blank_duplicate_scan": "blank_duplicate_scan",
    "pdf_to_excel": "pdf_to_excel",
}


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"success": False,
                          "error": f"No command specified. Available: {', '.join(COMMANDS)}"}))
        return 1

    command = sys.argv[1]
    # Remove the command from argv so each script's argparse / sys.argv logic works normally
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    module_name = COMMANDS.get(command)
    if module_name is None:
        print(json.dumps({"success": False,
                          "error": f"Unknown command: '{command}'. Available: {', '.join(COMMANDS)}"}))
        return 1

    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # missing vendored dependency, syntax error, ...
        print(json.dumps({"success": False,
                          "error": f"Failed to load module '{module_name}': {exc}"}))
        return 1

    module.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
