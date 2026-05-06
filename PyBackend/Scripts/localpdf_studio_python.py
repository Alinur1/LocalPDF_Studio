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
        print(json.dumps({"success": False, "error": "No command specified. Available: watermark, extract_images, convert_pdf_images, grayscale, redact"}))
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
    elif command == "pdf_to_markdown":
        from pdf_to_markdown import main as _main
        _main()
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: '{command}'. Available: watermark, extract_images, convert_pdf_images, grayscale, redact"}))
        sys.exit(1)


# ============================================================
# add_watermark
# ============================================================
import argparse
import fitz  # PyMuPDF
import os
import io
import zipfile
import base64
import tempfile
from PIL import Image, ImageDraw, ImageFont


def _watermark_add_text_watermark(input_path, output_path, text, position, rotation, opacity,
                                   font_size, text_color, start_page, end_page, pages_range, custom_pages,
                                   watermark_type="text", image_path=None, image_scale=50):
    try:
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}

        if watermark_type == "image":
            if not image_path or not os.path.exists(image_path):
                return {"success": False, "error": f"Image file not found: {image_path}"}
            return _watermark_add_image_watermark(input_path, output_path, image_path, position, rotation,
                                                  opacity, image_scale, start_page, end_page, pages_range, custom_pages)
        else:
            doc = fitz.open(input_path)
            total_pages = doc.page_count
            target_pages = _watermark_parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)

            for page_num in target_pages:
                if page_num < 1 or page_num > total_pages:
                    continue
                page = doc[page_num - 1]
                if position == "Tiled":
                    _watermark_add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation)
                else:
                    _watermark_add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation)

            doc.save(output_path)
            doc.close()
            return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}

    except Exception as e:
        return {"success": False, "error": str(e)}


def _watermark_add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation):
    watermark_image = _watermark_create_high_quality_image(text, font_size, text_color, opacity, rotation)
    img_bytes = io.BytesIO()
    watermark_image.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    pix = fitz.Pixmap(img_bytes.read())
    dpi = 300
    width_in_points = pix.width * 72 / dpi
    height_in_points = pix.height * 72 / dpi
    rect = _watermark_calculate_position(page.rect, position, width_in_points, height_in_points)
    page.insert_image(rect, pixmap=pix)
    pix = None


def _watermark_add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation):
    page_rect = page.rect
    page_width = page_rect.width
    page_height = page_rect.height
    watermark_image = _watermark_create_high_quality_image(text, font_size, text_color, opacity, rotation)
    img_bytes = io.BytesIO()
    watermark_image.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    pix = fitz.Pixmap(img_bytes.read())
    dpi = 300
    watermark_width = pix.width * 72 / dpi
    watermark_height = pix.height * 72 / dpi
    center_x = page_width / 2
    center_y = page_height / 2
    positions = [
        (center_x - watermark_width / 2, center_y - watermark_height / 2),
        (center_x - watermark_width / 2, center_y / 3 - watermark_height / 2),
        (center_x - watermark_width / 2, center_y * 5 / 3 - watermark_height / 2)
    ]
    for x, y in positions:
        rect = fitz.Rect(x, y, x + watermark_width, y + watermark_height)
        page.insert_image(rect, pixmap=pix)
    pix = None


