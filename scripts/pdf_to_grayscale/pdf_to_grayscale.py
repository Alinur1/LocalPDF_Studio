##
 # LocalPDF Studio - Offline PDF Toolkit
 # ======================================
 # 
 # @author      Md. Alinur Hossain <alinur1160@gmail.com>
 # @license     AGPL 3.0 (GNU Affero General Public License version 3)
 # @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 # @repository  https://github.com/Alinur1/LocalPDF_Studio
 # 
 # Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 # 
 # Architecture:
 # - Frontend: Electron + HTML/CSS/JS
 # - Backend: ASP.NET Core Web API, Python
 # - PDF Engine: PdfSharp + Mozilla PDF.js
##

# pdf_to_grayscale.py
import sys
import json
import os
import fitz  # PyMuPDF

def convert_to_grayscale(input_path, output_path, custom_pages=None, skip_images=False):
    try:
        # Open the PDF
        doc = fitz.open(input_path)
        
        # Create a new PDF for output
        output_doc = fitz.open()
        
        total_pages = len(doc)
        
        # Parse custom pages format
        pages_to_convert = set()
        
        if custom_pages:
            try:
                parts = custom_pages.split(',')
                for part in parts:
                    part = part.strip()
                    if not part:
                        continue
                    
                    if '-' in part:
                        # Handle range like "3-6"
                        range_parts = part.split('-')
                        if len(range_parts) == 2:
                            start = int(range_parts[0].strip())
                            end = int(range_parts[1].strip())
                            for page_num in range(start, end + 1):
                                if 1 <= page_num <= total_pages:
                                    pages_to_convert.add(page_num)
                    else:
                        # Handle individual page number
                        page_num = int(part)
                        if 1 <= page_num <= total_pages:
                            pages_to_convert.add(page_num)
            except Exception as parse_error:
                raise Exception(f"Invalid custom pages format: {str(parse_error)}")
        else:
            # All pages
            pages_to_convert = set(range(1, total_pages + 1))
        
        if not pages_to_convert:
            raise Exception("No valid pages specified")
        
        converted_count = 0
        
        # Process each page
        for page_num in range(total_pages):
            page = doc[page_num]
            actual_page_num = page_num + 1  # 1-indexed for comparison
            
            # Check if this page is in the range to convert
            should_convert = actual_page_num in pages_to_convert
            
            # Render page as pixmap
            zoom = 2.0  # Increase for better quality
            mat = fitz.Matrix(zoom, zoom)
            
            if should_convert:
                if skip_images:
                    # Keep original colors for content
                    pix = page.get_pixmap(matrix=mat)
                else:
                    # Convert to grayscale
                    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
                converted_count += 1
            else:
                # Keep original colors for pages outside range
                pix = page.get_pixmap(matrix=mat)
            
            # Create new page with same dimensions
            rect = page.rect
            new_page = output_doc.new_page(width=rect.width, height=rect.height)
            
            # Insert the image
            new_page.insert_image(rect, pixmap=pix)
            
            # Progress
            progress = int(((page_num + 1) / total_pages) * 100)
            sys.stderr.write(f"PROGRESS:{progress}\n")
        
        # Save the result
        output_doc.save(output_path, garbage=4, deflate=True)
        output_doc.close()
        doc.close()
        
        return {
            "success": True,
            "output": f"Successfully converted {converted_count} pages to grayscale",
            "error": "",
            "pageCount": total_pages,
            "convertedPages": converted_count,
            "hasImages": True,
            "hasVectorGraphics": True
        }
        
    except Exception as e:
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "pageCount": 0,
            "convertedPages": 0,
            "hasImages": False,
            "hasVectorGraphics": False
        }

def parse_arguments():
    """Parse command-line arguments"""
    args = {
        'input_path': None,
        'output_path': None,
        'custom_pages': None,
        'skip_images': False
    }
    
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        
        if arg == '--custom-pages' and i + 1 < len(sys.argv):
            args['custom_pages'] = sys.argv[i + 1].strip('"')
            i += 2
        elif arg == '--skip-images':
            args['skip_images'] = True
            i += 1
        elif not arg.startswith('--'):
            if args['input_path'] is None:
                args['input_path'] = arg.strip('"')
            elif args['output_path'] is None:
                args['output_path'] = arg.strip('"')
            i += 1
        else:
            i += 1
    
    return args

def main():
    args = parse_arguments()
    
    if args['input_path'] is None or args['output_path'] is None:
        print(json.dumps({"success": False, "error": "Usage: pdf_to_grayscale.exe input.pdf output.pdf [--custom-pages \"1,2,3-6,8\"] [--skip-images]"}))
        return 1
    
    result = convert_to_grayscale(
        args['input_path'],
        args['output_path'],
        custom_pages=args['custom_pages'],
        skip_images=args['skip_images']
    )
    print(json.dumps(result))
    
    return 0 if result["success"] else 1

if __name__ == "__main__":
    sys.exit(main())