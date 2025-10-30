##
 # LocalPDF Studio - Offline PDF Toolkit
 # ======================================
 # 
 # @author      Md. Alinur Hossain <alinur1160@gmail.com>
 # @version     0.0.2
 # @license     MPL-2.0 (Mozilla Public License 2.0)
 # @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 # @repository  https://github.com/Alinur1/LocalPDF_Studio
 # 
 # Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 # 
 # This Source Code Form is subject to the terms of the Mozilla Public
 # License, v. 2.0. If a copy of the MPL was not distributed with this
 # file, You can obtain one at https://mozilla.org/MPL/2.0/.
 # 
 # Architecture:
 # - Frontend: Electron + HTML/CSS/JS
 # - Backend: ASP.NET Core Web API, Python
 # - PDF Engine: PdfSharp + Mozilla PDF.js
##


import fitz  # PyMuPDF
import json
import sys
import os
from PIL import Image
import io
import base64

def extract_images_from_pdf(pdf_path, pages=None, page_ranges=None, mode="extract"):
    """
    Extract or analyze images from PDF pages
    
    Args:
        pdf_path: Path to PDF file
        pages: List of specific page numbers (1-based)
        page_ranges: List of page ranges like ["1-3", "5-7"]
        mode: "extract" or "remove"
    
    Returns:
        Dictionary with results
    """
    try:
        doc = fitz.open(pdf_path)
        total_pages = doc.page_count
        
        # Determine pages to process
        pages_to_process = set()
        
        # If no pages specified, process all pages
        if not pages and not page_ranges:
            pages_to_process = set(range(total_pages))
        else:
            # Add specific pages
            if pages:
                for page_num in pages:
                    if 1 <= page_num <= total_pages:
                        pages_to_process.add(page_num - 1)  # Convert to 0-based
            
            # Add page ranges
            if page_ranges:
                for range_str in page_ranges:
                    if '-' in range_str:
                        start_str, end_str = range_str.split('-', 1)
                        try:
                            start = int(start_str.strip())
                            end = int(end_str.strip())
                            for page_num in range(start, end + 1):
                                if 1 <= page_num <= total_pages:
                                    pages_to_process.add(page_num - 1)
                        except ValueError:
                            continue
                    else:
                        # Single page in range format
                        try:
                            page_num = int(range_str.strip())
                            if 1 <= page_num <= total_pages:
                                pages_to_process.add(page_num - 1)
                        except ValueError:
                            continue
        
        pages_to_process = sorted(pages_to_process)
        
        if mode == "extract":
            return extract_images(doc, pages_to_process)
        else:  # remove mode
            return remove_images(doc, pages_to_process, pdf_path)
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Error processing PDF: {str(e)}",
            "extracted_count": 0,
            "processed_pages": 0
        }
    finally:
        if 'doc' in locals():
            doc.close()

def extract_images(doc, pages_to_process):
    """Extract images from specified pages"""
    all_images = []
    total_images = 0
    
    for page_index in pages_to_process:
        page = doc[page_index]
        image_list = page.get_images()
        
        for img_index, img in enumerate(image_list):
            try:
                xref = img[0]
                pix = fitz.Pixmap(doc, xref)
                
                # Convert to RGB if needed
                if pix.n - pix.alpha < 4:  # can be saved as PNG
                    img_data = pix.tobytes("png")
                    
                    image_info = {
                        "page": page_index + 1,
                        "index": img_index,
                        "width": pix.width,
                        "height": pix.height,
                        "format": "png",
                        "data": base64.b64encode(img_data).decode('ascii')
                    }
                    all_images.append(image_info)
                    total_images += 1
                
                pix = None  # Free pixmap memory
                
            except Exception as e:
                print(f"Warning: Failed to extract image {img_index} from page {page_index + 1}: {e}", file=sys.stderr)
                continue
    
    return {
        "success": True,
        "extracted_count": total_images,
        "processed_pages": len(pages_to_process),
        "images": all_images
    }

def remove_images(doc, pages_to_process, original_path):
    """Remove images from specified pages and return modified PDF"""
    try:
        # Create a new document
        new_doc = fitz.open()
        
        # Copy all pages from original to new document
        new_doc.insert_pdf(doc)
        
        images_removed_count = 0
        
        # Remove images from specified pages in the new document
        for page_index in pages_to_process:
            if page_index < len(new_doc):
                page = new_doc[page_index]
                image_list = page.get_images()
                
                for img in image_list:
                    xref = img[0]
                    try:
                        # Remove the image object from the PDF
                        new_doc._deleteObject(xref)
                        images_removed_count += 1
                    except Exception as e:
                        print(f"Warning: Could not remove image xref {xref} from page {page_index + 1}: {e}", file=sys.stderr)
                        continue
        
        # Save to a bytes buffer
        import io
        pdf_buffer = io.BytesIO()
        new_doc.save(pdf_buffer)
        pdf_data = pdf_buffer.getvalue()
        new_doc.close()
        
        if not pdf_data:
            return {
                "success": False,
                "error": "Failed to generate PDF data",
                "processed_pages": 0
            }
        
        return {
            "success": True,
            "processed_pages": len(pages_to_process),
            "pdf_data": base64.b64encode(pdf_data).decode('ascii'),
            "removed_images_count": images_removed_count
        }
        
    except Exception as e:
        # Ensure documents are closed in case of error
        if 'new_doc' in locals():
            new_doc.close()
        return {
            "success": False,
            "error": f"Error removing images: {str(e)}",
            "processed_pages": 0
        }

def main():
    if len(sys.argv) < 2:
        error_result = {"success": False, "error": "No arguments provided"}
        print(json.dumps(error_result))
        sys.exit(1)
    
    try:
        # Read JSON from file (first argument is file path)
        json_file_path = sys.argv[1]
        
        with open(json_file_path, 'r', encoding='utf-8') as f:
            request = json.load(f)
        
        pdf_path = request.get("file_path")
        pages = request.get("pages")
        page_ranges = request.get("page_ranges")
        mode = request.get("mode", "extract")
        
        if not pdf_path or not os.path.exists(pdf_path):
            error_result = {"success": False, "error": f"PDF file not found: {pdf_path}"}
            print(json.dumps(error_result))
            sys.exit(1)
        
        result = extract_images_from_pdf(pdf_path, pages, page_ranges, mode)
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        error_result = {"success": False, "error": f"Invalid JSON input: {str(e)}"}
        print(json.dumps(error_result))
        sys.exit(1)
    except Exception as e:
        error_result = {"success": False, "error": f"Processing error: {str(e)}"}
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()