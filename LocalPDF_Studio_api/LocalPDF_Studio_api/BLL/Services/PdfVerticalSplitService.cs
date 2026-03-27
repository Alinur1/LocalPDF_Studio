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
using LocalPDF_Studio_api.DAL.Models.VerticalSplitPdfModel;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using System.IO.Compression;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfVerticalSplitService : IPdfVerticalSplitInterface
    {
        public async Task<byte[]> SplitVerticalAsync(VerticalSplitRequest request)
        {
            return await Task.Run(() =>
            {
                // Clamp percentage to a safe range
                double percentage = Math.Clamp(request.SplitPercentage, 1.0, 99.0);

                using var sourceDoc = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Import);

                using var leftDoc = new PdfDocument();
                using var rightDoc = new PdfDocument();

                for (int i = 0; i < sourceDoc.PageCount; i++)
                {
                    var sourcePage = sourceDoc.Pages[i];

                    double pageWidth = sourcePage.Width.Point;
                    double pageHeight = sourcePage.Height.Point;
                    double splitX = pageWidth * (percentage / 100.0);

                    // ── LEFT half ──────────────────────────────────────────
                    var leftPage = leftDoc.AddPage();
                    leftPage.Width = new XUnit(splitX, XGraphicsUnit.Point);
                    leftPage.Height = new XUnit(pageHeight, XGraphicsUnit.Point);

                    using (var gfxLeft = XGraphics.FromPdfPage(leftPage))
                    {
                        var formLeft = XPdfForm.FromFile(request.FilePath);
                        formLeft.PageIndex = i;

                        // Draw the full source page onto the left half canvas.
                        // The form is rendered at its natural size; the left page's
                        // viewport naturally clips anything beyond splitX.
                        gfxLeft.DrawImage(formLeft,
                            new XRect(0, 0, pageWidth, pageHeight));
                    }

                    // ── RIGHT half ─────────────────────────────────────────
                    double rightWidth = pageWidth - splitX;

                    var rightPage = rightDoc.AddPage();
                    rightPage.Width = new XUnit(rightWidth, XGraphicsUnit.Point);
                    rightPage.Height = new XUnit(pageHeight, XGraphicsUnit.Point);

                    using (var gfxRight = XGraphics.FromPdfPage(rightPage))
                    {
                        var formRight = XPdfForm.FromFile(request.FilePath);
                        formRight.PageIndex = i;

                        // Shift the source page left by splitX so the right portion
                        // aligns with the origin of the new right-half page.
                        gfxRight.TranslateTransform(-splitX, 0);
                        gfxRight.DrawImage(formRight,
                            new XRect(0, 0, pageWidth, pageHeight));
                    }
                }

                // ── Package both PDFs into a ZIP ───────────────────────────
                string baseName = Path.GetFileNameWithoutExtension(request.FilePath);

                using var zipStream = new MemoryStream();
                using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
                {
                    AddPdfToZip(archive, leftDoc, $"{baseName}_left.pdf");
                    AddPdfToZip(archive, rightDoc, $"{baseName}_right.pdf");
                }

                return zipStream.ToArray();
            });
        }

        // ── Helper ────────────────────────────────────────────────────────
        private static void AddPdfToZip(ZipArchive archive, PdfDocument doc, string entryName)
        {
            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
            using var entryStream = entry.Open();
            using var ms = new MemoryStream();
            doc.Save(ms);
            ms.Position = 0;
            ms.CopyTo(entryStream);
        }
    }
}
