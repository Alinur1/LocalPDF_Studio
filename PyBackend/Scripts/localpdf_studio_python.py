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


# ============================================================
# add_watermark
# ============================================================
import argparse
import pymupdf as fitz  # PyMuPDF
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


_WATERMARK_DEFAULT_CJK_RANGES = [
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana
    (0x3400, 0x4DBF),  # CJK Unified Ideographs Extension A
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
    (0xAC00, 0xD7AF),  # Hangul Syllables
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]

_WATERMARK_DEFAULT_LATIN_FONTS = [
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
    "/System/Library/Fonts/Arial.ttf",
]


def _watermark_default_cjk_fonts():
    # Computed at call time so that paths resolve against this script's
    # actual location (which differs between dev source, packaged app,
    # and after scripts/setup-backend.js syncs the script).
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return [
        # Bundled with the app — packaged layout (extraResources) and
        # dev layout after scripts/setup-backend.js syncs the script.
        # script_dir = .../assets/backend_<os>/PyBackend/Scripts
        # font       = .../assets/fonts/GoNotoCJKCore.ttf
        os.path.join(script_dir, "..", "..", "..", "fonts", "GoNotoCJKCore.ttf"),
        # Repo source layout (running the script from PyBackend/Scripts directly).
        os.path.join(script_dir, "..", "..", "assets", "fonts", "GoNotoCJKCore.ttf"),
        # If anyone later places a font alongside PyBackend.
        os.path.join(script_dir, "..", "Fonts", "GoNotoCJKCore.ttf"),
        # macOS system CJK fonts.
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        # Windows system CJK fonts.
        "C:/Windows/Fonts/msyh.ttc",      # Microsoft YaHei
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/simsun.ttc",    # SimSun
        "C:/Windows/Fonts/simhei.ttf",    # SimHei
        "C:/Windows/Fonts/yugothm.ttc",   # Yu Gothic Medium (JP)
        "C:/Windows/Fonts/msgothic.ttc",  # MS Gothic (JP)
        "C:/Windows/Fonts/malgun.ttf",    # Malgun Gothic (KR)
        # Linux distributions.
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
    ]


# Cache filled lazily on first call. Sentinel `False` means "not yet loaded";
# resolved value (dict or None) replaces it on first read.
_WATERMARK_FONT_CONFIG_CACHE = False


def _watermark_load_font_config():
    """Load watermark font configuration from a JSON file (each key optional).

    Search order:
      1. $LOCALPDF_WATERMARK_FONTS_CONFIG (absolute path to a JSON file)
      2. <script_dir>/watermark_fonts.json

    Schema (any subset; missing keys fall back to hardcoded defaults; the
    file itself is also optional):

        {
          "cjk_font_paths":     ["/abs/path.ttf", "../relative/to/config.ttf"],
          "latin_font_paths":   ["..."],
          "cjk_unicode_ranges": [["4E00", "9FFF"], ["3040", "309F"]]
        }

    Relative `*_font_paths` are resolved against the config file's directory.
    Range bounds may be hex strings ("4E00") or ints (20000).
    Any parse error → fall back to defaults silently.
    """
    global _WATERMARK_FONT_CONFIG_CACHE
    if _WATERMARK_FONT_CONFIG_CACHE is not False:
        return _WATERMARK_FONT_CONFIG_CACHE

    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = []
    env = os.environ.get("LOCALPDF_WATERMARK_FONTS_CONFIG", "")
    if env:
        candidates.append(env)
    candidates.append(os.path.join(script_dir, "watermark_fonts.json"))

    for path in candidates:
        if not path or not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            base = os.path.dirname(os.path.abspath(path))
            _WATERMARK_FONT_CONFIG_CACHE = {
                "cjk_fonts":   _watermark_normalize_paths(cfg.get("cjk_font_paths"), base),
                "latin_fonts": _watermark_normalize_paths(cfg.get("latin_font_paths"), base),
                "cjk_ranges":  _watermark_normalize_ranges(cfg.get("cjk_unicode_ranges")),
                "_source":     path,
            }
            return _WATERMARK_FONT_CONFIG_CACHE
        except Exception:
            continue

    _WATERMARK_FONT_CONFIG_CACHE = None
    return None


def _watermark_normalize_paths(paths, base):
    if not isinstance(paths, list):
        return None
    out = []
    for p in paths:
        if not isinstance(p, str) or not p:
            continue
        out.append(p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p)))
    return out or None


def _watermark_normalize_ranges(ranges):
    if not isinstance(ranges, list):
        return None
    out = []
    for r in ranges:
        if not isinstance(r, (list, tuple)) or len(r) != 2:
            continue
        try:
            lo = int(r[0], 16) if isinstance(r[0], str) else int(r[0])
            hi = int(r[1], 16) if isinstance(r[1], str) else int(r[1])
        except (ValueError, TypeError):
            continue
        if lo <= hi:
            out.append((lo, hi))
    return out or None


def _watermark_has_cjk(text):
    # True if `text` contains Chinese / Japanese / Korean characters.
    # Latin fonts (Arial, Helvetica, DejaVu, ...) lack these glyphs and
    # render them as .notdef boxes ("tofu"), so we need a CJK-capable font.
    cfg = _watermark_load_font_config()
    ranges = (cfg or {}).get("cjk_ranges") or _WATERMARK_DEFAULT_CJK_RANGES
    for ch in text or "":
        cp = ord(ch)
        for lo, hi in ranges:
            if lo <= cp <= hi:
                return True
    return False


def _watermark_cjk_font_paths():
    cfg = _watermark_load_font_config()
    return (cfg or {}).get("cjk_fonts") or _watermark_default_cjk_fonts()


def _watermark_latin_font_paths():
    cfg = _watermark_load_font_config()
    return (cfg or {}).get("latin_fonts") or _WATERMARK_DEFAULT_LATIN_FONTS


def _watermark_create_high_quality_image(text, font_size, text_color, opacity, rotation):
    dpi = 300
    scale_factor = dpi / 72.0
    if _watermark_has_cjk(text):
        font_paths = _watermark_cjk_font_paths() + _watermark_latin_font_paths()
    else:
        font_paths = _watermark_latin_font_paths()
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
import urllib.parse
import importlib
import inspect


def _progress(stage, value, page=None, total_pages=None):
    payload = {"stage": stage, "value": value}
    if page is not None: payload["page"] = page
    if total_pages is not None: payload["totalPages"] = total_pages
    sys.stderr.write("PROGRESS_JSON:" + json.dumps(payload) + "\n")
    sys.stderr.flush()