def _watermark_create_high_quality_image(text, font_size, text_color, opacity, rotation):
    dpi = 300
    scale_factor = dpi / 72.0
    font_paths = [
        "arial.ttf", "Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
        "C:/Windows/Fonts/verdana.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Verdana.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf"
    ]
    font = None
    for font_path in font_paths:
        try:
            scaled_font_size = int(font_size * scale_factor)
            font = ImageFont.truetype(font_path, scaled_font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    temp_image = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_image)
    try:
        bbox = temp_draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except Exception:
        text_width = len(text) * font_size * scale_factor
        text_height = font_size * scale_factor

    padding = int(font_size * scale_factor * 0.8)
    width = int(text_width + padding * 2)
    height = int(text_height + padding * 2)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x = (width - text_width) // 2
    y = (height - text_height) // 2

    if text_color.startswith('#'):
        r = int(text_color[1:3], 16)
        g = int(text_color[3:5], 16)
        b = int(text_color[5:7], 16)
    else:
        r, g, b = 52, 152, 219

    alpha = int(255 * opacity / 100)
    draw.text((x, y), text, fill=(r, g, b, alpha), font=font)
    if rotation != 0:
        image = image.rotate(-rotation, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
    return image


def _watermark_calculate_position(page_rect, position, img_width, img_height):
    page_width = page_rect.width
    page_height = page_rect.height
    margin_x = page_width * 0.05
    margin_y = page_height * 0.05
    if position == "Center" or position == "Tiled":
        x = (page_width - img_width) / 2
        y = (page_height - img_height) / 2
    elif position == "TopLeft":
        x, y = margin_x, margin_y
    elif position == "TopRight":
        x, y = page_width - img_width - margin_x, margin_y
    elif position == "BottomLeft":
        x, y = margin_x, page_height - img_height - margin_y
    elif position == "BottomRight":
        x, y = page_width - img_width - margin_x, page_height - img_height - margin_y
    else:
        x = (page_width - img_width) / 2
        y = (page_height - img_height) / 2
    return fitz.Rect(x, y, x + img_width, y + img_height)


def _watermark_parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages):
    if pages_range == "all":
        return list(range(1, total_pages + 1))
    elif pages_range == "first":
        return [1]
    elif pages_range == "last":
        return [total_pages]
    elif pages_range == "custom" and custom_pages:
        return _watermark_parse_custom_pages(custom_pages, total_pages)
    else:
        start = max(1, start_page)
        end = min(total_pages, end_page) if end_page > 0 else total_pages
        return list(range(start, end + 1))


def _watermark_parse_custom_pages(custom_pages, total_pages):
    pages = set()
    for part in custom_pages.split(','):
        part = part.strip()
        if '-' in part:
            parts = part.split('-')
            if len(parts) == 2:
                try:
                    for p in range(int(parts[0]), int(parts[1]) + 1):
                        if 1 <= p <= total_pages:
                            pages.add(p)
                except ValueError:
                    continue
        else:
            try:
                p = int(part)
                if 1 <= p <= total_pages:
                    pages.add(p)
            except ValueError:
                continue
    return sorted(pages)


def _watermark_add_image_watermark(input_path, output_path, image_path, position, rotation, opacity,
                                    image_scale, start_page, end_page, pages_range, custom_pages):
    try:
        doc = fitz.open(input_path)
        total_pages = doc.page_count
        target_pages = _watermark_parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)
        for page_num in target_pages:
            if page_num < 1 or page_num > total_pages:
                continue
            page = doc[page_num - 1]
            if position == "Tiled":
                _watermark_add_tiled_image(page, image_path, image_scale, opacity, rotation)
            else:
                _watermark_add_single_image(page, image_path, position, image_scale, opacity, rotation)
        doc.save(output_path)
        doc.close()
        return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _watermark_add_single_image(page, image_path, position, image_scale, opacity, rotation):
    with Image.open(image_path) as img:
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        if opacity < 100:
            alpha = img.split()[3] if len(img.split()) > 3 else Image.new('L', img.size, 255)
            alpha = alpha.point(lambda p: p * opacity // 100)
            img.putalpha(alpha)
        if rotation != 0:
            img = img.rotate(-rotation, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        pix = fitz.Pixmap(img_bytes.read())
        scale_factor = image_scale / 100.0
        rect = _watermark_calculate_position(page.rect, position, pix.width * scale_factor, pix.height * scale_factor)
        page.insert_image(rect, pixmap=pix)
        pix = None


def _watermark_add_tiled_image(page, image_path, image_scale, opacity, rotation):
    page_rect = page.rect
    page_width = page_rect.width
    page_height = page_rect.height
    with Image.open(image_path) as img:
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        if opacity < 100:
            alpha = img.split()[3] if len(img.split()) > 3 else Image.new('L', img.size, 255)
            alpha = alpha.point(lambda p: p * opacity // 100)
            img.putalpha(alpha)
        if rotation != 0:
            img = img.rotate(-rotation, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        pix = fitz.Pixmap(img_bytes.read())
    scale_factor = image_scale / 100.0
    watermark_width = pix.width * scale_factor
    watermark_height = pix.height * scale_factor
    center_x = page_width / 2
    center_y = page_height / 2
    positions = [
        (center_x - watermark_width / 2, center_y - watermark_height / 2),
        (center_x - watermark_width / 2, center_y / 3 - watermark_height / 2),
        (center_x - watermark_width / 2, center_y * 5 / 3 - watermark_height / 2)
    ]
    for x, y in positions:
        page.insert_image(fitz.Rect(x, y, x + watermark_width, y + watermark_height), pixmap=pix)
    pix = None


def _watermark_main_func(input_path, output_path, watermark_type="text", text="CONFIDENTIAL",
                          image_path=None, position="Center", rotation=45, opacity=60,
                          font_size=36, text_color="#3498db", image_scale=50,
                          start_page=1, end_page=0, pages_range="all", custom_pages=""):
    try:
        input_path = os.path.normpath(input_path)
        output_path = os.path.normpath(output_path)
        if image_path:
            image_path = os.path.normpath(image_path)
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}
        if watermark_type == "image" and (not image_path or not os.path.exists(image_path)):
            return {"success": False, "error": f"Image file not found: {image_path}"}

        doc = fitz.open(input_path)
        total_pages = doc.page_count
        target_pages = _watermark_parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)

        for page_num in target_pages:
            if page_num < 1 or page_num > total_pages:
                continue
            page = doc[page_num - 1]
            if watermark_type == "image":
                if position == "Tiled":
                    _watermark_add_tiled_image(page, image_path, image_scale, opacity, rotation)
                else:
                    _watermark_add_single_image(page, image_path, position, image_scale, opacity, rotation)
            else:
                if position == "Tiled":
                    _watermark_add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation)
                else:
                    _watermark_add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation)

        doc.save(output_path)
        doc.close()
        return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Namespace shim so "from add_watermark import main" works inside main()
