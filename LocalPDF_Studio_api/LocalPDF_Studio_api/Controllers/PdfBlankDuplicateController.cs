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
using LocalPDF_Studio_api.DAL.Models.PdfBlankDuplicate;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfBlankDuplicateController : ControllerBase
    {
        private readonly IPdfBlankDuplicateInterface _blankDuplicateService;
        private readonly ILogger<PdfBlankDuplicateController> _logger;

        public PdfBlankDuplicateController(
            IPdfBlankDuplicateInterface blankDuplicateService,
            ILogger<PdfBlankDuplicateController> logger)
        {
            _blankDuplicateService = blankDuplicateService;
            _logger = logger;
        }

        [HttpPost("scan")]
        [ProducesResponseType(typeof(PdfBlankDuplicateScanResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> Scan([FromBody] PdfBlankDuplicateScanRequest? request, CancellationToken cancellationToken)
        {
            try
            {
                if (request == null)
                    return BadRequest("Request body is required.");

                if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                    return BadRequest("Invalid file path.");

                var result = await _blankDuplicateService.ScanAsync(request, cancellationToken);

                if (!result.Success)
                {
                    return result.Code is "ENCRYPTED" or "EMPTY" or "PAGE_LIMIT" or "OPEN_FAILED"
                        ? BadRequest(new { error = result.Error, code = result.Code })
                        : StatusCode(StatusCodes.Status500InternalServerError,
                            new { error = result.Error ?? "Scan failed.", code = result.Code });
                }

                return Ok(result);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (TimeoutException ex)
            {
                _logger.LogWarning("Page analysis timed out: {Message}", ex.Message);
                return StatusCode(StatusCodes.Status504GatewayTimeout, new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error analyzing PDF pages");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "An error occurred while analyzing the PDF" });
            }
        }

        [HttpGet("health")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public IActionResult HealthCheck()
        {
            return Ok(new
            {
                service = "PDF Blank Duplicate Scanner",
                status = "healthy",
                timestamp = DateTime.UtcNow
            });
        }
    }
}
