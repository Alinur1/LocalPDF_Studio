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
using LocalPDF_Studio_api.DAL.Models.RemovePdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfRemoveController : ControllerBase
    {
        private readonly IPdfRemoveInterface _removeService;

        public PdfRemoveController(IPdfRemoveInterface removeService)
        {
            _removeService = removeService;
        }

        [HttpPost("remove")]
        public async Task<IActionResult> RemovePages([FromBody] RemoveRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.FilePath))
                return BadRequest("Invalid request. File path is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return BadRequest($"File not found: {request.FilePath}");

            if (request.Options == null)
                return BadRequest("Remove options are required.");

            // Validate that at least one removal method is specified
            bool hasRemovalCriteria =
                (request.Options.Pages != null && request.Options.Pages.Any()) ||
                (request.Options.PageRanges != null && request.Options.PageRanges.Any()) ||
                request.Options.RemoveEvenPages ||
                request.Options.RemoveOddPages ||
                request.Options.RemoveEveryNthPage.HasValue;

            if (!hasRemovalCriteria)
                return BadRequest("At least one removal criteria must be specified.");

            try
            {
                var resultBytes = await _removeService.RemovePagesAsync(
                    request.FilePath,
                    request.Options
                );

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{fileName}_removed_pages.pdf";

                return File(resultBytes, "application/pdf", downloadName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error removing pages from PDF: {ex.Message}");
            }
        }
    }
}
