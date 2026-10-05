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
using LocalPDF_Studio_api.DAL.Models.PdfToExcel;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfToExcelController : ControllerBase
    {
        private readonly IPdfToExcelInterface _toExcelService;
        private readonly ILogger<PdfToExcelController> _logger;

        public PdfToExcelController(
            IPdfToExcelInterface toExcelService,
            ILogger<PdfToExcelController> logger)
        {
            _toExcelService = toExcelService;
            _logger = logger;
        }

        [HttpPost("convert")]
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> Convert([FromBody] PdfToExcelRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest("Request body is required.");

                if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                    return BadRequest("Invalid file path.");

                var outcome = await _toExcelService.ConvertAsync(request);

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                if (outcome.OutputKind == "csv")
                    return File(outcome.FileBytes, "text/csv", $"{fileName}_tables.csv");
                if (outcome.OutputKind == "zip")
                    return File(outcome.FileBytes, "application/zip", $"{fileName}_tables_csv.zip");
                return File(outcome.FileBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{fileName}_tables.xlsx");
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("ENCRYPTED"))
                    return BadRequest(new { error = ex.Message });
                if (ex.Message.Contains("No extractable tables") || ex.Message.Contains("No valid pages"))
                    return BadRequest(new { error = ex.Message });
                _logger.LogError(ex, "Error converting PDF tables to Excel");
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "An error occurred while converting the PDF", details = ex.Message });
            }
        }

        [HttpGet("health")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        public IActionResult HealthCheck()
        {
            return Ok(new
            {
                service = "PDF to Excel",
                status = "healthy",
                timestamp = DateTime.UtcNow
            });
        }
    }
}