def _sanitize_ocr_artifacts(md_text: str) -> str:
    """Remove HTML <br> tags and OCR picture-text blocks that break markdown renderers."""
    # Replace HTML line breaks with proper markdown newlines
    md_text = re.sub(r'<br\s*/?>', '\n', md_text)
    # Remove OCR markers and garbage text
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

        # If already relative, leave it alone
        if not os.path.isabs(raw_path):
            return match.group(0)

        # Resolve symlinks (fixes macOS /var vs /private/var mismatch)
        real_path = os.path.realpath(raw_path).replace("\\", "/")

        # If it points to our temp dir, extract just the filename
        if real_path.startswith(tmp_real + "/") or real_path == tmp_real:
            filename = os.path.basename(raw_path)
            # URL-encode spaces/special chars for markdown compliance
            safe_name = urllib.parse.quote(filename, safe="")
            return f"![{alt}]({safe_name})"
        
        # Fallback: keep original if path doesn't match
        return match.group(0)

    # Replace ALL markdown image links safely
    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _relativize, md_text)


def _load_dependencies():
    missing = []
    modules = {}
    for pkg in ["fitz", "pymupdf4llm"]:
        try:
            modules[pkg] = importlib.import_module(pkg)
        except Exception:
            missing.append(pkg)
    return modules, missing


def _convert(input_path, output_folder, pdf_stem, options):
    """
    input_path — absolute path to the source PDF
    output_folder — absolute path to the folder C# created for this conversion
    pdf_stem — filename without extension, used as the .md filename
    options — dict of feature flags
    """
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
            # Resolve symlinks so pymupdf4llm and the regex both use the same real path
            tmp_image_dir  = os.path.realpath(tmp_image_dir)
            image_path_arg = tmp_image_dir.rstrip("/\\") + os.sep
        else:
            image_path_arg = None

        # note:
        # kwargs should be built dynamically — older pymupdf4llm versions running in
        # "legacy mode" do not support header/footer/char_margin/show_warning
        # and print a warning to stdout if they are passed, which breaks JSON
        # parsing on the C# side. probe the API and only pass what's supported.
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
        if "ocr"           in _supported: _kwargs["ocr"]           = "off" # Disabled OCR to prevent <br> artifacts and picture text blocks

        md_text = pymupdf4llm.to_markdown(**_kwargs)

        _progress("assembling", 90, total_pages=total_pages)

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

            # Handles macOS symlinks & spaces
            md_text = markdown_image_paths(md_text, tmp_image_dir, output_folder)

        # Sanitize OCR artifacts and HTML line breaks
        md_text = _sanitize_ocr_artifacts(md_text)

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

        result = _convert(args["input_path"], args["output_folder"], args["pdf_stem"], options)
        print(json.dumps(result))
        return 0 if result.get("success") else 1

# ============================================================
# metadata_scrub_scan / metadata_scrub_scrub
# ============================================================
# Privacy metadata-scrub: detect hidden data (metadata beyond DocInfo,
# XMP, trailer IDs, incremental history, JavaScript/actions, embedded
# files, optional-content layers, annotations, form values, image
# EXIF, font programs) and rewrite the file fully (never incremental)
# with only the user-selected categories removed.

_METADATA_SCRUB_ALLOWED_CATEGORIES = [
    "docinfo",
    "xmp",
    "trailer-id",
    "history",
    "javascript",
    "embedded-files",
    "layers",
    "annotations",
    "form-fields",
    "image-metadata",
    "fonts",
]


def _metadata_scrub_blank_findings():
    return {
        "docinfo": {"key": "docinfo", "found": False, "count": 0, "detail": ""},
        "xmp": {"key": "xmp", "found": False, "count": 0, "detail": ""},
        "trailer-id": {"key": "trailer-id", "found": False, "count": 0, "detail": ""},
        "history": {"key": "history", "found": False, "count": 0, "detail": ""},
        "javascript": {"key": "javascript", "found": False, "count": 0, "detail": ""},
        "embedded-files": {"key": "embedded-files", "found": False, "count": 0, "detail": ""},
        "layers": {"key": "layers", "found": False, "count": 0, "detail": ""},
        "annotations": {"key": "annotations", "found": False, "count": 0, "detail": ""},
        "form-fields": {"key": "form-fields", "found": False, "count": 0, "detail": ""},
        "image-metadata": {"key": "image-metadata", "found": False, "count": 0, "detail": ""},
        "fonts": {"key": "fonts", "found": False, "count": 0, "detail": ""},
    }


def _metadata_scrub_walk(pdf, visitor):
    """Visit every reachable Dictionary/Array object once (cycle-safe)."""
    seen = set()

    def _obj_id(obj):
        # NOTE: direct (non-indirect) objects report objgen (0, 0) in pikepdf,
        # so they must fall back to id() or every direct object collides.
        try:
            og = tuple(obj.objgen)
            if og != (0, 0):
                return ("indirect", og)
        except Exception:
            pass
        return ("direct", id(obj))

    def _visit(obj):
        try:
            import pikepdf as _pikepdf
            is_dict = isinstance(obj, _pikepdf.Dictionary)
            is_array = isinstance(obj, _pikepdf.Array)
        except Exception:
            return
        if not (is_dict or is_array):
            return
        oid = _obj_id(obj)
        if oid in seen:
            return
        seen.add(oid)
        try:
            visitor(obj, is_dict)
        except Exception:
            pass
        # NOTE: dict.values() yields untyped base Objects in pikepdf, so children
        # are fetched by key (resolves concrete types), one at a time so a
        # single bad key never drops a whole subtree.
        try:
            if is_dict:
                keys = list(obj.keys())
            else:
                keys = list(range(len(obj)))
        except Exception:
            return
        children = []
        for k in keys:
            try:
                children.append(obj[k])
            except Exception:
                continue
        for child in children:
            _visit(child)

    _visit(pdf.Root)


