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
using LocalPDF_Studio_api.DAL.Enums;
using LocalPDF_Studio_api.DAL.Models.SplitPdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfSplitController : ControllerBase
    {
        private readonly IPdfSplitInterface _splitService;

        public PdfSplitController(IPdfSplitInterface splitService)
        {
            _splitService = splitService;
        }

        [HttpPost("split")]
        public async Task<IActionResult> Split([FromBody] SplitRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.FilePath))
                return BadRequest("Invalid request. File path is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return BadRequest($"File not found: {request.FilePath}");

            try
            {
                var resultBytes = await _splitService.SplitPdfAsync(
                    request.FilePath,
                    request.Method,
                    request.Options
                );

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{fileName}_split.zip";
                return File(resultBytes, "application/zip", downloadName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error splitting PDF: {ex.Message}");
            }
        }
    }
}
