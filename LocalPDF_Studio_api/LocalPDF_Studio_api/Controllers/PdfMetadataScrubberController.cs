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
using LocalPDF_Studio_api.DAL.Models.MetadataScrubber;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMetadataScrubberController : ControllerBase
    {
        private readonly IMetadataScrubberInterface _metadataScrubberService;
        private readonly ILogger<PdfMetadataScrubberController> _logger;

        public PdfMetadataScrubberController(
            IMetadataScrubberInterface metadataScrubberService,
            ILogger<PdfMetadataScrubberController> logger)
        {
            _metadataScrubberService = metadataScrubberService;
            _logger = logger;
        }

        [HttpPost("scan")]
        [ProducesResponseType(typeof(MetadataScrubberScanResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> Scan([FromBody] MetadataScrubberScanRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest("Request body is required.");

                if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                    return BadRequest("Invalid file path.");

                var result = await _metadataScrubberService.ScanAsync(request);

                if (!result.Success)
                    return StatusCode(StatusCodes.Status500InternalServerError, new { error = result.Error ?? "Scan failed." });

                return Ok(result);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning PDF for hidden data");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "An error occurred while scanning the PDF", details = ex.Message });
            }
        }

        [HttpPost("scrub")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> Scrub([FromBody] MetadataScrubberScrubRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest("Request body is required.");

                if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                    return BadRequest("Invalid file path.");

                if (request.Categories == null || request.Categories.Count == 0)
                    return BadRequest("At least one category is required.");

                var outcome = await _metadataScrubberService.ScrubAsync(request);

                // Per-category removal counts ride along in a header so the UI can
                // show a real diff summary ("Removed 197 annotations") with the file.
                var summaryJson = JsonSerializer.Serialize(new { removed = outcome.Removed, notes = outcome.Notes });
                Response.Headers["X-MetadataScrub-Result"] = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(summaryJson));

                var fileName = $"{Path.GetFileNameWithoutExtension(request.FilePath)}_deepclean.pdf";
                return File(outcome.PdfBytes, "application/pdf", fileName);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("ENCRYPTED"))
                    return BadRequest(new { error = ex.Message });
                _logger.LogError(ex, "Error scrubbing PDF");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "An error occurred while scrubbing the PDF", details = ex.Message });
            }
        }

        [HttpGet("health")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public IActionResult HealthCheck()
        {
            return Ok(new
            {
                service = "PDF Metadata Scrubber",
                status = "healthy",
                timestamp = DateTime.UtcNow
            });
        }
    }
}