def _metadata_scrub_scan_pdf(pdf_path):
    findings = _metadata_scrub_blank_findings()
    encrypted = False
    signed = False
    signature_detail = ""

    # --- Incremental-save history: works on raw bytes, no library needed.
    try:
        with open(pdf_path, "rb") as f:
            raw = f.read()
        eofs = raw.count(b"%%EOF")
        if eofs > 1:
            findings["history"] = {
                "key": "history",
                "found": True,
                "count": eofs - 1,
                "detail": f"{eofs - 1} prior saved version{'s' if eofs - 1 != 1 else ''} kept in file history",
            }
        raw = None
    except Exception:
        pass

    # --- Object-structure scan via pikepdf (best effort per check).
    pikepdf = None
    pdf = None
    try:
        import pikepdf as _pikepdf
        pikepdf = _pikepdf
    except Exception:
        pikepdf = None

    if pikepdf is not None:
        try:
            pdf = pikepdf.open(pdf_path)
        except Exception as e:
            if pikepdf is not None and e.__class__.__name__ == "PasswordError":
                return {
                    "success": True,
                    "encrypted": True,
                    "signed": False,
                    "signatureDetail": "",
                    "findings": list(findings.values()),
                }
            pdf = None

    if pdf is not None:
        try:
            # DocInfo
            try:
                entries = {str(k): str(v) for k, v in pdf.docinfo.items() if str(v).strip()}
                if entries:
                    shown = list(entries.items())[:2]
                    rest = len(entries) - len(shown)
                    detail = ", ".join(f"{k.strip('/')}: {v[:40]}" for k, v in shown)
                    if rest > 0:
                        detail += f", +{rest} more"
                    findings["docinfo"] = {"key": "docinfo", "found": True, "count": len(entries), "detail": detail}
            except Exception:
                pass

            # XMP
            try:
                if pikepdf.Name.Metadata in pdf.Root:
                    findings["xmp"] = {"key": "xmp", "found": True, "count": 1, "detail": "1 XMP metadata packet found"}
            except Exception:
                pass

            # Trailer IDs (used to correlate copies of a file)
            try:
                trailer_id = pdf.trailer.get(pikepdf.Name.ID, None)
                if trailer_id is not None:
                    findings["trailer-id"] = {
                        "key": "trailer-id",
                        "found": True,
                        "count": 1,
                        "detail": "Document IDs present (can link copies of this file)",
                    }
            except Exception:
                pass

            # Structural walk: JS, embedded files, layers, annotations, signatures, form presence
            try:
                tally = {"js": 0, "filespec": 0, "attach_annots": 0, "ocg": 0, "annots": 0, "sig": 0}
                sig_names = []

                def _visitor(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if pikepdf.Name.JS in obj:
                            tally["js"] += 1
                        try:
                            action = obj.get(pikepdf.Name.S, None)
                            if action == pikepdf.Name.JavaScript:
                                tally["js"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/Filespec"):
                                tally["filespec"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/Annot"):
                                tally["annots"] += 1
                                try:
                                    if obj.get(pikepdf.Name.Subtype, None) in (
                                        pikepdf.Name("/FileAttachment"),
                                        pikepdf.Name("/Sound"),
                                    ):
                                        tally["attach_annots"] += 1
                                except Exception:
                                    pass
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.Type, None) == pikepdf.Name("/OCG"):
                                tally["ocg"] += 1
                        except Exception:
                            pass
                        try:
                            if obj.get(pikepdf.Name.FT, None) == pikepdf.Name("/Sig"):
                                tally["sig"] += 1
                                try:
                                    name = str(obj.get(pikepdf.Name.T, ""))
                                    if name:
                                        sig_names.append(name[:40])
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    except Exception:
                        pass

                _metadata_scrub_walk(pdf, _visitor)

                if tally["js"] > 0:
                    findings["javascript"] = {
                        "key": "javascript",
                        "found": True,
                        "count": tally["js"],
                        "detail": f"{tally['js']} script/action location{'s' if tally['js'] != 1 else ''} detected",
                    }
                total_files = tally["filespec"] + tally["attach_annots"]
                if total_files > 0:
                    findings["embedded-files"] = {
                        "key": "embedded-files",
                        "found": True,
                        "count": total_files,
                        "detail": f"{total_files} embedded file{'s' if total_files != 1 else ''}",
                    }
                if tally["ocg"] > 0:
                    findings["layers"] = {
                        "key": "layers",
                        "found": True,
                        "count": tally["ocg"],
                        "detail": f"{tally['ocg']} hidden layer{'s' if tally['ocg'] != 1 else ''}",
                    }
                if tally["sig"] > 0:
                    signed = True
                    signature_detail = "Signed" + (f" by {', '.join(sig_names)}" if sig_names else "")
                    signature_detail += " — scrubbing saves a new file and the signature will become invalid."
            except Exception:
                pass

            # Annotations per page (visible count, friendlier than walk tally)
            try:
                annot_total = 0
                for page in pdf.pages:
                    try:
                        annots = page.get(pikepdf.Name.Annots, None)
                        if annots is not None:
                            annot_total += len(list(annots))
                    except Exception:
                        continue
                if annot_total > 0:
                    findings["annotations"] = {
                        "key": "annotations",
                        "found": True,
                        "count": annot_total,
                        "detail": f"{annot_total} comment/annotation{'s' if annot_total != 1 else ''}",
                    }
            except Exception:
                pass

            # Form fields (top-level count; values are the privacy leak)
            try:
                acro = pdf.Root.get(pikepdf.Name.AcroForm, None)
                if acro is not None:
                    try:
                        fields = list(acro.get(pikepdf.Name.Fields, []))
                        if fields:
                            findings["form-fields"] = {
                                "key": "form-fields",
                                "found": True,
                                "count": len(fields),
                                "detail": f"{len(fields)} top-level form field{'s' if len(fields) != 1 else ''} (values may hold personal data)",
                            }
                    except Exception:
                        pass
                    try:
                        if int(acro.get(pikepdf.Name.SigFlags, 0)) > 0 and not signed:
                            signed = True
                            signature_detail = "Signature flags set — scrubbing saves a new file and signatures will become invalid."
                    except Exception:
                        pass
            except Exception:
                pass
        finally:
            try:
                pdf.close()
            except Exception:
                pass

    # --- Images + fonts via PyMuPDF (independent of pikepdf).
    try:
        import fitz as _fitz

        doc = None
        try:
            doc = _fitz.open(pdf_path)
        except Exception as e:
            if "password" in str(e).lower() or "encrypted" in str(e).lower():
                encrypted = True
            doc = None

        if doc is not None:
            try:
                if doc.needs_pass:
                    encrypted = True
                else:
                    # Image metadata: EXIF/XMP inside embedded raster images
                    try:
                        from PIL import Image as _PILImage
                        from PIL import ExifTags as _ExifTags

                        seen_xrefs = set()
                        with_meta = 0
                        total_images = 0
                        for page in doc:
                            try:
                                for img in page.get_images(full=True):
                                    xref = img[0]
                                    if xref in seen_xrefs:
                                        continue
                                    seen_xrefs.add(xref)
                                    total_images += 1
                                    try:
                                        info = doc.extract_image(xref)
                                        pil_img = _PILImage.open(io.BytesIO(info["image"]))
                                        has_meta = False
                                        try:
                                            if pil_img.getexif():
                                                has_meta = True
                                        except Exception:
                                            pass
                                        if not has_meta:
                                            try:
                                                if getattr(pil_img, "info", {}):
                                                    keys = set(pil_img.info.keys()) - {"dpi"}
                                                    if keys:
                                                        has_meta = True
                                            except Exception:
                                                pass
                                        if has_meta:
                                            with_meta += 1
                                    except Exception:
                                        continue
                            except Exception:
                                continue
                        if with_meta > 0:
                            findings["image-metadata"] = {
                                "key": "image-metadata",
                                "found": True,
                                "count": with_meta,
                                "detail": f"{with_meta} of {total_images} image{'s' if total_images != 1 else ''} carr{'y' if with_meta == 1 else ''}ies EXIF/metadata",
                            }
                    except Exception:
                        pass

                    # Fonts: embedded programs whose names can leak tools/systems
                    try:
                        font_names = set()
                        for page in doc:
                            try:
                                for f in page.get_fonts(full=True):
                                    # (xref, ext, type, basefont, name, encoding, referencer)
                                    basefont = f[3] if len(f) > 3 else ""
                                    if basefont:
                                        font_names.add(str(basefont).split("+")[-1])
                            except Exception:
                                continue
                        if font_names:
                            shown = sorted(font_names)[:2]
                            rest = len(font_names) - len(shown)
                            detail = ", ".join(shown)
                            if rest > 0:
                                detail += f", +{rest} more"
                            findings["fonts"] = {
                                "key": "fonts",
                                "found": True,
                                "count": len(font_names),
                                "detail": f"{len(font_names)} embedded font{'s' if len(font_names) != 1 else ''}: {detail}",
                            }
                    except Exception:
                        pass
            finally:
                try:
                    doc.close()
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "success": True,
        "encrypted": encrypted,
        "signed": signed,
        "signatureDetail": signature_detail,
        "findings": [findings[k] for k in _METADATA_SCRUB_ALLOWED_CATEGORIES],
    }


def _metadata_scrub_scrub_pdf(pdf_path, output_path, categories):
    import os as _os

    removed = {k: 0 for k in _METADATA_SCRUB_ALLOWED_CATEGORIES}
    notes = []
    cats = set(categories or [])

    try:
        import pikepdf as _pikepdf
    except Exception:
        return {"success": False, "error": "Metadata scrub engine unavailable (pikepdf missing)."}

    try:
        pdf = _pikepdf.open(pdf_path)
    except Exception as e:
        if e.__class__.__name__ == "PasswordError":
            return {"success": False, "error": "ENCRYPTED: This PDF is password-protected. Unlock it first, then try Deep Clean again."}
        return {"success": False, "error": f"Could not open PDF: {e}"}

    try:
        # --- DocInfo
        if "docinfo" in cats:
            try:
                keys = list(pdf.docinfo.keys())
                for key in keys:
                    try:
                        del pdf.docinfo[key]
                    except Exception:
                        continue
                removed["docinfo"] = len(keys)
            except Exception as e:
                notes.append(f"docinfo: {e}")

        # --- XMP
        if "xmp" in cats:
            try:
                if _pikepdf.Name.Metadata in pdf.Root:
                    del pdf.Root.Metadata
                    removed["xmp"] = 1
            except Exception as e:
                notes.append(f"xmp: {e}")

        # --- Trailer IDs: regenerate fresh random IDs (breaks cross-copy tracking, stays valid)
        if "trailer-id" in cats:
            try:
                new_id = _os.urandom(16).hex().upper()
                pdf.trailer[_pikepdf.Name.ID] = _pikepdf.Array(
                    [_pikepdf.String(new_id), _pikepdf.String(new_id)]
                )
                removed["trailer-id"] = 1
            except Exception as e:
                notes.append(f"trailer-id: {e}")

        # --- JavaScript / actions
        if "javascript" in cats:
            try:
                count = [0]

                def _strip_js(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if _pikepdf.Name.JS in obj:
                            del obj[_pikepdf.Name.JS]
                            count[0] += 1
                    except Exception:
                        pass
                    try:
                        if obj.get(_pikepdf.Name.S, None) == _pikepdf.Name.JavaScript:
                            # Neutralize the action in place (keeps object graph valid)
                            try:
                                del obj[_pikepdf.Name.JS]
                            except Exception:
                                pass
                            try:
                                del obj[_pikepdf.Name.S]
                            except Exception:
                                pass
                            count[0] += 1
                    except Exception:
                        pass

                _metadata_scrub_walk(pdf, _strip_js)
                for holder in ("OpenAction", "AA", "Names"):
                    try:
                        key = _pikepdf.Name("/" + holder)
                        if key in pdf.Root:
                            target = pdf.Root[key]
                            try:
                                blob = str(target)
                            except Exception:
                                blob = ""
                            has_js = "JavaScript" in blob or "/JS" in blob
                            if holder == "Names":
                                try:
                                    if _pikepdf.Name.JavaScript in target:
                                        del target[_pikepdf.Name.JavaScript]
                                        count[0] += 1
                                except Exception:
                                    pass
                            elif has_js:
                                try:
                                    del pdf.Root[key]
                                    count[0] += 1
                                except Exception:
                                    pass
                    except Exception:
                        continue
                removed["javascript"] = count[0]
            except Exception as e:
                notes.append(f"javascript: {e}")

        # --- Embedded files
        if "embedded-files" in cats:
            try:
                count = [0]
                try:
                    names = pdf.Root.get(_pikepdf.Name.Names, None)
                    if names is not None and _pikepdf.Name.EmbeddedFiles in names:
                        del names[_pikepdf.Name.EmbeddedFiles]
                        count[0] += 1
                except Exception:
                    pass
                try:
                    if _pikepdf.Name.AF in pdf.Root:
                        del pdf.Root[_pikepdf.Name.AF]
                except Exception:
                    pass
                try:
                    for page in pdf.pages:
                        try:
                            annots = page.get(_pikepdf.Name.Annots, None)
                            if annots is None:
                                continue
                            kept = []
                            for annot in list(annots):
                                try:
                                    subtype = annot.get(_pikepdf.Name.Subtype, None)
                                except Exception:
                                    kept.append(annot)
                                    continue
                                if subtype in (_pikepdf.Name("/FileAttachment"), _pikepdf.Name("/Sound")):
                                    count[0] += 1
                                else:
                                    kept.append(annot)
                            if len(kept) != len(list(annots)):
                                if kept:
                                    page[_pikepdf.Name.Annots] = _pikepdf.Array(kept)
                                else:
                                    del page[_pikepdf.Name.Annots]
                        except Exception:
                            continue
                except Exception:
                    pass
                removed["embedded-files"] = count[0]
            except Exception as e:
                notes.append(f"embedded-files: {e}")

        # --- Hidden layers: drop optional-content properties, keep visible content intact
        if "layers" in cats:
            try:
                count = [0]
                try:
                    if _pikepdf.Name.OCProperties in pdf.Root:
                        try:
                            ocgs = list(pdf.Root.OCProperties.get(_pikepdf.Name.OCGs, []))
                            count[0] = len(ocgs)
                        except Exception:
                            count[0] = 1
                        del pdf.Root[_pikepdf.Name.OCProperties]
                except Exception:
                    pass
                try:
                    for page in pdf.pages:
                        try:
                            if _pikepdf.Name.OC in page:
                                del page[_pikepdf.Name.OC]
                        except Exception:
                            continue
                except Exception:
                    pass
                removed["layers"] = count[0]
            except Exception as e:
                notes.append(f"layers: {e}")

        # --- Annotations / comments
        if "annotations" in cats:
            try:
                total = [0]
                for page in pdf.pages:
                    try:
                        annots = page.get(_pikepdf.Name.Annots, None)
                        if annots is None:
                            continue
                        total[0] += len(list(annots))
                        del page[_pikepdf.Name.Annots]
                    except Exception:
                        continue
                removed["annotations"] = total[0]
            except Exception as e:
                notes.append(f"annotations: {e}")

        # --- Form values: clear entered data, keep the form structure
        if "form-fields" in cats:
            try:
                cleared = [0]

                def _clear_values(obj, is_dict):
                    if not is_dict:
                        return
                    try:
                        if _pikepdf.Name.T in obj and _pikepdf.Name.V in obj:
                            # Never touch signature fields here; signatures are warn-only
                            try:
                                if obj.get(_pikepdf.Name.FT, None) == _pikepdf.Name("/Sig"):
                                    return
                            except Exception:
                                pass
                            del obj[_pikepdf.Name.V]
                            cleared[0] += 1
                    except Exception:
                        pass

                _metadata_scrub_walk(pdf, _clear_values)
                removed["form-fields"] = cleared[0]
            except Exception as e:
                notes.append(f"form-fields: {e}")

        # --- Image metadata: re-encode JPEG streams without EXIF (others skipped, reported)
        if "image-metadata" in cats:
            try:
                stripped = [0]
                skipped = [0]
                try:
                    from PIL import Image as _PILImage
                except Exception:
                    _PILImage = None
                if _PILImage is None:
                    notes.append("image-metadata: image engine unavailable, skipped")
                else:
                    def _strip_images(obj, is_dict):
                        if not is_dict:
                            return
                        try:
                            if obj.get(_pikepdf.Name.Subtype, None) != _pikepdf.Name("/Image"):
                                return
                            filt = obj.get(_pikepdf.Name.Filter, None)
                            names = []
                            try:
                                if isinstance(filt, _pikepdf.Array):
                                    names = [str(n) for n in filt]
                                elif filt is not None:
                                    names = [str(filt)]
                            except Exception:
                                names = []
                            if "/DCTDecode" not in names:
                                skipped[0] += 1
                                return
                            raw = obj.read_bytes()
                            img = _PILImage.open(io.BytesIO(raw))
                            img.load()
                            out = io.BytesIO()
                            save_kwargs = {"format": "JPEG", "quality": 95}
                            try:
                                icc = img.info.get("icc_profile")
                                if icc:
                                    save_kwargs["icc_profile"] = icc
                            except Exception:
                                pass
                            rgb = img.convert("RGB") if img.mode not in ("RGB", "L") else img
                            rgb.save(out, **save_kwargs)
                            obj.write(out.getvalue(), filter=_pikepdf.Name("/DCTDecode"))
                            stripped[0] += 1
                        except Exception:
                            skipped[0] += 1

                    _metadata_scrub_walk(pdf, _strip_images)
                    if skipped[0]:
                        notes.append(f"image-metadata: {skipped[0]} non-JPEG image(s) left untouched")
                removed["image-metadata"] = stripped[0]
            except Exception as e:
                notes.append(f"image-metadata: {e}")

        # --- Fonts: names are required for rendering and cannot be stripped safely.
        # Full rewrite below still normalizes the file; report honestly.
        if "fonts" in cats:
            notes.append("fonts: font program names preserved (required for rendering); file normalized")

        # --- History is eliminated by the full rewrite itself (never incremental).
        # --- Full rewrite save (this is what drops prior-version history).
        pdf.save(output_path)
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": True, "removed": removed, "notes": notes, "output": output_path}
    except Exception as e:
        try:
            pdf.close()
        except Exception:
            pass
        return {"success": False, "error": f"Scrub failed: {e}"}


class metadata_scrub_scan:
    @staticmethod
    def main():
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "error": "No arguments provided"}))
            sys.exit(1)
        try:
            json_file_path = sys.argv[1]
            with open(json_file_path, "r", encoding="utf-8") as f:
                request = json.load(f)
            pdf_path = request.get("file_path")
            if not pdf_path or not os.path.exists(pdf_path):
                print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
                sys.exit(1)
            result = _metadata_scrub_scan_pdf(pdf_path)
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
            sys.exit(1)


