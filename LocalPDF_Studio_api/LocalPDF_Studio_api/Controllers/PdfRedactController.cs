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
using LocalPDF_Studio_api.DAL.Models.RedactPdf;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfRedactController : ControllerBase
    {
        private readonly IRedactInterface _redactService;
        private readonly ILogger<PdfRedactController> _logger;

        public PdfRedactController(
            IRedactInterface redactService,
            ILogger<PdfRedactController> logger)
        {
            _redactService = redactService;
            _logger = logger;
        }

        [HttpPost("redact")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> RedactPdf([FromBody] RedactRequest request)
        {
            try
            {
                _logger.LogInformation("Redact PDF request received");

                // Validate request
                if (request == null)
                    return BadRequest("Request body is required");

                if (string.IsNullOrWhiteSpace(request.File))
                    return BadRequest("File path is required");

                if (request.Redactions == null || request.Redactions.Count == 0)
                    return BadRequest("At least one redaction area is required");

                // Process redaction
                var redactedPdf = await _redactService.RedactPdfAsync(request);

                // Return redacted PDF
                var fileName = $"redacted_{Path.GetFileNameWithoutExtension(request.File)}_{DateTime.Now:yyyyMMddHHmmss}.pdf";

                _logger.LogInformation($"Redaction completed successfully: {fileName}");

                return File(
                    redactedPdf,
                    "application/pdf",
                    fileName
                );
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "File not found: {Message}", ex.Message);
                return NotFound(new { error = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Invalid request: {Message}", ex.Message);
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error redacting PDF");
                return StatusCode(
                    StatusCodes.Status500InternalServerError,
                    new { error = "An error occurred while redacting the PDF", details = ex.Message }
                );
            }
        }

        [HttpGet("health")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public IActionResult HealthCheck()
        {
            return Ok(new
            {
                service = "PDF Redaction",
                status = "healthy",
                timestamp = DateTime.UtcNow
            });
        }
    }
}
