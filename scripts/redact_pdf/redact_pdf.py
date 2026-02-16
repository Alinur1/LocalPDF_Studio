#!/usr/bin/env python3
"""
PDF Redaction Tool using PyMuPDF
Permanently removes content from specified areas (secure redaction)
Licensed under AGPLv3
"""

import sys
import json
import argparse
import fitz  # PyMuPDF


def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple (0-1 range for PyMuPDF)"""
    hex_color = hex_color.lstrip('#')
    r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return (r / 255.0, g / 255.0, b / 255.0)


def apply_redactions(input_path, output_path, redactions):
    """
    Apply redactions to PDF using PyMuPDF's secure redaction feature.
    This permanently removes content - it cannot be recovered.
    """
    try:
        # Open PDF
        doc = fitz.open(input_path)
        total_redactions = 0
        pages_redacted = set()

        # Group redactions by page for efficiency
        redactions_by_page = {}
        for redaction in redactions:
            page_num = redaction['page']
            if page_num not in redactions_by_page:
                redactions_by_page[page_num] = []
            redactions_by_page[page_num].append(redaction)

        # Apply redactions page by page
        for page_num, page_redactions in redactions_by_page.items():
            # Validate page number
            if page_num < 1 or page_num > len(doc):
                print(f"Warning: Page {page_num} out of range (1-{len(doc)}), skipping", file=sys.stderr)
                continue

            page = doc[page_num - 1]  # PyMuPDF uses 0-based indexing
            page_width = page.rect.width
            page_height = page.rect.height

            # Apply each redaction on this page
            for redact in page_redactions:
                try:
                    # Convert normalized coordinates (0-1) to absolute coordinates
                    x0 = redact['x'] * page_width
                    y0 = redact['y'] * page_height
                    x1 = x0 + (redact['width'] * page_width)
                    y1 = y0 + (redact['height'] * page_height)

                    # Create rectangle for redaction area
                    rect = fitz.Rect(x0, y0, x1, y1)

                    # Convert color from hex to RGB
                    fill_color = hex_to_rgb(redact['color'])

                    # Add redaction annotation
                    # This marks the area for redaction
                    annot = page.add_redact_annot(rect, fill=fill_color)

                    total_redactions += 1

                except Exception as e:
                    print(f"Error applying redaction on page {page_num}: {str(e)}", file=sys.stderr)
                    continue

            # Apply all redactions on this page
            # This is the critical step - it PERMANENTLY removes the content
            # After this, the text/images in redacted areas cannot be recovered
            page.apply_redactions(images=2, graphics=fitz.PDF_REDACT_IMAGE_REMOVE)
            pages_redacted.add(page_num)

        # Save the redacted PDF
        # Use garbage collection and deflate to optimize file size
        doc.save(
            output_path,
            garbage=4,  # Maximum garbage collection
            deflate=True,  # Compress streams
            clean=True  # Clean up unused objects
        )
        doc.close()

        # Return success result as JSON
        result = {
            "success": True,
            "total_redactions": total_redactions,
            "pages_redacted": len(pages_redacted),
            "pages_list": sorted(list(pages_redacted)),
            "output_file": output_path
        }

        print(json.dumps(result))
        return 0

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result))
        return 1


def main():
    parser = argparse.ArgumentParser(
        description='Securely redact PDF areas using PyMuPDF',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage with JSON input
  %(prog)s input.pdf output.pdf --redactions '[{"page":1,"x":0.1,"y":0.2,"width":0.3,"height":0.1,"color":"#000000"}]'
  
  # Using JSON file
  %(prog)s input.pdf output.pdf --redactions-file redactions.json
  
Redaction format (normalized coordinates 0-1):
  {
    "page": 1,           # Page number (1-based)
    "x": 0.1,            # Left position (0-1, relative to page width)
    "y": 0.2,            # Top position (0-1, relative to page height)
    "width": 0.3,        # Width (0-1, relative to page width)
    "height": 0.1,       # Height (0-1, relative to page height)
    "color": "#000000"   # Fill color (hex)
  }
        """
    )

    parser.add_argument('input_pdf', help='Input PDF file path')
    parser.add_argument('output_pdf', help='Output PDF file path')
    
    # Redaction data can be provided as JSON string or file
    redaction_group = parser.add_mutually_exclusive_group(required=True)
    redaction_group.add_argument(
        '--redactions',
        help='JSON string containing array of redaction objects'
    )
    redaction_group.add_argument(
        '--redactions-file',
        help='JSON file containing array of redaction objects'
    )
    
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output result as JSON'
    )

    args = parser.parse_args()

    # Parse redactions
    try:
        if args.redactions:
            redactions_data = json.loads(args.redactions)
        else:
            with open(args.redactions_file, 'r') as f:
                redactions_data = json.load(f)

        if not isinstance(redactions_data, list):
            raise ValueError("Redactions must be an array")

    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Failed to parse redactions: {str(e)}"
        }
        print(json.dumps(error_result))
        return 1

    # Validate redactions
    for i, redact in enumerate(redactions_data):
        required_fields = ['page', 'x', 'y', 'width', 'height', 'color']
        for field in required_fields:
            if field not in redact:
                error_result = {
                    "success": False,
                    "error": f"Redaction {i} missing required field: {field}"
                }
                print(json.dumps(error_result))
                return 1

    # Apply redactions
    return apply_redactions(args.input_pdf, args.output_pdf, redactions_data)


if __name__ == '__main__':
    sys.exit(main())