class add_watermark:
    @staticmethod
    def main():
        parser = argparse.ArgumentParser(description="Add watermark to PDF pages")
        parser.add_argument("input")
        parser.add_argument("output")
        parser.add_argument("--watermark-type", type=str, default="text", choices=["text", "image"])
        parser.add_argument("--text", type=str, default="CONFIDENTIAL")
        parser.add_argument("--font-size", type=int, default=36)
        parser.add_argument("--text-color", type=str, default="#3498db")
        parser.add_argument("--image-path", type=str)
        parser.add_argument("--image-scale", type=int, default=50)
        parser.add_argument("--position", type=str, default="Center",
                            choices=["Center", "TopLeft", "TopRight", "BottomLeft", "BottomRight", "Tiled"])
        parser.add_argument("--rotation", type=int, default=45)
        parser.add_argument("--opacity", type=int, default=60)
        parser.add_argument("--start-page", type=int, default=1)
        parser.add_argument("--end-page", type=int, default=0)
        parser.add_argument("--pages-range", type=str, default="all", choices=["all", "first", "last", "custom"])
        parser.add_argument("--custom-pages", type=str, default="")
        parser.add_argument("--json", action="store_true")
        args = parser.parse_args()
        result = _watermark_main_func(
            input_path=args.input, output_path=args.output,
            watermark_type=args.watermark_type, text=args.text,
            image_path=args.image_path, position=args.position,
            rotation=args.rotation, opacity=args.opacity,
            font_size=args.font_size, text_color=args.text_color,
            image_scale=args.image_scale, start_page=args.start_page,
            end_page=args.end_page, pages_range=args.pages_range,
            custom_pages=args.custom_pages
        )
        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"✅ Added {args.watermark_type} watermark to {result['watermarked_pages']} pages")
            else:
                print(f"❌ Error: {result['error']}")


# ============================================================
# extract_images
# ============================================================

def _extract_images_from_pdf(pdf_path, pages=None, page_ranges=None, mode="extract"):
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
            return _extract_images_extract(doc, pages_to_process)
        else:
            return _extract_images_remove(doc, pages_to_process, pdf_path)

    except Exception as e:
        return {"success": False, "error": f"Error processing PDF: {str(e)}", "extracted_count": 0, "processed_pages": 0}
    finally:
        if 'doc' in locals():
            doc.close()


def _extract_images_extract(doc, pages_to_process):
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


def _extract_images_remove(doc, pages_to_process, original_path):
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
    @staticmethod
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
            result = _extract_images_from_pdf(pdf_path, pages, page_ranges, mode)
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
            sys.exit(1)


# ============================================================
# convert_pdf_images
# ============================================================

