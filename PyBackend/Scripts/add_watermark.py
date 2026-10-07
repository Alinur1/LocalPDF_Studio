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
import zipfile
import base64
import tempfile
import argparse
import json
import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont


def add_text_watermark(input_path, output_path, text, position, rotation, opacity,
                       font_size, text_color, start_page, end_page, pages_range, custom_pages,
                       watermark_type="text", image_path=None, image_scale=50):
    try:
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}

        if watermark_type == "image":
            if not image_path or not os.path.exists(image_path):
                return {"success": False, "error": f"Image file not found: {image_path}"}
            return add_image_watermark(input_path, output_path, image_path, position, rotation,
                                       opacity, image_scale, start_page, end_page, pages_range, custom_pages)
        else:
            doc = fitz.open(input_path)
            total_pages = doc.page_count
            target_pages = parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)

            for page_num in target_pages:
                if page_num < 1 or page_num > total_pages:
                    continue
                page = doc[page_num - 1]
                if position == "Tiled":
                    add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation)
                else:
                    add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation)

            doc.save(output_path)
            doc.close()
            return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}

    except Exception as e:
        return {"success": False, "error": str(e)}


def add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation):
    watermark_image = create_high_quality_image(text, font_size, text_color, opacity, rotation)
    img_bytes = io.BytesIO()
    watermark_image.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    pix = fitz.Pixmap(img_bytes.read())
    dpi = 300
    width_in_points = pix.width * 72 / dpi
    height_in_points = pix.height * 72 / dpi
    rect = calculate_position(page.rect, position, width_in_points, height_in_points)
    page.insert_image(rect, pixmap=pix)
    pix = None


def add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation):
    page_rect = page.rect
    page_width = page_rect.width
    page_height = page_rect.height
    watermark_image = create_high_quality_image(text, font_size, text_color, opacity, rotation)
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


DEFAULT_CJK_RANGES = [
    (0x3000, 0x303F),  # CJK Symbols and Punctuation
    (0x3040, 0x309F),  # Hiragana
    (0x30A0, 0x30FF),  # Katakana
    (0x3400, 0x4DBF),  # CJK Unified Ideographs Extension A
    (0x4E00, 0x9FFF),  # CJK Unified Ideographs
    (0xAC00, 0xD7AF),  # Hangul Syllables
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]

DEFAULT_LATIN_FONTS = [
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


def default_cjk_fonts():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return [
        os.path.join(script_dir, "..", "..", "..", "fonts", "GoNotoCJKCore.ttf"),
        os.path.join(script_dir, "..", "..", "assets", "fonts", "GoNotoCJKCore.ttf"),
        os.path.join(script_dir, "..", "Fonts", "GoNotoCJKCore.ttf"),
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "C:/Windows/Fonts/msyh.ttc",      # Microsoft YaHei
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/simsun.ttc",    # SimSun
        "C:/Windows/Fonts/simhei.ttf",    # SimHei
        "C:/Windows/Fonts/yugothm.ttc",   # Yu Gothic Medium (JP)
        "C:/Windows/Fonts/msgothic.ttc",  # MS Gothic (JP)
        "C:/Windows/Fonts/malgun.ttf",    # Malgun Gothic (KR)
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
    ]


# Cache filled lazily on first call. Sentinel `False` means "not yet loaded";
# resolved value (dict or None) replaces it on first read.
FONT_CONFIG_CACHE = False


def load_font_config():
    """Load watermark font configuration from a JSON file (each key optional).

    Search order:
      1. $LOCALPDF_WATERMARK_FONTS_CONFIG (absolute path to a JSON file)
      2. <script_dir>/watermark_fonts.json

    Schema (any subset; missing keys fall back to hardcoded defaults; the
    file itself is also optional):

        {
          "cjk_font_paths":   ["/abs/path.ttf", "../relative/to/config.ttf"],
          "latin_font_paths":   ["..."],
          "cjk_unicode_ranges": [["4E00", "9FFF"], ["3040", "309F"]]
        }

    Relative `*_font_paths` are resolved against the config file's directory.
    Range bounds may be hex strings ("4E00") or ints (20000).
    Any parse error -> fall back to defaults silently.
    """
    global FONT_CONFIG_CACHE
    if FONT_CONFIG_CACHE is not False:
        return FONT_CONFIG_CACHE

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
            FONT_CONFIG_CACHE = {
                "cjk_fonts": normalize_paths(cfg.get("cjk_font_paths"), base),
                "latin_fonts": normalize_paths(cfg.get("latin_font_paths"), base),
                "cjk_ranges": normalize_ranges(cfg.get("cjk_unicode_ranges")),
                "_source": path,
            }
            return FONT_CONFIG_CACHE
        except Exception:
            continue

    FONT_CONFIG_CACHE = None
    return None


def normalize_paths(paths, base):
    if not isinstance(paths, list):
        return None
    out = []
    for p in paths:
        if not isinstance(p, str) or not p:
            continue
        out.append(p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p)))
    return out or None


