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
using LocalPDF_Studio_api.DAL.Models.PDFMarkdown;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMarkdownController : ControllerBase
    {
        private readonly IPdfMarkdownInterface _markdownService;
        private readonly ILogger<PdfMarkdownController> _logger;

        public PdfMarkdownController(
            IPdfMarkdownInterface markdownService,
            ILogger<PdfMarkdownController> logger)
        {
            _markdownService = markdownService;
            _logger = logger;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> Convert([FromBody] PdfMarkdownRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FilePath))
                return BadRequest(new { error = "File path is required." });

            if (string.IsNullOrWhiteSpace(request.OutputFolder))
                return BadRequest(new { error = "Output folder is required." });

            if (!System.IO.File.Exists(request.FilePath))
                return NotFound(new { error = $"File not found: {request.FilePath}" });

            if (!System.IO.Directory.Exists(request.OutputFolder))
                return BadRequest(new { error = $"Output folder does not exist: {request.OutputFolder}" });

            if (Path.GetExtension(request.FilePath).ToLowerInvariant() != ".pdf")
                return BadRequest(new { error = "File must be a PDF." });

            try
            {
                _logger.LogInformation("Markdown conversion requested: {FilePath}", request.FilePath);

                var result = await _markdownService.ConvertToMarkdownAsync(request);

                if (!result.Success)
                {
                    if (result.Error?.StartsWith("FOLDER_EXISTS:") == true)
                    {
                        var folderPath = result.Error["FOLDER_EXISTS:".Length..];
                        return BadRequest(new
                        {
                            folderExists = true,
                            folderPath = folderPath,
                            error = $"A folder named \"{Path.GetFileName(folderPath)}\" already exists at that location. Please back it up, delete it, and try again.",
                        });
                    }

                    if (result.MissingDependencies?.Count > 0)
                        return UnprocessableEntity(new
                        {
                            error = result.Error,
                            missingDependencies = result.MissingDependencies,
                        });

                    return StatusCode(500, new { error = result.Error });
                }

                return Ok(new
                {
                    success = true,
                    outputMdPath = result.OutputMdPath,
                    outputFolder = result.OutputFolder,
                    pageCount = result.Meta?.PageCount ?? 0,
                    assetCount = result.Meta?.AssetCount ?? 0,
                    engine = result.Engine,
                    missingDependencies = result.MissingDependencies,
                });
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "File not found");
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error during markdown conversion: {FilePath}", request.FilePath);
                return StatusCode(500, new
                {
                    error = "An error occurred while converting the PDF.",
                    details = ex.Message,
                });
            }
        }
    }
}
