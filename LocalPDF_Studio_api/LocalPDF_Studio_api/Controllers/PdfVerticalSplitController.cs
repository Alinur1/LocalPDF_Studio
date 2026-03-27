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
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfVerticalSplitController : ControllerBase
    {
        private readonly IPdfVerticalSplitInterface _service;
        private readonly ILogger<PdfVerticalSplitController> _logger;

        public PdfVerticalSplitController(
            IPdfVerticalSplitInterface service,
            ILogger<PdfVerticalSplitController> logger)
        {
            _service = service;
            _logger = logger;
        }

        [HttpPost("split")]
        public async Task<IActionResult> SplitVertical([FromBody] VerticalSplitRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                return BadRequest("Invalid or missing file path.");

            if (request.SplitPercentage is < 1 or > 99)
                return BadRequest("SplitPercentage must be between 1 and 99.");

            try
            {
                var zipBytes = await _service.SplitVerticalAsync(request);

                string baseName = Path.GetFileNameWithoutExtension(request.FilePath);
                return File(zipBytes, "application/zip", $"{baseName}_vertical_split.zip");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during vertical PDF split.");
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
    }
}
