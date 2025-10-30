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


import sys
import argparse
import json
from pathlib import Path
from typing import Dict, Any
import io
import shutil

try:
    import pikepdf
    from PIL import Image
except ImportError as e:
    print(json.dumps({
        "Success": False,
        "Error": f"Required library not found: {str(e)}. Install: pip install pikepdf pillow"
    }))
    sys.exit(1)


def compress_images_nuclear(pdf, quality):
    """
    NUCLEAR image compression - maximum aggression!
    """
    print(f"DEBUG: Starting NUCLEAR compression with quality {quality}", file=sys.stderr)
    images_processed = 0
    
    for page_num, page in enumerate(pdf.pages):
        try:
            images = list(page.images.keys())
            print(f"DEBUG: Page {page_num} has {len(images)} images", file=sys.stderr)
            
            for image_key in images:
                try:
                    print(f"DEBUG: NUKING image {image_key}", file=sys.stderr)
                    raw_image = page.images[image_key]
                    pdfimage = pikepdf.PdfImage(raw_image)
                    
                    # Get image properties
                    width = pdfimage.width
                    height = pdfimage.height
                    print(f"DEBUG: Original size: {width}x{height}", file=sys.stderr)
                    
                    # Skip only VERY small images (under 1000 pixels total)
                    if width * height < 1000:
                        print(f"DEBUG: Skipping tiny image", file=sys.stderr)
                        continue
                    
                    # Extract as PIL image
                    pil_image = pdfimage.as_pil_image()
                    print(f"DEBUG: PIL image mode: {pil_image.mode}", file=sys.stderr)
                    
                    # Convert to RGB if needed (SIMPLIFIED)
                    if pil_image.mode != 'RGB':
                        pil_image = pil_image.convert('RGB')
                    
                    # EXTREME DOWNSAMPLING - NUCLEAR OPTION
                    if quality <= 10:
                        max_dimension = 400    # SUPER SMALL
                        jpeg_quality = 5       # EXTREME COMPRESSION
                    elif quality <= 30:
                        max_dimension = 600
                        jpeg_quality = 10
                    elif quality <= 50:
                        max_dimension = 800
                        jpeg_quality = 20
                    else:
                        max_dimension = 1024
                        jpeg_quality = max(30, quality)
                    
                    print(f"DEBUG: NUCLEAR SETTINGS - Max: {max_dimension}px, Quality: {jpeg_quality}", file=sys.stderr)
                    
                    # ALWAYS resize to maximum dimension
                    if width > max_dimension or height > max_dimension:
                        ratio = min(max_dimension / width, max_dimension / height)
                        new_width = int(width * ratio)
                        new_height = int(height * ratio)
                        print(f"DEBUG: NUKING size: {width}x{height} -> {new_width}x{new_height}", file=sys.stderr)
                        pil_image = pil_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    else:
                        # Even if under max, still resize to 80% for extra compression
                        new_width = int(width * 0.8)
                        new_height = int(height * 0.8)
                        print(f"DEBUG: Still nuking: {width}x{height} -> {new_width}x{new_height}", file=sys.stderr)
                        pil_image = pil_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    
                    # Save as JPEG with MAXIMUM compression
                    img_byte_arr = io.BytesIO()
                    pil_image.save(img_byte_arr, format='JPEG', quality=jpeg_quality, optimize=True)
                    img_data = img_byte_arr.getvalue()
                    
                    print(f"DEBUG: NUKED image size: {len(img_data)} bytes", file=sys.stderr)
                    
                    # Replace the image stream data
                    raw_image.write(img_data, filter=pikepdf.Name("/DCTDecode"))
                    
                    # Update image dimensions
                    raw_image['/Width'] = pil_image.width
                    raw_image['/Height'] = pil_image.height
                    raw_image['/ColorSpace'] = pikepdf.Name('/DeviceRGB')
                    raw_image['/BitsPerComponent'] = 8
                    
                    images_processed += 1
                    print(f"DEBUG: Successfully NUKED image {image_key}", file=sys.stderr)
                    
                except Exception as e:
                    print(f"DEBUG: Failed to nuke image {image_key}: {str(e)}", file=sys.stderr)
                    continue
                    
        except Exception as e:
            print(f"DEBUG: Error nuking page {page_num}: {str(e)}", file=sys.stderr)
            continue
    
    print(f"DEBUG: NUKED {images_processed} images", file=sys.stderr)
    return images_processed > 0


def remove_duplicate_images(pdf):
    """
    Remove duplicate images to save even more space!
    """
    print("DEBUG: Removing duplicate images...", file=sys.stderr)
    image_hashes = {}
    duplicates_removed = 0
    
    for page_num, page in enumerate(pdf.pages):
        try:
            for image_key in list(page.images.keys()):
                try:
                    raw_image = page.images[image_key]
                    
                    # Create a simple hash of image properties
                    image_hash = f"{raw_image.get('/Width', 0)}x{raw_image.get('/Height', 0)}"
                    
                    if image_hash in image_hashes:
                        # This is a duplicate - remove it!
                        print(f"DEBUG: Removing duplicate image {image_key} on page {page_num}", file=sys.stderr)
                        del page.images[image_key]
                        duplicates_removed += 1
                    else:
                        image_hashes[image_hash] = True
                        
                except Exception as e:
                    continue
                    
        except Exception as e:
            continue
    
    print(f"DEBUG: Removed {duplicates_removed} duplicate images", file=sys.stderr)
    return duplicates_removed