def _convert_pdf_to_images(input_path, output_path, dpi=150, fmt="jpg", include_page_numbers=True):
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
    @staticmethod
    def main():
        parser = argparse.ArgumentParser(description="Convert PDF pages to images and zip them.")
        parser.add_argument("input")
        parser.add_argument("output")
        parser.add_argument("--dpi", type=int, default=150)
        parser.add_argument("--format", type=str, default="jpg")
        parser.add_argument("--include-page-numbers", action="store_true")
        parser.add_argument("--json", action="store_true")
        args = parser.parse_args()
        result = _convert_pdf_to_images(
            input_path=args.input, output_path=args.output,
            dpi=args.dpi, fmt=args.format, include_page_numbers=args.include_page_numbers
        )
        if args.json:
            print(json.dumps(result))
        else:
            if result["success"]:
                print(f"✅ Converted {result['page_count']} pages → {result['format'].upper()} (DPI={result['dpi']})")
            else:
                print(f"❌ Error: {result['error']}")


# ============================================================
# pdf_to_grayscale
# ============================================================

def _grayscale_convert_vector(input_path, output_path, custom_pages=None):
    """Mode 1: Preserve text selectability using recolor()"""
    try:
        doc = fitz.open(input_path)
        output_doc = fitz.open()
        total_pages = len(doc)
        pages_to_convert = set()

        if custom_pages:
            for part in custom_pages.split(','):
                part = part.strip()
                if not part: continue
                if '-' in part:
                    start, end = map(int, part.split('-'))
                    pages_to_convert.update(range(start - 1, end))
                else:
                    pages_to_convert.add(int(part) - 1)
        else:
            pages_to_convert = set(range(total_pages))

        converted_count = 0
        for i in range(total_pages):
            if i in pages_to_convert:
                # Convert using recolor() - preserves text, vectors, annotations
                temp_doc = fitz.open()
                temp_doc.insert_pdf(doc, from_page=i, to_page=i)
                temp_doc.recolor(components=1)
                output_doc.insert_pdf(temp_doc, from_page=0, to_page=0)
                temp_doc.close()
                converted_count += 1
            else:
                # Keep page exactly as-is
                output_doc.insert_pdf(doc, from_page=i, to_page=i)

            sys.stderr.write(f"PROGRESS:{int(((i + 1) / total_pages) * 100)}\n")

        output_doc.save(output_path, garbage=4, deflate=True)
        output_doc.close()
        doc.close()

        return {
            "success": True,
            "output": f"Successfully converted {converted_count} pages to grayscale (text preserved)",
            "error": "",
            "pageCount": total_pages,
            "convertedPages": converted_count,
            "hasImages": True,
            "hasVectorGraphics": True
        }
    except Exception as e:
        return {"success": False, "output": "", "error": str(e), "pageCount": 0, "convertedPages": 0, "hasImages": False, "hasVectorGraphics": False}


def _grayscale_convert_raster(input_path, output_path, custom_pages=None):
    """Mode 2: Convert pages to images (fallback for complex PDFs)"""
    try:
        doc = fitz.open(input_path)
        output_doc = fitz.open()
        total_pages = len(doc)

        pages_to_convert = set()
        if custom_pages:
            for part in custom_pages.split(','):
                part = part.strip()
                if not part: continue
                if '-' in part:
                    start, end = map(int, part.split('-'))
                    pages_to_convert.update(range(start - 1, end))
                else:
                    pages_to_convert.add(int(part) - 1)
        else:
            pages_to_convert = set(range(total_pages))

        converted_count = 0
        for i in range(total_pages):
            page = doc[i]
            should_convert = i in pages_to_convert
            
            # Use 2.0 zoom for reasonable quality
            zoom = 2.0
            mat = fitz.Matrix(zoom, zoom)
            
            if should_convert:
                pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
                converted_count += 1
            else:
                pix = page.get_pixmap(matrix=mat)
            
            rect = page.rect
            new_page = output_doc.new_page(width=rect.width, height=rect.height)
            new_page.insert_image(rect, pixmap=pix)
            
            sys.stderr.write(f"PROGRESS:{int(((i + 1) / total_pages) * 100)}\n")

        output_doc.save(output_path, garbage=4, deflate=True)
        output_doc.close()
        doc.close()

        return {
            "success": True, "output": f"Successfully converted {converted_count} pages to grayscale (rasterized)",
            "error": "", "pageCount": total_pages, "convertedPages": converted_count,
            "hasImages": True, "hasVectorGraphics": True
        }
    except Exception as e:
        return {"success": False, "output": "", "error": str(e), "pageCount": 0, "convertedPages": 0, "hasImages": False, "hasVectorGraphics": False}


