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


using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.EditMetadataModel;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMetadataController : ControllerBase
    {
        private readonly IEditMetadataInterface _metadataService;
        private readonly ILogger<PdfMetadataController> _logger;

        public PdfMetadataController(IEditMetadataInterface metadataService, ILogger<PdfMetadataController> logger)
        {
            _metadataService = metadataService;
            _logger = logger;
        }

        [HttpPost("metadata")]
        public async Task<IActionResult> ProcessMetadata([FromBody] MetadataRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                if (string.IsNullOrWhiteSpace(request.Operation))
                    return BadRequest("Operation is required (read or write).");

                _logger.LogInformation("Processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);

                var result = await _metadataService.ProcessMetadataAsync(request);

                if (!result.Success)
                {
                    return BadRequest(result.Message);
                }

                if (request.Operation.ToLower() == "write")
                {
                    if (result.PdfBytes == null)
                    {
                        return StatusCode(500, "An error occurred while generating the PDF.");
                    }

                    var outputName = Path.GetFileNameWithoutExtension(request.FilePath) + "_updated.pdf";
                    return File(result.PdfBytes, "application/pdf", outputName);
                }

                // For read operations, return the metadata
                return Ok(new { metadata = result.Metadata });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);
                return StatusCode(500, $"Error processing metadata: {ex.Message}");
            }
        }
    }
}