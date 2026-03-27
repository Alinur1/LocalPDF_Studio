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
using LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfToPdfaController : ControllerBase
    {
        private readonly IPdfToPdfaInterface _pdfToPdfaService;

        public PdfToPdfaController(IPdfToPdfaInterface pdfToPdfaService)
        {
            _pdfToPdfaService = pdfToPdfaService;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> ConvertToPdfa([FromBody] PdfaRequest request)
        {
            Console.WriteLine($"=== PDF/A CONVERT DEBUG START ===");
            Console.WriteLine($"Request null? {request == null}");
            Console.WriteLine($"FilePath: {request?.FilePath}");
            Console.WriteLine($"Options null? {request?.Options == null}");

            if (request?.Options != null)
            {
                Console.WriteLine($"ConformanceLevel: {request.Options.ConformanceLevel}");
                Console.WriteLine($"EmbedAllFonts: {request.Options.EmbedAllFonts}");
                Console.WriteLine($"SubsetFonts: {request.Options.SubsetFonts}");
            }

            // Validate request
            if (request == null || string.IsNullOrEmpty(request.FilePath))
            {
                Console.WriteLine("FAILED: Invalid request");
                return BadRequest("Invalid request. File path is required.");
            }

            if (!System.IO.File.Exists(request.FilePath))
            {
                Console.WriteLine($"FAILED: File not found at {request.FilePath}");
                return BadRequest($"File not found: {request.FilePath}");
            }

            if (request.Options == null)
            {
                Console.WriteLine("FAILED: Options are null");
                return BadRequest("PDF/A conversion options are required.");
            }

            var validLevels = new[] { "pdfa1b", "pdfa1a", "pdfa2b", "pdfa2a", "pdfa3b" };
            if (!validLevels.Contains(request.Options.ConformanceLevel?.ToLower()))
            {
                return BadRequest($"Invalid conformance level: {request.Options.ConformanceLevel}. " +
                                  "Valid values are: pdfa1b, pdfa1a, pdfa2b, pdfa2a, pdfa3b");
            }

            Console.WriteLine("All validations passed, calling service...");

            try
            {
                var result = await _pdfToPdfaService.ConvertToPdfaAsync(
                    request.FilePath,
                    request.Options
                );

                if (!result.Success)
                {
                    return BadRequest(result.Error ?? "PDF/A conversion failed.");
                }

                var baseName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{baseName}_pdfa.pdf";

                return File(result.ConvertedData!, "application/pdf", downloadName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== PDF/A ERROR: {ex.Message} ===");
                return StatusCode(500, $"Error converting PDF to PDF/A: {ex.Message}");
            }
        }
    }
}