def _grayscale_convert(input_path, output_path, custom_pages=None, mode="vector"):
    if mode == "raster":
        return _grayscale_convert_raster(input_path, output_path, custom_pages)
    else:  # default
        return _grayscale_convert_vector(input_path, output_path, custom_pages)


class pdf_to_grayscale:
    @staticmethod
    def main():
        args = {'input_path': None, 'output_path': None, 'custom_pages': None, 'mode': 'vector'}
        i = 1
        while i < len(sys.argv):
            arg = sys.argv[i]
            if arg == '--custom-pages' and i + 1 < len(sys.argv):
                args['custom_pages'] = sys.argv[i + 1].strip('"')
                i += 2
            elif arg == '--mode' and i + 1 < len(sys.argv):
                mode_value = sys.argv[i + 1].strip('"').lower()
                if mode_value in ['vector', 'raster']:
                    args['mode'] = mode_value
                i += 2
            elif not arg.startswith('--'):
                if args['input_path'] is None:
                    args['input_path'] = arg.strip('"')
                elif args['output_path'] is None:
                    args['output_path'] = arg.strip('"')
                i += 1
            else:
                i += 1

        if args['input_path'] is None or args['output_path'] is None:
            print(json.dumps({"success": False, "error": "Usage: grayscale input.pdf output.pdf [--custom-pages \"1,2,3-6\"] [--mode vector|raster]"}))
            return 1

        result = _grayscale_convert(args['input_path'], args['output_path'], args['custom_pages'], args['mode'])
        print(json.dumps(result))
        return 0 if result["success"] else 1


# ============================================================
# redact_pdf
# ============================================================

def _redact_hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return (r / 255.0, g / 255.0, b / 255.0)


def _redact_apply(input_path, output_path, redactions):
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
                    page.add_redact_annot(fitz.Rect(x0, y0, x1, y1), fill=_redact_hex_to_rgb(redact['color']))
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
    @staticmethod
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

        return _redact_apply(input_pdf, output_pdf, redactions_data)

# ============================================================
# pdf_to_markdown
# ============================================================

import json
import os
import re
import shutil
import sys
import tempfile


def _progress(stage, value, page=None, total_pages=None):
    payload = {"stage": stage, "value": value}
    if page is not None: payload["page"] = page
    if total_pages is not None: payload["totalPages"] = total_pages
    sys.stderr.write("PROGRESS_JSON:" + json.dumps(payload) + "\n")
    sys.stderr.flush()


def _load_dependencies():
    missing = []
    modules = {}
    for pkg in ["fitz", "pymupdf4llm"]:
        try:
            import importlib
            modules[pkg] = importlib.import_module(pkg)
        except Exception:
            missing.append(pkg)
    return modules, missing


