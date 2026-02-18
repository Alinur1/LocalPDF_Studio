#!/usr/bin/env python3
"""
PDF to Grayscale Converter using PyMuPDF
"""

import sys
import json
import os
import fitz  # PyMuPDF

def convert_to_grayscale(input_path, output_path):
    try:
        # Open the PDF
        doc = fitz.open(input_path)
        
        # Create a new PDF for output
        output_doc = fitz.open()
        
        total_pages = len(doc)
        
        # Process each page
        for page_num in range(total_pages):
            page = doc[page_num]
            
            # Render page as pixmap
            zoom = 2.0  # Increase for better quality
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
            
            # Create new page with same dimensions
            rect = page.rect
            new_page = output_doc.new_page(width=rect.width, height=rect.height)
            
            # Insert the grayscale image
            new_page.insert_image(rect, pixmap=pix)
            
            # Progress
            sys.stderr.write(f"PROGRESS:{int((page_num + 1) / total_pages * 100)}\n")
        
        # Save the result
        output_doc.save(output_path, garbage=4, deflate=True)
        output_doc.close()
        doc.close()
        
        return {
            "success": True,
            "output": f"Successfully converted {total_pages} pages to grayscale",
            "error": "",
            "pageCount": total_pages,
            "convertedPages": total_pages,
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

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: pdf_to_grayscale.exe input.pdf output.pdf"}))
        return 1
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    result = convert_to_grayscale(input_path, output_path)
    print(json.dumps(result))
    
    return 0 if result["success"] else 1

if __name__ == "__main__":
    sys.exit(main())