class metadata_scrub_scrub:
    @staticmethod
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
            valid = [c for c in (categories or []) if c in _METADATA_SCRUB_ALLOWED_CATEGORIES]
            if not valid:
                print(json.dumps({"success": False, "error": "No valid categories selected"}))
                sys.exit(1)
            result = _metadata_scrub_scrub_pdf(pdf_path, output_path, valid)
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
            sys.exit(1)


# ============================================================
# blank_duplicate_scan — blank + duplicate page detector (scan only)
# ============================================================
# Offline, dependency-free (PyMuPDF + Pillow + stdlib only).
# Input (temp JSON): { file_path, preset: strict|balanced|lenient,
#                      options: { maxTextChars, maxInkRatio, dupHamming,
#                                 ignoreFooter, renderDpi } }
# Output (stdout JSON): { success, pageCount, preset, blanks[], groups[] }
#   blanks: [{ page, confidence, reason, inkRatio, textChars }]
#   groups: [{ pages, kind: exact|near, similarity }]

_BLANK_DUPLICATE_PRESETS = {
    "strict":   {"maxTextChars": 10, "maxInkRatio": 0.003, "dupHamming": 3},
    "balanced": {"maxTextChars": 30, "maxInkRatio": 0.008, "dupHamming": 6},
    "lenient":  {"maxTextChars": 50, "maxInkRatio": 0.02,  "dupHamming": 10},
}