def _convert(input_path, output_folder, pdf_stem, options):
    modules, missing = _load_dependencies()

    if missing:
        return {
            "success":             False,
            "error":               "Missing required Python dependencies: " + ", ".join(missing),
            "missingDependencies": missing,
            "engine":              "pymupdf4llm",
        }

    fitz        = modules["fitz"]
    pymupdf4llm = modules["pymupdf4llm"]

    include_images = bool(options.get("includeImages", True))
    strip_header   = bool(options.get("stripHeader",   True))
    strip_footer   = bool(options.get("stripFooter",   True))
    char_margin    = float(options.get("charMargin",   0.5))

    output_md_path = os.path.join(output_folder, f"{pdf_stem}.md")

    _progress("loading", 5)

    try:
        fitz_doc    = fitz.open(input_path)
        total_pages = len(fitz_doc)
        fitz_doc.close()
    except Exception as exc:
        return {"success": False, "error": f"Failed to open PDF: {exc}", "engine": "pymupdf4llm"}

    _progress("analyzing", 10, total_pages=total_pages)

    tmp_image_dir = None

    try:
        _progress("converting", 20, total_pages=total_pages)

        if include_images:
            # Create a temp dir
            tmp_image_dir = tempfile.mkdtemp(prefix="localpdf_md_images_")
            # Add trailing separator for pymupdf4llm
            image_path_arg = tmp_image_dir.rstrip("/\\") + os.sep
        else:
            image_path_arg = None

        md_text = pymupdf4llm.to_markdown(
            doc          = input_path,
            write_images = include_images,
            image_path   = image_path_arg,
            image_format = "png",
            dpi          = 150,
            show_warning = False,
            header       = not strip_header,
            footer       = not strip_footer,
            char_margin  = char_margin,
        )

        _progress("assembling", 90, total_pages=total_pages)

        asset_count = 0

        if include_images and tmp_image_dir and os.path.isdir(tmp_image_dir):
            image_extensions = (".png", ".jpg", ".jpeg", ".webp")

            # Move every extracted image from temp dir to output_folder
            for fname in os.listdir(tmp_image_dir):
                if not fname.lower().endswith(image_extensions):
                    continue
                src  = os.path.join(tmp_image_dir, fname)
                dest = os.path.join(output_folder, fname)
                shutil.move(src, dest)
                asset_count += 1

            normalised_tmp = tmp_image_dir.replace("\\", "/").rstrip("/")
            md_text = md_text.replace("\\", "/")
            md_text = re.sub(
                re.escape(normalised_tmp) + r"[/\\]?",
                "",
                md_text
            )

        # Write the markdown file into the output folder
        with open(output_md_path, "w", encoding="utf-8") as f:
            f.write(md_text)

        _progress("done", 100, total_pages=total_pages)

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
        # Cleanup temp folder
        if tmp_image_dir and os.path.isdir(tmp_image_dir):
            try:
                shutil.rmtree(tmp_image_dir)
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
# Module entry-point — called by the main dispatcher
# ══════════════════════════════════════════════════════════════════════════════

class pdf_to_markdown:
    @staticmethod
    def main():
        """
        Usage:
            pdf_to_markdown <input.pdf> <output_folder> <pdf_stem>
                            [--no-images]
                            [--keep-header]
                            [--keep-footer]

        <output_folder>  — folder C# already created for this conversion
        <pdf_stem>       — PDF filename without extension, used to name the .md file
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
                if   args["input_path"]    is None: args["input_path"]    = arg.strip('"')
                elif args["output_folder"] is None: args["output_folder"] = arg.strip('"')
                elif args["pdf_stem"]      is None: args["pdf_stem"]      = arg.strip('"')
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

        result = _convert(args["input_path"], args["output_folder"], args["pdf_stem"], options)
        print(json.dumps(result))
        return 0 if result.get("success") else 1


# ══════════════════════════════════════════════════════════════════════════════
# Module entry-point — called by the main dispatcher
# ══════════════════════════════════════════════════════════════════════════════

class pdf_to_markdown:
    @staticmethod
    def main():
        """
        Usage:
            pdf_to_markdown <input.pdf> <output_folder> <pdf_stem>
                            [--no-images]
                            [--keep-header]
                            [--keep-footer]

        <output_folder>  — the folder C# already created for this conversion
        <pdf_stem>       — PDF filename without extension, used to name the .md file
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
                if   args["input_path"]    is None: args["input_path"]    = arg.strip('"')
                elif args["output_folder"] is None: args["output_folder"] = arg.strip('"')
                elif args["pdf_stem"]      is None: args["pdf_stem"]      = arg.strip('"')
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

        result = _convert(args["input_path"], args["output_folder"], args["pdf_stem"], options)
        print(json.dumps(result))
        return 0 if result.get("success") else 1

# ============================================================
# Module shims — allow "from X import main" inside main()
# ============================================================
import types as _types

def _make_module(name, main_func):
    mod = _types.ModuleType(name)
    mod.main = main_func
    sys.modules[name] = mod

_make_module("add_watermark",       add_watermark.main)
_make_module("extract_images",      extract_images.main)
_make_module("convert_pdf_images",  convert_pdf_images.main)
_make_module("pdf_to_grayscale",    pdf_to_grayscale.main)
_make_module("redact_pdf",          redact_pdf.main)
_make_module("pdf_to_markdown",     pdf_to_markdown.main)


if __name__ == "__main__":
    main()