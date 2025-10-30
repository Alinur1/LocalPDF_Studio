/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.CropPdfModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class CropPdfService : ICropPdfInterface
    {
        private readonly ILogger<CropPdfService> _logger;

        public CropPdfService(ILogger<CropPdfService> logger)
        {
            _logger = logger;
        }

        public async Task<byte[]> CropPdfAsync(CropPdfRequest request)
        {
            return await Task.Run(() => CropPdfSync(request));
        }

        private byte[] CropPdfSync(CropPdfRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting PDF crop operation: {request.FilePath}");

                using var inputDocument = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Import);
                using var outputDocument = new PdfDocument();

                var pagesToCrop = ParsePageRange(request);

                int croppedCount = 0;
                int totalPages = inputDocument.Pages.Count;

                for (int i = 0; i < totalPages; i++)
                {
                    var inputPage = inputDocument.Pages[i];
                    var outputPage = outputDocument.AddPage(inputPage);

                    // Determine if this page should be cropped
                    bool shouldCrop = request.PagesRange == "all" || pagesToCrop.Contains(i + 1);

                    if (shouldCrop)
                    {
                        var mediaBox = outputPage.MediaBox;

                        double cropX1 = mediaBox.X1 + request.Margins.Left;
                        double cropY1 = mediaBox.Y1 + request.Margins.Bottom;
                        double cropX2 = mediaBox.X2 - request.Margins.Right;
                        double cropY2 = mediaBox.Y2 - request.Margins.Top;

                        if (cropX2 > cropX1 && cropY2 > cropY1)
                        {
                            outputPage.CropBox = new PdfRectangle(
                                new XPoint(cropX1, cropY1),
                                new XPoint(cropX2, cropY2)
                            );
                            croppedCount++;
                        }
                        else
                        {
                            _logger.LogWarning($"Page {i + 1}: Invalid crop dimensions. Skipped.");
                        }
                    }
                }

                using var memoryStream = new MemoryStream();
                outputDocument.Save(memoryStream, false);

                _logger.LogInformation($"Crop completed. Total pages: {totalPages}, Cropped: {croppedCount}");
                return memoryStream.ToArray();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cropping PDF file: {FilePath}", request.FilePath);
                throw;
            }
        }

        private static HashSet<int> ParsePageRange(CropPdfRequest request)
        {
            var pages = new HashSet<int>();

            if (request.PagesRange == "all")
                return pages; // Empty set = all pages

            if (string.IsNullOrWhiteSpace(request.CustomPages))
                return pages;

            var parts = request.CustomPages.Split(',', StringSplitOptions.RemoveEmptyEntries);

            foreach (var part in parts)
            {
                var trimmed = part.Trim();
                if (trimmed.Contains('-'))
                {
                    var rangeParts = trimmed.Split('-', StringSplitOptions.RemoveEmptyEntries);
                    if (rangeParts.Length == 2 &&
                        int.TryParse(rangeParts[0], out int start) &&
                        int.TryParse(rangeParts[1], out int end))
                    {
                        if (start > end)
                            (start, end) = (end, start);

                        for (int p = start; p <= end; p++)
                            pages.Add(p);
                    }
                }
                else if (int.TryParse(trimmed, out int page))
                {
                    pages.Add(page);
                }
            }

            return pages;
        }
    }
}