def _blank_duplicate_resolve_config(preset, options):
    base = _BLANK_DUPLICATE_PRESETS.get((preset or "balanced").lower(), _BLANK_DUPLICATE_PRESETS["balanced"])
    cfg = dict(base)
    opts = options or {}
    try:
        if opts.get("maxTextChars") is not None:
            cfg["maxTextChars"] = max(0, int(opts["maxTextChars"]))
        if opts.get("maxInkRatio") is not None:
            cfg["maxInkRatio"] = min(0.2, max(0.0, float(opts["maxInkRatio"])))
        if opts.get("dupHamming") is not None:
            cfg["dupHamming"] = min(32, max(0, int(opts["dupHamming"])))
    except (ValueError, TypeError):
        pass
    cfg["ignoreFooter"] = bool(opts.get("ignoreFooter", True))
    try:
        cfg["renderDpi"] = min(200, max(72, int(opts.get("renderDpi", 100))))
    except (ValueError, TypeError):
        cfg["renderDpi"] = 100
    return cfg


def _blank_duplicate_normalize_text(text):
    import re as _re
    return _re.sub(r"\s+", " ", (text or "").strip().lower())


def _blank_duplicate_dhash(gray_img):
    # gray_img: PIL grayscale. Resize to 9x8, compare adjacent pixels → 64-bit int.
    small = gray_img.resize((9, 8), Image.LANCZOS)
    px = list(small.getdata())
    h = 0
    for row in range(8):
        for col in range(8):
            h = (h << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return h


def _blank_duplicate_hamming(a, b):
    try:
        return bin(a ^ b).count("1")
    except Exception:
        x = a ^ b
        n = 0
        while x:
            n += x & 1
            x >>= 1
        return n


def _blank_duplicate_ink_ratio(page, dpi, ignore_footer):
    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
    try:
        img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
    finally:
        pix = None
    if ignore_footer and img.height > 20:
        img = img.crop((0, 0, img.width, int(img.height * 0.90)))
    hist = img.histogram()
    total = img.width * img.height
    # Pixels darker than near-white count as ink.
    nonwhite = total - sum(hist[250:])
    return (nonwhite / total) if total else 0.0


def _blank_duplicate_scan_pdf(pdf_path, preset="balanced", options=None):
    import hashlib
    cfg = _blank_duplicate_resolve_config(preset, options)
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        msg = str(e)
        if "password" in msg.lower() or "encrypt" in msg.lower():
            return {"success": False, "error": "ENCRYPTED: This PDF is password-protected. Unlock it first."}
        return {"success": False, "error": f"Could not open PDF: {e}"}
    try:
        if getattr(doc, "needs_pass", False) or getattr(doc, "is_encrypted", False):
            try:
                if doc.needs_pass:
                    return {"success": False, "error": "ENCRYPTED: This PDF is password-protected. Unlock it first."}
            except Exception:
                pass
        total = doc.page_count
        blanks = []
        blank_set = set()
        infos = []  # per-page { page, textHash, dhash, textLen }
        for i in range(total):
            page = doc[i]
            try:
                raw_text = page.get_text() or ""
            except Exception:
                raw_text = ""
            norm = _blank_duplicate_normalize_text(raw_text)
            text_chars = len(norm.replace(" ", ""))
            try:
                n_draw = len(page.get_drawings())
            except Exception:
                n_draw = 1 if text_chars == 0 else 0
            try:
                n_img = len(page.get_images())
            except Exception:
                n_img = 0
            try:
                has_annot = next(page.annots() or iter([]), None) is not None
            except Exception:
                has_annot = False
            try:
                has_widget = len(list(page.widgets() or [])) > 0
            except Exception:
                has_widget = False

            ink = None
            is_blank = False
            reason = ""
            # Fast path: absolutely empty and no annotations/widgets.
            if text_chars == 0 and n_draw == 0 and n_img == 0 and not has_annot and not has_widget:
                is_blank = True
                reason = "no-text-no-artwork"
                ink = 0.0
            elif not has_annot and not has_widget and text_chars <= cfg["maxTextChars"] and n_draw == 0 and n_img == 0:
                try:
                    ink = _blank_duplicate_ink_ratio(page, cfg["renderDpi"], cfg["ignoreFooter"])
                except Exception:
                    ink = 1.0
                if ink <= cfg["maxInkRatio"]:
                    is_blank = True
                    reason = "low-ink"
            elif not has_annot and not has_widget and text_chars <= cfg["maxTextChars"]:
                # Has vector/images but tiny text — render decides (borders alone stay under threshold).
                try:
                    ink = _blank_duplicate_ink_ratio(page, cfg["renderDpi"], cfg["ignoreFooter"])
                except Exception:
                    ink = 1.0
                if ink <= cfg["maxInkRatio"] and n_img == 0:
                    is_blank = True
                    reason = "low-ink"
            if is_blank:
                conf = 0.99 if ink == 0.0 else max(0.55, min(0.99, 1.0 - (ink / max(cfg["maxInkRatio"], 1e-9)) * 0.4))
                blanks.append({"page": i + 1, "confidence": round(conf, 2),
                               "reason": reason, "inkRatio": round(ink or 0.0, 5), "textChars": text_chars})
                blank_set.add(i + 1)
            # Fingerprint for duplicate detection (skip blanks to keep UI clean).
            dhash = None
            text_hash = hashlib.sha256(norm.encode("utf-8")).hexdigest() if norm else ""
            if (i + 1) not in blank_set:
                try:
                    zoom = cfg["renderDpi"] / 72.0
                    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY, alpha=False)
                    try:
                        img = Image.frombytes("L", [pix.width, pix.height], pix.samples)
                    finally:
                        pix = None
                    if cfg["ignoreFooter"] and img.height > 20:
                        img = img.crop((0, 0, img.width, int(img.height * 0.90)))
                    dhash = _blank_duplicate_dhash(img)
                except Exception:
                    dhash = None
            infos.append({"page": i + 1, "textHash": text_hash, "dhash": dhash, "textLen": text_chars})
            if total >= 20 and (i + 1) % 10 == 0:
                sys.stderr.write(f"PROGRESS:{int(((i + 1) / total) * 90)}\n")
        # Exact groups: same non-empty normalized text.
        groups = []
        by_text = {}
        for info in infos:
            if info["page"] in blank_set or not info["textHash"]:
                continue
            by_text.setdefault(info["textHash"], []).append(info["page"])
        for pages in by_text.values():
            if len(pages) > 1:
                groups.append({"pages": sorted(pages), "kind": "exact", "similarity": 1.0})
        # Near groups: dHash hamming <= threshold (union-find, transitive).
        idx = [info for info in infos if info["page"] not in blank_set and info["dhash"] is not None]
        parent = {info["page"]: info["page"] for info in idx}
        def _find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        def _union(a, b):
            ra, rb = _find(a), _find(b)
            if ra != rb:
                parent[rb] = ra
        # Skip pairs already in the same exact group to save time? n is small; brute force is fine.
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                pa, pb = idx[a], idx[b]
                if _find(pa["page"]) == _find(pb["page"]):
                    continue
                d = _blank_duplicate_hamming(pa["dhash"], pb["dhash"])
                if d <= cfg["dupHamming"]:
                    # Avoid re-reporting exact-text pairs as near as well.
                    if pa["textHash"] and pa["textHash"] == pb["textHash"]:
                        _union(pa["page"], pb["page"])
                        continue
                    _union(pa["page"], pb["page"])
        clusters = {}
        for info in idx:
            clusters.setdefault(_find(info["page"]), []).append(info)
        for pages_infos in clusters.values():
            if len(pages_infos) < 2:
                continue
            pages = sorted(info["page"] for info in pages_infos)
            # Skip if fully covered by an exact group.
            if any(g["kind"] == "exact" and g["pages"] == pages for g in groups):
                continue
            # Max pairwise distance → similarity.
            maxd = 0
            for a in range(len(pages_infos)):
                for b in range(a + 1, len(pages_infos)):
                    maxd = max(maxd, _blank_duplicate_hamming(pages_infos[a]["dhash"], pages_infos[b]["dhash"]))
            sim = round(1.0 - maxd / 64.0, 3)
            groups.append({"pages": pages, "kind": "near", "similarity": sim})
        groups.sort(key=lambda g: (g["pages"][0], len(g["pages"])))
        sys.stderr.write("PROGRESS:100\n")
        return {"success": True, "pageCount": total,
                "preset": (preset or "balanced").lower() if (preset or "").lower() in _BLANK_DUPLICATE_PRESETS else "balanced",
                "blanks": blanks, "groups": groups}
    finally:
        try:
            doc.close()
        except Exception:
            pass


