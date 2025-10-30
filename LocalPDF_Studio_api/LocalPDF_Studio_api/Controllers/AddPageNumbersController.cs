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
using LocalPDF_Studio_api.DAL.Models.AddPageNumbers;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AddPageNumbersController : ControllerBase
    {
        private readonly IAddPageNumbersInterface _service;
        private readonly ILogger<AddPageNumbersController> _logger;

        public AddPageNumbersController(IAddPageNumbersInterface service, ILogger<AddPageNumbersController> logger)
        {
            _service = service;
            _logger = logger;
        }

        [HttpPost("add")]
        public async Task<IActionResult> AddPageNumbers([FromBody] AddPageNumbersRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                if (request.FontSize < 8 || request.FontSize > 72)
                    return BadRequest("Font size must be between 8 and 72.");

                _logger.LogInformation($"Adding page numbers to: {request.FilePath}");

                var result = await _service.AddPageNumbersAsync(request);
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath) + "_numbered.pdf";

                return File(result, "application/pdf", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding page numbers");
                return StatusCode(500, $"Error: {ex.Message}");
            }
        }
    }
}
