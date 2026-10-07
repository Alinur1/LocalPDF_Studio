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
import json
import pymupdf as fitz


def convert_vector(input_path, output_path, custom_pages=None):
    """Mode 1: Preserve text selectability using recolor()"""
    try:
        doc = fitz.open(input_path)
        output_doc = fitz.open()
        total_pages = len(doc)
        pages_to_convert = set()

        if custom_pages:
            for part in custom_pages.split(','):
                part = part.strip()
                if not part:
                    continue
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
                temp_doc = fitz.open()
                temp_doc.insert_pdf(doc, from_page=i, to_page=i)
                temp_doc.recolor(components=1)
                output_doc.insert_pdf(temp_doc, from_page=0, to_page=0)
                temp_doc.close()
                converted_count += 1
            else:
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


def convert_raster(input_path, output_path, custom_pages=None):
    """Mode 2: Convert pages to images (fallback for complex PDFs)"""
    try:
        doc = fitz.open(input_path)
        output_doc = fitz.open()
        total_pages = len(doc)

        pages_to_convert = set()
        if custom_pages:
            for part in custom_pages.split(','):
                part = part.strip()
                if not part:
                    continue
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


def convert(input_path, output_path, custom_pages=None, mode="vector"):
    if mode == "raster":
        return convert_raster(input_path, output_path, custom_pages)
    else:
        return convert_vector(input_path, output_path, custom_pages)


class pdf_to_grayscale:
    pass


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

    result = convert(args['input_path'], args['output_path'], args['custom_pages'], args['mode'])
    print(json.dumps(result))
    return 0 if result["success"] else 1