class blank_duplicate_scan:
    @staticmethod
    def main():
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "error": "No arguments provided"}))
            sys.exit(1)
        try:
            json_file_path = sys.argv[1]
            with open(json_file_path, "r", encoding="utf-8") as f:
                request = json.load(f)
            pdf_path = request.get("file_path")
            preset = request.get("preset", "balanced")
            options = request.get("options")
            if not pdf_path or not os.path.exists(pdf_path):
                print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
                sys.exit(1)
            result = _blank_duplicate_scan_pdf(pdf_path, preset, options)
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
            sys.exit(1)


# ============================================================
# pdf_to_excel — table extraction to XLSX/CSV (direct export)
# ============================================================
# Offline, layout-aware extraction with pdfplumber + pandas + openpyxl.
# Imports are local so this command degrades gracefully when the
# optional table stack is missing (other commands keep working).
# Input (temp JSON): { file_path, output_path, pages, page_ranges,
#                      flavor: auto|lattice|stream, format: xlsx|csv }
# Output (stdout JSON): { success, pageCount, tableCount, flavor,
#                         format, notes[], output, error? }

_PDF_TO_EXCEL_FLAVORS = ("auto", "lattice", "stream")
_PDF_TO_EXCEL_FORMATS = ("xlsx", "csv")
_PDF_TO_EXCEL_LATTICE_SETTINGS = {"vertical_strategy": "lines", "horizontal_strategy": "lines",
                                   "text_x_tolerance": 3, "text_y_tolerance": 3}
