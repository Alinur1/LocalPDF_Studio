#!/usr/bin/env python3
import argparse
import fitz  # PyMuPDF
import os
import sys
import json
from PIL import Image, ImageDraw, ImageFont
import tempfile
import io


def add_text_watermark(input_path, output_path, text, position, rotation, opacity, 
                      font_size, text_color, start_page, end_page, pages_range, custom_pages):
    try:
        if not os.path.exists(input_path):
            return {"success": False, "error": f"Input file not found: {input_path}"}

        doc = fitz.open(input_path)
        total_pages = doc.page_count
        
        # Parse page range
        target_pages = parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages)
        
        for page_num in target_pages:
            if page_num < 1 or page_num > total_pages:
                continue
                
            page = doc[page_num - 1]
            
            # Create watermark as image (this makes it non-selectable)
            watermark_image = create_text_watermark_image(page.rect, text, font_size, text_color, opacity, rotation)
            
            # Convert PIL image to bytes (using PNG instead of PPM)
            img_bytes = io.BytesIO()
            watermark_image.save(img_bytes, format='PNG')
            img_bytes.seek(0)
            
            # Create PyMuPDF image from PNG bytes
            pix = fitz.Pixmap(img_bytes.read())
            
            # Calculate position
            rect = calculate_watermark_rect(page.rect, position, pix.width, pix.height)
            
            # Add image to page
            page.insert_image(rect, pixmap=pix)
            
            pix = None  # Free memory

        doc.save(output_path)
        doc.close()
        
        return {
            "success": True,
            "page_count": total_pages,
            "watermarked_pages": len(target_pages),
            "output": output_path
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def create_text_watermark_image(page_rect, text, font_size, text_color, opacity, rotation):
    """Create watermark as image to make it non-selectable"""
    # Create a larger image to accommodate rotation
    scale_factor = 2
    width = int(page_rect.width * scale_factor)
    height = int(page_rect.height * scale_factor)
    
    # Create transparent image
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    try:
        # Try to use a system font - more reliable approach
        font_paths = [
            "arial.ttf",
            "Arial.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf"
        ]
        
        font = None
        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, font_size)
                break
            except:
                continue
        
        if font is None:
            # Fallback to default font
            font = ImageFont.load_default()
            
    except Exception as e:
        print(f"Font loading warning: {e}")
        font = ImageFont.load_default()
    
    # Calculate text size and position
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except:
        # Fallback for older PIL versions
        text_width = len(text) * font_size
        text_height = font_size
    
    # Center position
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    # Convert hex color to RGB
    if text_color.startswith('#'):
        r = int(text_color[1:3], 16)
        g = int(text_color[3:5], 16)
        b = int(text_color[5:7], 16)
        text_color_rgb = (r, g, b)
    else:
        text_color_rgb = (52, 152, 219)  # Default blue
    
    # Add alpha channel for opacity
    alpha = int(255 * opacity / 100)
    text_color_with_alpha = text_color_rgb + (alpha,)
    
    # Draw text
    draw.text((x, y), text, fill=text_color_with_alpha, font=font)
    
    # Rotate image
    if rotation != 0:
        image = image.rotate(rotation, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
    
    return image


def calculate_watermark_rect(page_rect, position, watermark_width, watermark_height):
    """Calculate watermark position based on user selection"""
    page_width = page_rect.width
    page_height = page_rect.height
    
    margin = 20
    
    # Scale down watermark to fit page better
    scale = 0.8
    watermark_width = int(watermark_width * scale)
    watermark_height = int(watermark_height * scale)
    
    if position == "Diagonal":  # Centered diagonally
        x = (page_width - watermark_width) / 2
        y = (page_height - watermark_height) / 2
    elif position == "Center":
        x = (page_width - watermark_width) / 2
        y = (page_height - watermark_height) / 2
    elif position == "TopLeft":
        x = margin
        y = margin
    elif position == "TopRight":
        x = page_width - watermark_width - margin
        y = margin
    elif position == "BottomLeft":
        x = margin
        y = page_height - watermark_height - margin
    elif position == "BottomRight":
        x = page_width - watermark_width - margin
        y = page_height - watermark_height - margin
    elif position == "Tiled":
        # For tiled, we'll use centered for now (simplified)
        x = (page_width - watermark_width) / 2
        y = (page_height - watermark_height) / 2
    else:
        x = (page_width - watermark_width) / 2
        y = (page_height - watermark_height) / 2
    
    return fitz.Rect(x, y, x + watermark_width, y + watermark_height)


def parse_page_range(total_pages, start_page, end_page, pages_range, custom_pages):
    """Parse which pages to apply watermark to"""
    if pages_range == "all":
        return list(range(1, total_pages + 1))
    elif pages_range == "first":
        return [1]
    elif pages_range == "last":
        return [total_pages]
    elif pages_range == "custom" and custom_pages:
        return parse_custom_pages(custom_pages, total_pages)
    else:
        # Default range based on start/end page
        start = max(1, start_page)
        end = min(total_pages, end_page) if end_page > 0 else total_pages
        return list(range(start, end + 1))


def parse_custom_pages(custom_pages, total_pages):
    """Parse custom page range like '1-5,7,9-12'"""
    pages = set()
    parts = custom_pages.split(',')
    
    for part in parts:
        part = part.strip()
        if '-' in part:
            start_end = part.split('-')
            if len(start_end) == 2:
                try:
                    start = int(start_end[0])
                    end = int(start_end[1])
                    for p in range(start, end + 1):
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


def main():
    parser = argparse.ArgumentParser(description="Add watermark to PDF pages")
    parser.add_argument("input", help="Path to input PDF file")
    parser.add_argument("output", help="Path to output PDF file")
    
    # Watermark options
    parser.add_argument("--text", type=str, required=True, help="Watermark text")
    parser.add_argument("--position", type=str, default="Diagonal", 
                       choices=["Diagonal", "Center", "TopLeft", "TopRight", "BottomLeft", "BottomRight", "Tiled"],
                       help="Watermark position")
    parser.add_argument("--rotation", type=int, default=45, help="Rotation angle in degrees")
    parser.add_argument("--opacity", type=int, default=60, help="Opacity percentage (1-100)")
    parser.add_argument("--font-size", type=int, default=36, help="Font size")
    parser.add_argument("--text-color", type=str, default="#3498db", help="Text color in hex")
    
    # Page range options
    parser.add_argument("--start-page", type=int, default=1, help="Start page (1-based)")
    parser.add_argument("--end-page", type=int, default=0, help="End page (0 for all)")
    parser.add_argument("--pages-range", type=str, default="all", 
                       choices=["all", "first", "last", "custom"], help="Pages range type")
    parser.add_argument("--custom-pages", type=str, default="", help="Custom pages (e.g., '1-5,7,9-12')")
    
    parser.add_argument("--json", action="store_true", help="Return JSON result for .NET backend")

    args = parser.parse_args()

    result = add_text_watermark(
        input_path=args.input,
        output_path=args.output,
        text=args.text,
        position=args.position,
        rotation=args.rotation,
        opacity=args.opacity,
        font_size=args.font_size,
        text_color=args.text_color,
        start_page=args.start_page,
        end_page=args.end_page,
        pages_range=args.pages_range,
        custom_pages=args.custom_pages
    )

    if args.json:
        print(json.dumps(result))
    else:
        if result["success"]:
            print(f"✅ Added watermark to {result['watermarked_pages']} pages")
        else:
            print(f"❌ Error: {result['error']}")


if __name__ == "__main__":
    main()