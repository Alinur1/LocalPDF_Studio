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
using LocalPDF_Studio_api.DAL.Models.OrganizePdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfOrganizeController : ControllerBase
    {
        private readonly IPdfOrganizeInterface _organizeService;

        public PdfOrganizeController(IPdfOrganizeInterface organizeService)
        {
            _organizeService = organizeService;
        }

        [HttpPost("organize")]
        public async Task<IActionResult> OrganizePages([FromBody] OrganizeRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.FilePath))
                return BadRequest("Invalid request. File path is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return BadRequest($"File not found: {request.FilePath}");

            if (request.Options == null)
                return BadRequest("Organize options are required.");

            if (request.Options.PageOrder == null || !request.Options.PageOrder.Any())
                return BadRequest("Page order is required.");

            try
            {
                var resultBytes = await _organizeService.OrganizePdfAsync(
                    request.FilePath,
                    request.Options
                );

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{fileName}_organized.pdf";

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
                return StatusCode(500, $"Error organizing PDF: {ex.Message}");
            }
        }
    }
}
