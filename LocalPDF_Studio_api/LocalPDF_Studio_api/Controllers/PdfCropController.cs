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


using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.CropPdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfCropController : ControllerBase
    {
        private readonly ICropPdfInterface _cropPdfService;
        private readonly ILogger<PdfCropController> _logger;

        public PdfCropController(ICropPdfInterface cropPdfService, ILogger<PdfCropController> logger)
        {
            _cropPdfService = cropPdfService;
            _logger = logger;
        }

        [HttpPost("crop")]
        public async Task<IActionResult> CropPdf([FromBody] CropPdfRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                _logger.LogInformation("Cropping PDF: {FilePath}", request.FilePath);

                var pdfBytes = await _cropPdfService.CropPdfAsync(request);
                var outputName = Path.GetFileNameWithoutExtension(request.FilePath) + "_cropped.pdf";

                return File(pdfBytes, "application/pdf", outputName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cropping PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"Error cropping PDF: {ex.Message}");
            }
        }
    }
}
