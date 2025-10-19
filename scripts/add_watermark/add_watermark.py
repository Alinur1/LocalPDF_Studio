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
            
            if position == "Tiled":
                # Handle tiled watermarks
                add_tiled_watermark_high_quality(page, text, font_size, text_color, opacity, rotation)
            else:
                # Handle single watermark with high-quality approach
                add_single_watermark_high_quality(page, text, position, font_size, text_color, opacity, rotation)

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

def add_single_watermark_high_quality(page, text, position, font_size, text_color, opacity, rotation):
    """Add high-quality image watermark"""
    # Create high-quality image
    watermark_image = create_high_quality_watermark_image(text, font_size, text_color, opacity, rotation)
    
    # Convert to bytes
    img_bytes = io.BytesIO()
    watermark_image.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    
    # Create pixmap
    pix = fitz.Pixmap(img_bytes.read())
    
    # Convert pixel dimensions to points
    dpi = 300
    width_in_points = pix.width * 72 / dpi
    height_in_points = pix.height * 72 / dpi
    
    # Calculate position (using dimensions in points)
    rect = calculate_simple_position(page.rect, position, width_in_points, height_in_points)
    
    # Insert image
    page.insert_image(rect, pixmap=pix)
    pix = None

def add_tiled_watermark_high_quality(page, text, font_size, text_color, opacity, rotation):
    """Add three high-quality watermarks"""
    page_rect = page.rect
    page_width = page_rect.width
    page_height = page_rect.height
    
    # Create high-quality image
    watermark_image = create_high_quality_watermark_image(text, font_size, text_color, opacity, rotation)
    
    # Convert to bytes
    img_bytes = io.BytesIO()
    watermark_image.save(img_bytes, format='PNG', dpi=(300, 300))
    img_bytes.seek(0)
    pix = fitz.Pixmap(img_bytes.read())
    
    # Convert pixel dimensions to points
    dpi = 300
    watermark_width = pix.width * 72 / dpi
    watermark_height = pix.height * 72 / dpi
    
    # Position three watermarks: center, top-center, bottom-center
    center_x = page_width / 2
    center_y = page_height / 2
    
    positions = [
        (center_x - watermark_width / 2, center_y - watermark_height / 2),  # Center
        (center_x - watermark_width / 2, center_y / 3 - watermark_height / 2),  # Top-third
        (center_x - watermark_width / 2, center_y * 5/3 - watermark_height / 2)  # Bottom-third
    ]
    
    # Add the three watermarks
    for x, y in positions:
        rect = fitz.Rect(x, y, x + watermark_width, y + watermark_height)
        page.insert_image(rect, pixmap=pix)
    
    pix = None  # Free memory

def create_high_quality_watermark_image(text, font_size, text_color, opacity, rotation):
    """Create high-quality watermark image with proper DPI"""
    # Use high DPI for crisp rendering
    dpi = 300
    scale_factor = dpi / 72.0  # PDF points to pixels
    
    # Load font first to calculate text dimensions
    try:
        font_paths = [
            "arial.ttf", "Arial.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf"
        ]
        
        font = None
        for font_path in font_paths:
            try:
                # Scale font size for high DPI
                scaled_font_size = int(font_size * scale_factor)
                font = ImageFont.truetype(font_path, scaled_font_size)
                break
            except:
                continue
        
        if font is None:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()
    
    # Create temporary image to measure text
    temp_image = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_image)
    
    # Calculate text dimensions with high DPI font
    try:
        bbox = temp_draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except:
        # Fallback for older PIL versions
        text_width = len(text) * font_size * scale_factor
        text_height = font_size * scale_factor
    
    # Add generous padding
    padding = int(font_size * scale_factor * 0.8)
    width = int(text_width + padding * 2)
    height = int(text_height + padding * 2)
    
    # Create high-resolution image
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Calculate text position
    x = (width - text_width) // 2
    y = (height - text_height) // 2
    
    # Convert color and apply opacity
    if text_color.startswith('#'):
        r = int(text_color[1:3], 16)
        g = int(text_color[3:5], 16)
        b = int(text_color[5:7], 16)
    else:
        r, g, b = 52, 152, 219
    
    alpha = int(255 * opacity / 100)
    text_color_with_alpha = (r, g, b, alpha)
    
    # Draw text with high-quality font
    draw.text((x, y), text, fill=text_color_with_alpha, font=font)
    
    # Rotate with high quality
    if rotation != 0:
        image = image.rotate(-rotation, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
    
    return image

def calculate_simple_position(page_rect, position, img_width, img_height):
    """Simple positioning without complex scaling"""
    page_width = page_rect.width
    page_height = page_rect.height
    
    # Use percentage-based margins for better corner placement
    margin_x = page_width * 0.05  # 5% margin
    margin_y = page_height * 0.05  # 5% margin
    
    if position == "Center":
        x = (page_width - img_width) / 2
        y = (page_height - img_height) / 2
    elif position == "TopLeft":
        x = margin_x
        y = margin_y
    elif position == "TopRight":
        x = page_width - img_width - margin_x
        y = margin_y
    elif position == "BottomLeft":
        x = margin_x
        y = page_height - img_height - margin_y
    elif position == "BottomRight":
        x = page_width - img_width - margin_x
        y = page_height - img_height - margin_y
    elif position == "Tiled":
        # For tiled, use center position
        x = (page_width - img_width) / 2
        y = (page_height - img_height) / 2
    else:
        x = (page_width - img_width) / 2
        y = (page_height - img_height) / 2
    
    return fitz.Rect(x, y, x + img_width, y + img_height)

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
    parser.add_argument("--position", type=str, default="Center", 
                   choices=["Center", "TopLeft", "TopRight", "BottomLeft", "BottomRight", "Tiled"],
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