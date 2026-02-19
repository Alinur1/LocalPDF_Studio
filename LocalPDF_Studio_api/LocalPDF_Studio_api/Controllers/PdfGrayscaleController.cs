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
using LocalPDF_Studio_api.DAL.Models.PDFGrayscale;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfGrayscaleController : ControllerBase
    {
        private readonly IPdfGrayscaleInterface _grayscaleInterface;
        private readonly ILogger<PdfGrayscaleController> _logger;

        public PdfGrayscaleController(
            IPdfGrayscaleInterface grayscaleInterface,
            ILogger<PdfGrayscaleController> logger)
        {
            _grayscaleInterface = grayscaleInterface;
            _logger = logger;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> ConvertToGrayscale([FromBody] GrayscaleRequest request)
        {
            try
            {
                // Validate request
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    return BadRequest(new { error = "File path is required." });
                }

                if (!System.IO.File.Exists(request.FilePath))
                {
                    return NotFound(new { error = $"File not found: {request.FilePath}" });
                }

                // Validate file extension
                var extension = Path.GetExtension(request.FilePath).ToLower();
                if (extension != ".pdf")
                {
                    return BadRequest(new { error = "File must be a PDF." });
                }

                // Check file size (optional - warn if very large)
                var fileInfo = new FileInfo(request.FilePath);
                if (fileInfo.Length > 100 * 1024 * 1024) // 100MB
                {
                    _logger.LogWarning($"Large PDF file detected: {fileInfo.Length / 1024 / 1024}MB");
                }

                _logger.LogInformation($"Starting grayscale conversion for: {request.FilePath}");

                // Perform conversion
                var pdfBytes = await _grayscaleInterface.ConvertToGrayscaleAsync(request);

                // Generate output filename
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var outputFileName = $"{fileName}_grayscale.pdf";

                _logger.LogInformation($"Grayscale conversion completed for: {request.FilePath}");

                return File(pdfBytes, "application/pdf", outputFileName);
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "File not found during grayscale conversion");
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to grayscale: {FilePath}", request.FilePath);
                return StatusCode(500, new
                {
                    error = "An error occurred while converting PDF to grayscale.",
                    details = ex.Message
                });
            }
        }

        [HttpPost("convert-with-options")]
        public async Task<IActionResult> ConvertWithOptions([FromBody] GrayscaleRequest request)
        {
            // Extended endpoint with all options
            return await ConvertToGrayscale(request);
        }

        [HttpGet("check-file/{fileName}")]
        public IActionResult CheckFile(string fileName)
        {
            // Helper endpoint to check if a file exists (useful for frontend)
            var path = Path.Combine(Path.GetTempPath(), fileName);
            return Ok(new { exists = System.IO.File.Exists(path) });
        }
    }
}