_PDF_TO_EXCEL_STREAM_SETTINGS = {"vertical_strategy": "text", "horizontal_strategy": "text",
                                 "text_x_tolerance": 6, "text_y_tolerance": 3}


def _pdf_to_excel_page_list(total_pages, pages, page_ranges):
    selected = set()
    if not pages and not page_ranges:
        return list(range(total_pages))
    if pages:
        for p in pages:
            try:
                if 1 <= int(p) <= total_pages:
                    selected.add(int(p) - 1)
            except (ValueError, TypeError):
                continue
    if page_ranges:
        for range_str in page_ranges:
            try:
                if '-' in str(range_str):
                    s, e = str(range_str).split('-', 1)
                    for p in range(int(s.strip()), int(e.strip()) + 1):
                        if 1 <= p <= total_pages:
                            selected.add(p - 1)
                elif 1 <= int(str(range_str).strip()) <= total_pages:
                    selected.add(int(str(range_str).strip()) - 1)
            except (ValueError, TypeError):
                continue
    return sorted(selected)


# Control characters illegal in XML 1.0 (and therefore in XLSX cells).
# openpyxl raises on these instead of stripping them, so we remove them
# during cleaning. Plain Bengali/Latin/CJK text passes through untouched.
_PDF_TO_EXCEL_ILLEGAL_CHARS_RE = None


def _pdf_to_excel_sanitize(value):
    global _PDF_TO_EXCEL_ILLEGAL_CHARS_RE
    if not isinstance(value, str) or "\x00" not in value and not any(ord(c) < 32 for c in value):
        return value
    import re as _re
    if _PDF_TO_EXCEL_ILLEGAL_CHARS_RE is None:
        _PDF_TO_EXCEL_ILLEGAL_CHARS_RE = _re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
    return _PDF_TO_EXCEL_ILLEGAL_CHARS_RE.sub("", value)


# Script ranges for complex-text handling, mirroring the watermark CJK
# ranges. JOIN: scripts with no intra-word spaces, where a space between
# single-cluster tokens inside a table cell is certainly a positioning
# artifact (letterspacing-as-design doesn't happen in table cells).
# NOTE: spaced languages — only detection + warning, never auto-join.
_PDF_TO_EXCEL_JOIN_RANGES = [
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana
    (0x3400, 0x4DBF),  # CJK Extension A
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
]
_PDF_TO_EXCEL_NOTE_RANGES = _PDF_TO_EXCEL_JOIN_RANGES + [
    (0x0900, 0x097F),  # Devanagari (Hindi, Marathi, ...)
    (0x0980, 0x09FF),  # Bengali
    (0xAC00, 0xD7AF),  # Hangul Syllables (spaced language: note only)
]


def _pdf_to_excel_in_ranges(cp, ranges):
    return any(lo <= cp <= hi for lo, hi in ranges)


# Glyph-by-glyph emission (broken ToUnicode/positioning) cannot be safely re-joined post-hoc for spaced languages.
def _pdf_to_excel_cluster_len(text):
    import unicodedata as _ud
    n = 0
    for ch in text:
        if n == 0 or (_ud.combining(ch) == 0 and _ud.category(ch) not in ("Mn", "Mc", "Me")):
            n += 1
    return n


def _pdf_to_excel_repair(value):
    if not isinstance(value, str) or " " not in value:
        return value
    toks = [t for t in value.split(" ") if t != ""]
    if len(toks) < 2:
        return value
    if all(_pdf_to_excel_cluster_len(t) == 1
           and all(_pdf_to_excel_in_ranges(ord(c), _PDF_TO_EXCEL_JOIN_RANGES) for c in t)
           for t in toks):
        return "".join(toks)
    return value


def _pdf_to_excel_shredded_hits(tables):
    hits = 0
    for table in tables:
        for row in table:
            for cell in row:
                if not isinstance(cell, str):
                    continue
                for tok in cell.split(" "):
                    if len(tok) >= 1 and _pdf_to_excel_cluster_len(tok) == 1 \
                            and all(_pdf_to_excel_in_ranges(ord(c), _PDF_TO_EXCEL_NOTE_RANGES) for c in tok):
                        hits += 1
    return hits


def _pdf_to_excel_clean(raw):
    """Normalize one pdfplumber table: pad ragged rows, strip text,
    drop fully-empty rows/columns. Returns list-of-lists or None."""
    if not raw:
        return None
    width = max(len(r) for r in raw)
    if width == 0:
        return None
    norm = []
    for row in raw:
        padded = list(row) + [None] * (width - len(row))
        norm.append([_pdf_to_excel_repair(_pdf_to_excel_sanitize(c.strip())) if isinstance(c, str) else ("" if c is None else c) for c in padded])
    try:
        import pandas as pd
        df = pd.DataFrame(norm)
        # Blank strings are not NaN: normalize them first so empty
        # rows/columns (common with text-strategy detection) are dropped.
        df = df.replace(r"^\s*$", pd.NA, regex=True)
        df = df.dropna(axis=0, how="all").dropna(axis=1, how="all")
        if df.empty:
            return None
        return df.astype(object).where(pd.notnull(df), "").values.tolist()
    except Exception:
        # Fallback without pandas: drop rows/cols that are all empty strings.
        kept_rows = [r for r in norm if any(c != "" for c in r)]
        if not kept_rows:
            return None
        cols = [c for c in range(width) if any(r[c] != "" for r in kept_rows)]
        if not cols:
            return None
        return [[r[c] for c in cols] for r in kept_rows]