def normalize_ranges(ranges):
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


def has_cjk(text):
    cfg = load_font_config()
    ranges = (cfg or {}).get("cjk_ranges") or DEFAULT_CJK_RANGES
    for ch in text or "":
        cp = ord(ch)
        for lo, hi in ranges:
            if lo <= cp <= hi:
                return True
    return False


def cjk_font_paths():
    cfg = load_font_config()
    return (cfg or {}).get("cjk_fonts") or default_cjk_fonts()


def latin_font_paths():
    cfg = load_font_config()
    return (cfg or {}).get("latin_fonts") or DEFAULT_LATIN_FONTS


def create_high_quality_image(text, font_size, text_color, opacity, rotation):
    dpi = 300
    scale_factor = dpi / 72.0
    if has_cjk(text):
        font_paths = cjk_font_paths() + latin_font_paths()
    else:
        font_paths = latin_font_paths()
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


def calculate_position(page_rect, position, img_width, img_height):
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


def parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages):
    if pages_range == "all":
        return list(range(1, total_pages + 1))
    elif pages_range == "first":
        return [1]
    elif pages_range == "last":
        return [total_pages]
    elif pages_range == "custom" and custom_pages:
        return parse_custom_pages(custom_pages, total_pages)
    else:
        start = max(1, start_page)
        end = min(total_pages, end_page) if end_page > 0 else total_pages
        return list(range(start, end + 1))


def parse_custom_pages(custom_pages, total_pages):
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


def add_image_watermark(input_path, output_path, image_path, position, rotation, opacity,
                        image_scale, start_page, end_page, pages_range, custom_pages):
    try:
        doc = fitz.open(input_path)
        total_pages = doc.page_count
        target_pages = parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)
        for page_num in target_pages:
            if page_num < 1 or page_num > total_pages:
                continue
            page = doc[page_num - 1]
            if position == "Tiled":
                add_tiled_image(page, image_path, image_scale, opacity, rotation)
            else:
                add_single_image(page, image_path, position, image_scale, opacity, rotation)
        doc.save(output_path)
        doc.close()
        return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_single_image(page, image_path, position, image_scale, opacity, rotation):
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
        rect = calculate_position(page.rect, position, pix.width * scale_factor, pix.height * scale_factor)
        page.insert_image(rect, pixmap=pix)
        pix = None


def add_tiled_image(page, image_path, image_scale, opacity, rotation):
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


def run(input_path, output_path, watermark_type="text", text="CONFIDENTIAL",
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
        target_pages = parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)

        for page_num in target_pages:
            if page_num < 1 or page_num > total_pages:
                continue
            page = doc[page_num - 1]
            if watermark_type == "image":
                if position == "Tiled":
                    add_tiled_image(page, image_path, image_scale, opacity, rotation)
                else:
                    add_single_image(page, image_path, position, image_scale, opacity, rotation)
            else:
                if position == "Tiled":
                    add_tiled_high_quality(page, text, font_size, text_color, opacity, rotation)
                else:
                    add_single_high_quality(page, text, position, font_size, text_color, opacity, rotation)

        doc.save(output_path)
        doc.close()
        return {"success": True, "page_count": total_pages, "watermarked_pages": len(target_pages), "output": output_path}
    except Exception as e:
        return {"success": False, "error": str(e)}


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
    result = run(
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
            print(f"\u2705 Added {args.watermark_type} watermark to {result['watermarked_pages']} pages")
        else:
            print(f"\u274c Error: {result['error']}")
