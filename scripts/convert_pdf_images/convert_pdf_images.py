#!/usr/bin/env python3
import argparse
import fitz  # PyMuPDF
import os
import sys
import json
import zipfile
from PIL import Image


def convert_pdf_to_images(input_path, output_path, dpi=150, fmt="jpg", include_page_numbers=True):
    try:
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}

        fmt = fmt.lower()
        if fmt not in ["jpg", "jpeg", "png"]:
            return {"success": False, "error": f"Unsupported format: {fmt}"}

        # Create temp directory for images
        temp_dir = os.path.join(os.path.dirname(output_path), f"pdf_to_img_{os.getpid()}")
        os.makedirs(temp_dir, exist_ok=True)

        doc = fitz.open(input_path)
        total_pages = doc.page_count

        base_name = os.path.splitext(os.path.basename(input_path))[0]
        image_files = []

        for i, page in enumerate(doc):
            zoom = dpi / 72.0
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)

            if include_page_numbers:
                file_name = f"{base_name}_page_{i + 1:03d}.{fmt}"
            else:
                file_name = f"{base_name}_{i + 1}.{fmt}"

            image_path = os.path.join(temp_dir, file_name)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            if fmt in ["jpg", "jpeg"]:
                img.save(image_path, "JPEG", quality=95)
            else:
                img.save(image_path, "PNG", compress_level=6)

            image_files.append(image_path)

        # Zip all images
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for f in image_files:
                zipf.write(f, os.path.basename(f))

        # Cleanup
        for f in image_files:
            try:
                os.remove(f)
            except Exception:
                pass
        try:
            os.rmdir(temp_dir)
        except Exception:
            pass

        return {
            "success": True,
            "page_count": total_pages,
            "output": output_path,
            "format": fmt,
            "dpi": dpi,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Convert PDF pages to images and zip them.")
    parser.add_argument("input", help="Path to input PDF file")
    parser.add_argument("output", help="Path to output ZIP file")
    parser.add_argument("--dpi", type=int, default=150, help="DPI for image quality (72,150,300)")
    parser.add_argument("--format", type=str, default="jpg", help="Image format: jpg or png")
    parser.add_argument("--include-page-numbers", action="store_true", help="Include page numbers in filenames")
    parser.add_argument("--json", action="store_true", help="Return JSON result for .NET backend")

    args = parser.parse_args()

    result = convert_pdf_to_images(
        input_path=args.input,
        output_path=args.output,
        dpi=args.dpi,
        fmt=args.format,
        include_page_numbers=args.include_page_numbers,
    )

    if args.json:
        print(json.dumps(result))
    else:
        if result["success"]:
            print(f"✅ Converted {result['page_count']} pages → {result['format'].upper()} (DPI={result['dpi']})")
        else:
            print(f"❌ Error: {result['error']}")


if __name__ == "__main__":
    main()
