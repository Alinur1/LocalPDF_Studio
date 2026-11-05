/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/

using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.imageToPdf;
using PdfSharp.Pdf;
using PdfSharp.Drawing;
using System.IO.Compression;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class ImageToPdfService : IImageToPdfInterface
    {
        private readonly ILogger<ImageToPdfService> _logger;

        // PDF points per inch
        private const double PointsPerInch = 72.0;

        // A4 dimensions in points (72 points per inch)
        private const double A4WidthPoints = 595.276;  // 210mm
        private const double A4HeightPoints = 841.89;  // 297mm

        // US Letter dimensions in points
        private const double LetterWidthPoints = 612;   // 8.5 inches
        private const double LetterHeightPoints = 792;  // 11 inches

        public ImageToPdfService(ILogger<ImageToPdfService> logger)
        {
            _logger = logger;
        }

        public Task<byte[]> ConvertImagesToPdfAsync(ImageToPdfRequest request)
        {
            ValidateRequest(request);

            if (request.MergeAll)
            {
                return Task.FromResult(ConvertToSinglePdf(request));
            }
            else
            {
                return Task.FromResult(ConvertToMultiplePdfs(request));
            }
        }

        private void ValidateRequest(ImageToPdfRequest request)
        {
            if (request == null)
                throw new ArgumentNullException(nameof(request));

            if (request.Images == null || !request.Images.Any())
                throw new ArgumentException("At least one image is required.");

            if (string.IsNullOrWhiteSpace(request.Orientation))
                throw new ArgumentException("Orientation is required.");

            if (string.IsNullOrWhiteSpace(request.PageSize))
                throw new ArgumentException("Page size is required.");

            // Validate image formats
            foreach (var image in request.Images)
            {
                if (image.Content == null || image.Content.Length == 0)
                    throw new ArgumentException($"Image {image.FileName} has no content.");

                var extension = Path.GetExtension(image.FileName).ToLowerInvariant();
                if (!IsValidImageExtension(extension))
                    throw new ArgumentException($"Unsupported image format: {extension}");

                // The extension alone is not trustworthy, so also verify the file signature
                // (JPEG, PNG or BMP) before handing the bytes to the PDFsharp importer.
                if (!HasSupportedImageSignature(image.Content))
                    throw new ArgumentException($"Unsupported or corrupt image file: {image.FileName}");
            }
        }

        private bool IsValidImageExtension(string extension)
        {
            var validExtensions = new[] { ".jpg", ".jpeg", ".png", ".bmp" };
            return validExtensions.Contains(extension);
        }

        private bool HasSupportedImageSignature(byte[] content)
        {
            if (content.Length < 4)
                return false;

            // JPEG: FF D8 FF
            if (content[0] == 0xFF && content[1] == 0xD8 && content[2] == 0xFF)
                return true;

            // PNG: 89 50 4E 47
            if (content[0] == 0x89 && content[1] == 0x50 && content[2] == 0x4E && content[3] == 0x47)
                return true;

            // BMP: 42 4D ("BM")
            if (content[0] == 0x42 && content[1] == 0x4D)
                return true;

            return false;
        }

        private byte[] ConvertToSinglePdf(ImageToPdfRequest request)
        {
            var document = new PdfDocument();

            foreach (var imageData in request.Images)
            {
                try
                {
                    AddImageToPdf(document, imageData, request);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, $"Failed to process image {imageData.FileName}");
                    throw new InvalidOperationException($"Failed to process image {imageData.FileName}: {ex.Message}");
                }
            }

            using var memoryStream = new MemoryStream();
            document.Save(memoryStream, false);
            return memoryStream.ToArray();
        }

        private byte[] ConvertToMultiplePdfs(ImageToPdfRequest request)
        {
            using var zipStream = new MemoryStream();
            using var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true);

            foreach (var imageData in request.Images)
            {
                try
                {
                    var pdfBytes = CreateSingleImagePdf(imageData, request);

                    var pdfFileName = Path.GetFileNameWithoutExtension(imageData.FileName) + ".pdf";
                    var entry = archive.CreateEntry(pdfFileName);

                    using var entryStream = entry.Open();
                    entryStream.Write(pdfBytes, 0, pdfBytes.Length);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, $"Failed to convert image {imageData.FileName}");
                    throw new InvalidOperationException($"Failed to convert image {imageData.FileName}: {ex.Message}");
                }
            }

            archive.Dispose();
            return zipStream.ToArray();
        }

        private byte[] CreateSingleImagePdf(ImageFileData imageData, ImageToPdfRequest request)
        {
            var document = new PdfDocument();
            AddImageToPdf(document, imageData, request);

            using var memoryStream = new MemoryStream();
            document.Save(memoryStream, false);
            return memoryStream.ToArray();
        }

        private void AddImageToPdf(PdfDocument document, ImageFileData imageData, ImageToPdfRequest request)
        {
            // Load the image with PDFsharp's built-in image importers (JPEG, PNG, BMP).
            // The image data is embedded as-is: JPEG via DCTDecode without recompression,
            // PNG/BMP losslessly via FlateDecode (PNG transparency is preserved).
            using var imageStream = new MemoryStream(imageData.Content);
            using var xImage = XImage.FromStream(imageStream);

            // Get image dimensions
            var imageWidth = xImage.PixelWidth;
            var imageHeight = xImage.PixelHeight;

            // Calculate page size
            var (pageWidth, pageHeight) = GetPageSize(request.PageSize, request.Orientation, imageWidth, imageHeight);

            // Create a new page
            var page = document.AddPage();
            page.Width = XUnit.FromPoint(pageWidth);
            page.Height = XUnit.FromPoint(pageHeight);

            // Calculate image position and size to fit within page while maintaining aspect ratio
            var (drawWidth, drawHeight, x, y) = CalculateImageBounds(
                imageWidth, imageHeight, pageWidth, pageHeight);

            // Draw the image on the page
            using var gfx = XGraphics.FromPdfPage(page);
            gfx.DrawImage(xImage, x, y, drawWidth, drawHeight);
        }

        private (double width, double height) GetPageSize(string pageSizeOption, string orientation, int imageWidth, int imageHeight)
        {
            double width, height;

            switch (pageSizeOption.ToLowerInvariant())
            {
                case "fit":
                    // Convert image pixels to points (assuming 96 DPI)
                    width = (imageWidth / 96.0) * PointsPerInch;
                    height = (imageHeight / 96.0) * PointsPerInch;

                    if (orientation.ToLowerInvariant() == "landscape")
                    {
                        // Swap dimensions for landscape
                        if (height > width)
                        {
                            (width, height) = (height, width);
                        }
                    }
                    else // portrait
                    {
                        // Ensure portrait orientation
                        if (width > height)
                        {
                            (width, height) = (height, width);
                        }
                    }
                    break;

                case "a4":
                    if (orientation.ToLowerInvariant() == "landscape")
                    {
                        width = A4HeightPoints;
                        height = A4WidthPoints;
                    }
                    else
                    {
                        width = A4WidthPoints;
                        height = A4HeightPoints;
                    }
                    break;

                case "letter":
                    if (orientation.ToLowerInvariant() == "landscape")
                    {
                        width = LetterHeightPoints;
                        height = LetterWidthPoints;
                    }
                    else
                    {
                        width = LetterWidthPoints;
                        height = LetterHeightPoints;
                    }
                    break;

                default:
                    throw new ArgumentException($"Unsupported page size: {pageSizeOption}");
            }

            return (width, height);
        }

        private (double drawWidth, double drawHeight, double x, double y) CalculateImageBounds(
            int imageWidth, int imageHeight, double pageWidth, double pageHeight)
        {
            // Calculate scale factor to fit image within page while maintaining aspect ratio
            var scaleWidth = pageWidth / imageWidth;
            var scaleHeight = pageHeight / imageHeight;
            var scale = Math.Min(scaleWidth, scaleHeight);

            var drawWidth = imageWidth * scale;
            var drawHeight = imageHeight * scale;

            // Center the image on the page
            var x = (pageWidth - drawWidth) / 2;
            var y = (pageHeight - drawHeight) / 2;

            return (drawWidth, drawHeight, x, y);
        }
    }
}
