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
using LocalPDF_Studio_api.DAL.Models.LockUnlockPdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfLockUnlockController : ControllerBase
    {
        private readonly ILockUnlockPdfInterface _lockUnlockService;
        private readonly ILogger<PdfLockUnlockController> _logger;

        public PdfLockUnlockController(ILockUnlockPdfInterface lockUnlockService, ILogger<PdfLockUnlockController> logger)
        {
            _lockUnlockService = lockUnlockService;
            _logger = logger;
        }

        [HttpPost("lock")]
        public async Task<IActionResult> LockPdf([FromBody] LockUnlockRequest request)
        {
            return await ProcessPdfRequest(request, "lock");
        }

        [HttpPost("unlock")]
        public async Task<IActionResult> UnlockPdf([FromBody] LockUnlockRequest request)
        {
            return await ProcessPdfRequest(request, "unlock");
        }

        private async Task<IActionResult> ProcessPdfRequest(LockUnlockRequest request, string operation)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                if (string.IsNullOrWhiteSpace(request.Operation) || request.Operation.ToLower() != operation)
                    return BadRequest($"Operation must be '{operation}' for this endpoint.");

                _logger.LogInformation("Processing {Operation} PDF: {FilePath}", operation, request.FilePath);

                var pdfBytes = await _lockUnlockService.ProcessPdfAsync(request);

                var outputName = Path.GetFileNameWithoutExtension(request.FilePath) +
                               (operation == "lock" ? "_locked.pdf" : "_unlocked.pdf");

                return File(pdfBytes, "application/pdf", outputName);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Authentication failed for {Operation} PDF: {FilePath}", operation, request.FilePath);
                return BadRequest(ex.Message);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning("Invalid argument for {Operation} PDF: {Message}", operation, ex.Message);
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing {Operation} PDF: {FilePath}", operation, request.FilePath);
                return StatusCode(500, $"Error {operation}ing PDF: {ex.Message}");
            }
        }
    }
}
