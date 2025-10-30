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


using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.WatermarkModel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Org.BouncyCastle.Asn1.Ocsp;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfWatermarkController : ControllerBase
    {
        private readonly IWatermarkInterface _watermarkInterface;
        private readonly ILogger<PdfWatermarkController> _logger;
        private readonly string _tempImagePath;

        public PdfWatermarkController(IWatermarkInterface watermarkInterface, ILogger<PdfWatermarkController> logger)
        {
            _watermarkInterface = watermarkInterface;
            _logger = logger;
            _tempImagePath = Path.Combine(Path.GetTempPath(), "LocalPDF_Studio", "watermark_images");

            try
            {
                Directory.CreateDirectory(_tempImagePath);
                _logger.LogInformation($"Temp image directory created: {_tempImagePath}");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to create temp directory, using fallback");
                _tempImagePath = Path.GetTempPath();
            }
        }

        [HttpPost("add-text")]
        public async Task<IActionResult> AddTextWatermark([FromBody] WatermarkRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    return BadRequest("File path is required.");
                }
                if (!System.IO.File.Exists(request.FilePath))
                {
                    return NotFound($"File not found: {request.FilePath}");
                }
                if (request.Opacity < 1 || request.Opacity > 100)
                {
                    return BadRequest("Opacity must be between 1 and 100.");
                }
                if (request.FontSize < 8 || request.FontSize > 144)
                {
                    return BadRequest("Font size must be between 8 and 144.");
                }

                request.CustomPages ??= "";
                request.WatermarkType = "text";

                _logger.LogInformation($"Adding text watermark to PDF: {request.FilePath}");

                var pdfBytes = await _watermarkInterface.AddWatermarkAsync(request);
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var outputFileName = $"{fileName}_watermarked.pdf";

                return File(pdfBytes, "application/pdf", outputFileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding text watermark to PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"An error occurred while adding watermark: {ex.Message}");
            }
        }

        [HttpPost("add-image")]
        public async Task<IActionResult> AddImageWatermark([FromForm] WatermarkRequest request, [FromForm] IFormFile imageFile)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    return BadRequest("File path is required.");
                }
                if (!System.IO.File.Exists(request.FilePath))
                {
                    return NotFound($"File not found: {request.FilePath}");
                }
                if (request.Opacity < 1 || request.Opacity > 100)
                {
                    return BadRequest("Opacity must be between 1 and 100.");
                }

                request.CustomPages ??= "";
                request.WatermarkType = "image";

                if (imageFile == null || imageFile.Length == 0)
                {
                    return BadRequest("Image file is required for image watermarks.");
                }

                var allowedExtensions = new[] { ".png", ".jpg", ".jpeg", ".gif", ".bmp" };
                var fileExtension = Path.GetExtension(imageFile.FileName).ToLower();
                if (!allowedExtensions.Contains(fileExtension))
                {
                    return BadRequest("Invalid image format. Supported formats: PNG, JPG, JPEG, GIF, BMP");
                }

                if (imageFile.Length > 10 * 1024 * 1024)
                {
                    return BadRequest("Image file size must be less than 10MB.");
                }

                var tempImageName = $"{Guid.NewGuid()}{fileExtension}";
                var tempImagePath = Path.Combine(_tempImagePath, tempImageName);

                using (var stream = new FileStream(tempImagePath, FileMode.Create))
                {
                    await imageFile.CopyToAsync(stream);
                }

                request.ImagePath = tempImagePath;

                _logger.LogInformation($"Adding image watermark to PDF: {request.FilePath}");

                var pdfBytes = await _watermarkInterface.AddWatermarkAsync(request);
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var outputFileName = $"{fileName}_watermarked.pdf";

                try
                {
                    System.IO.File.Delete(request.ImagePath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete temp image file");
                }

                return File(pdfBytes, "application/pdf", outputFileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding image watermark to PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"An error occurred while adding watermark: {ex.Message}");
            }
        }
    }
}