def _pdf_to_excel_write_xlsx(per_page, output_path):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        from openpyxl.utils import get_column_letter
        wb = Workbook()
        wb.remove(wb.active)
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        for page_num, tables in per_page:
            ws = wb.create_sheet(title=f"Page_{page_num}")
            widths = {}
            row = 1
            for ti, table in enumerate(tables):
                if ti > 0:
                    row += 1
                for ri, trow in enumerate(table):
                    for ci, val in enumerate(trow):
                        cell = ws.cell(row=row, column=ci + 1, value=val)
                        if ri == 0:
                            cell.font = header_font
                            cell.fill = header_fill
                        try:
                            ln = len(str(val)) if val not in (None, "") else 0
                        except Exception:
                            ln = 0
                        if ln > widths.get(ci, 0):
                            widths[ci] = ln
                    row += 1
            for ci, w in widths.items():
                ws.column_dimensions[get_column_letter(ci + 1)].width = min(max(w + 2, 10), 50)
            ws.freeze_panes = "A2"
        wb.save(output_path)
        return ""
    except Exception as e:
        return f"Could not write XLSX: {e}"


def _pdf_to_excel_write_csv_zip(per_page, output_path):
    import csv as _csv
    try:
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for page_num, tables in per_page:
                for ti, table in enumerate(tables, 1):
                    buf = io.StringIO()
                    writer = _csv.writer(buf)
                    writer.writerows([("" if v is None else v) for v in row] for row in table)
                    name = f"page_{page_num:03d}_table_{ti}.csv" if len(tables) > 1 else f"page_{page_num:03d}.csv"
                    # UTF-8 BOM: without it Excel on Windows misdetects the
                    # encoding (Bengali/CJK shown as mojibake). LibreOffice
                    # and parsers handle the BOM transparently.
                    zf.writestr(name, "\ufeff" + buf.getvalue())
        return ""
    except Exception as e:
        return f"Could not write CSV archive: {e}"


def _pdf_to_excel_convert(pdf_path, output_path, pages=None, page_ranges=None, flavor="auto", fmt="xlsx"):
    try:
        import pdfplumber
    except ImportError:
        return {"success": False, "error": "Table engine unavailable (pdfplumber missing).",
                "missingDependencies": ["pdfplumber"]}
    try:
        import pandas  # noqa: F401  (cleaning step; fallback exists without it)
    except ImportError:
        pandas = None
    flavor = (flavor or "auto").lower()
    if flavor not in _PDF_TO_EXCEL_FLAVORS:
        flavor = "auto"
    fmt = (fmt or "xlsx").lower()
    if fmt not in _PDF_TO_EXCEL_FORMATS:
        fmt = "xlsx"
    if fmt == "xlsx":
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            return {"success": False, "error": "XLSX engine unavailable (openpyxl missing).",
                    "missingDependencies": ["openpyxl"]}
    try:
        pdf = pdfplumber.open(pdf_path)
    except Exception as e:
        if "password" in str(e).lower():
            return {"success": False, "error": "ENCRYPTED: This PDF is password-protected. Unlock it first."}
        return {"success": False, "error": f"Could not open PDF: {e}"}
    try:
        total = len(pdf.pages)
        idx = _pdf_to_excel_page_list(total, pages, page_ranges)
        if not idx:
            return {"success": False, "error": "No valid pages selected."}
        per_page = []
        notes = []
        table_total = 0
        for n, pi in enumerate(idx):
            page = pdf.pages[pi]
            raw_tables = []
            try:
                if flavor in ("auto", "lattice"):
                    raw_tables = page.extract_tables(table_settings=dict(_PDF_TO_EXCEL_LATTICE_SETTINGS)) or []
                if not raw_tables and flavor in ("auto", "stream"):
                    raw_tables = page.extract_tables(table_settings=dict(_PDF_TO_EXCEL_STREAM_SETTINGS)) or []
            except Exception as e:
                notes.append(f"page {pi + 1}: table detection failed ({e})")
                continue
            cleaned = []
            for raw in raw_tables:
                t = _pdf_to_excel_clean(raw)
                if t:
                    cleaned.append(t)
            if not cleaned:
                try:
                    if (page.extract_text() or "").strip() == "":
                        notes.append(f"page {pi + 1}: no extractable text (scanned? try the OCR tool first)")
                except Exception:
                    pass
            else:
                table_total += len(cleaned)
                per_page.append((pi + 1, cleaned))
                if _pdf_to_excel_shredded_hits(cleaned) >= 6:
                    notes.append(f"page {pi + 1}: complex-script text is stored glyph-by-glyph in the source PDF; "
                                 "words may show extra spaces (numbers and table structure are unaffected)")
            if len(idx) >= 5 and (n + 1) % 5 == 0:
                sys.stderr.write(f"PROGRESS:{int(((n + 1) / len(idx)) * 80)}\n")
        if table_total == 0:
            return {"success": False, "error": "No extractable tables found in the selected pages.",
                    "notes": notes, "pageCount": total, "tableCount": 0}
        if fmt == "xlsx":
            write_err = _pdf_to_excel_write_xlsx(per_page, output_path)
        else:
            write_err = _pdf_to_excel_write_csv_zip(per_page, output_path)
        if write_err:
            return {"success": False, "error": write_err, "notes": notes,
                    "pageCount": total, "tableCount": table_total}
        sys.stderr.write("PROGRESS:100\n")
        return {"success": True, "pageCount": total, "tableCount": table_total,
                "flavor": flavor, "format": fmt, "notes": notes, "output": output_path}
    finally:
        try:
            pdf.close()
        except Exception:
            pass


class pdf_to_excel:
    @staticmethod
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
            if not pdf_path or not os.path.exists(pdf_path):
                print(json.dumps({"success": False, "error": f"PDF file not found: {pdf_path}"}))
                sys.exit(1)
            if not output_path:
                print(json.dumps({"success": False, "error": "No output path provided"}))
                sys.exit(1)
            result = _pdf_to_excel_convert(
                pdf_path, output_path,
                pages=request.get("pages"),
                page_ranges=request.get("page_ranges"),
                flavor=request.get("flavor", "auto"),
                fmt=request.get("format", "xlsx"),
            )
            print(json.dumps(result))
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON input: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Processing error: {str(e)}"}))
            sys.exit(1)


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
_make_module("metadata_scrub_scan",      metadata_scrub_scan.main)
_make_module("metadata_scrub_scrub",     metadata_scrub_scrub.main)
_make_module("pdf_to_markdown",     pdf_to_markdown.main)
_make_module("blank_duplicate_scan",       blank_duplicate_scan.main)
_make_module("pdf_to_excel",            pdf_to_excel.main)


if __name__ == "__main__":
    main()