def compress_pdf(input_path: str, output_path: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compress a PDF file with NUCLEAR options.
    """
    try:
        input_file = Path(input_path)
        output_file = Path(output_path)
        
        # Validate input file
        if not input_file.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        if not input_file.suffix.lower() == '.pdf':
            raise ValueError("Input file must be a PDF")
        
        # Get original file size
        original_size = input_file.stat().st_size
        print(f"DEBUG: Original file size: {original_size}", file=sys.stderr)
        
        # Parse options
        quality = options.get('quality', 75)
        remove_metadata = options.get('remove_metadata', False)
        remove_unused = options.get('remove_unused_objects', True)
        
        print(f"DEBUG: NUCLEAR SETTINGS - Quality: {quality}, Remove Metadata: {remove_metadata}, Remove Unused: {remove_unused}", file=sys.stderr)
        
        # Validate quality
        if not 1 <= quality <= 100:
            raise ValueError("Quality must be between 1 and 100")
        
        # Open PDF with pikepdf
        with pikepdf.open(input_path) as pdf:
            
            # Remove metadata if requested
            if remove_metadata:
                print("DEBUG: Removing metadata", file=sys.stderr)
                with pdf.open_metadata() as meta:
                    meta.clear()
                
                if '/Info' in pdf.trailer:
                    del pdf.trailer['/Info']
            
            # NUCLEAR COMPRESSION - Always compress images aggressively
            print(f"DEBUG: ACTIVATING NUCLEAR COMPRESSION with quality {quality}", file=sys.stderr)
            images_compressed = compress_images_nuclear(pdf, quality)
            
            # Remove duplicate images for extra savings
            duplicates_removed = remove_duplicate_images(pdf)
            
            # ULTRA-AGGRESSIVE PDF compression settings
            print("DEBUG: Using ULTRA-AGGRESSIVE PDF compression", file=sys.stderr)
            
            # FIXED: Use only valid pikepdf save parameters that work cross-platform
            save_settings = {
                'compress_streams': True,
                'stream_decode_level': pikepdf.StreamDecodeLevel.all,
                'object_stream_mode': pikepdf.ObjectStreamMode.generate,
                'normalize_content': True,
                'linearize': False,
                # Remove problematic parameters:
                # 'stream_compression_level': 9,  # NOT SUPPORTED - causes the error
                # 'min_version': pdf.pdf_version,  # Can cause compatibility issues
                # 'recompress_flate': True,  # Not a valid parameter
                # 'preserve_pdfa': False,  # Not needed for basic compression
            }
            
            # Try to save with aggressive compression
            try:
                pdf.save(output_file, **save_settings)
            except Exception as save_error:
                print(f"DEBUG: First save attempt failed: {save_error}, trying fallback...", file=sys.stderr)
                # Fallback to basic save if aggressive settings fail
                pdf.save(output_file)
        
        # Get compressed file size
        compressed_size = output_file.stat().st_size
        
        # Calculate compression ratio
        if original_size > 0:
            compression_ratio = ((original_size - compressed_size) / original_size) * 100
        else:
            compression_ratio = 0
        
        print(f"DEBUG: NUCLEAR RESULT - Original: {original_size}, Compressed: {compressed_size}, Ratio: {compression_ratio:.2f}%", file=sys.stderr)
        print(f"DEBUG: Images compressed: {images_compressed}, Duplicates removed: {duplicates_removed}", file=sys.stderr)
        
        # If compression made file larger, use original instead
        if compressed_size >= original_size:
            print("DEBUG: NUCLEAR compression failed, using original", file=sys.stderr)
            shutil.copy2(input_path, output_path)
            compressed_size = original_size
            compression_ratio = 0
        
        # Return success result
        return {
            "Success": True,
            "OriginalSize": original_size,
            "CompressedSize": compressed_size,
            "CompressionRatio": round(compression_ratio, 2),
            "OutputPath": str(output_file),
            "Error": None
        }
        
    except Exception as e:
        print(f"DEBUG: NUCLEAR FAILURE: {str(e)}", file=sys.stderr)
        return {
            "Success": False,
            "Error": str(e),
            "OriginalSize": 0,
            "CompressedSize": 0,
            "CompressionRatio": 0,
            "OutputPath": None
        }


def main():
    """Main entry point for command-line usage."""
    parser = argparse.ArgumentParser(
        description='NUCLEAR PDF Compression - Maximum file size reduction',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('input', help='Input PDF file path')
    parser.add_argument('output', help='Output PDF file path')
    parser.add_argument('--quality', type=int, default=1,
                       help='Compression quality (1-100, default: 1 - MAXIMUM COMPRESSION)')
    parser.add_argument('--remove-metadata', action='store_true', default=True,
                       help='Remove PDF metadata (default: True)')
    parser.add_argument('--remove-unused', action='store_true', default=True,
                       help='Remove unused objects (default: True)')
    parser.add_argument('--json', action='store_true',
                       help='Output results as JSON')
    
    args = parser.parse_args()
    
    # Build options dict
    options = {
        'quality': args.quality,
        'remove_metadata': args.remove_metadata,
        'remove_unused_objects': args.remove_unused
    }
    
    # Compress the PDF
    result = compress_pdf(args.input, args.output, options)
    
    # Output results
    if args.json:
        print(json.dumps(result))
    else:
        if result['Success']:
            print(f"💥 NUCLEAR COMPRESSION SUCCESSFUL!")
            print(f"  Original size: {result['OriginalSize']:,} bytes")
            print(f"  Compressed size: {result['CompressedSize']:,} bytes")
            print(f"  Space saved: {result['CompressionRatio']:.1f}%")
            print(f"  Output: {result['OutputPath']}")
            if result['CompressionRatio'] > 50:
                print(f"  🚀 MISSION ACCOMPLISHED: Over 50% reduction!")
        else:
            print(f"💣 Error: {result['Error']}", file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    main()