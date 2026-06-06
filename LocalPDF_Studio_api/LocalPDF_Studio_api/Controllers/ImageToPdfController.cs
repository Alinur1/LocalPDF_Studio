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
using LocalPDF_Studio_api.DAL.Models.imageToPdf;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ImageToPdfController : ControllerBase
    {
        private readonly IImageToPdfInterface _imageToPdfService;
        private readonly ILogger<ImageToPdfController> _logger;

        public ImageToPdfController(
            IImageToPdfInterface imageToPdfService,
            ILogger<ImageToPdfController> logger)
        {
            _imageToPdfService = imageToPdfService;
            _logger = logger;
        }

        [HttpPost("convert")]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> ConvertImagesToPdf()
        {
            try
            {
                // Parse form data
                var orientation = Request.Form["orientation"].ToString();
                var pageSize = Request.Form["pageSize"].ToString();
                var mergeAll = bool.Parse(Request.Form["mergeAll"].ToString());
                var quality = int.Parse(Request.Form["quality"].ToString());

                var imageFiles = Request.Form.Files.GetFiles("images");

                if (imageFiles == null || !imageFiles.Any())
                {
                    return BadRequest("No images provided.");
                }

                // Create request model
                var request = new ImageToPdfRequest
                {
                    Orientation = orientation,
                    PageSize = pageSize,
                    MergeAll = mergeAll,
                    Quality = quality,
                    Images = new List<ImageFileData>()
                };

                // Process each image file
                foreach (var file in imageFiles)
                {
                    using var memoryStream = new MemoryStream();
                    await file.CopyToAsync(memoryStream);

                    request.Images.Add(new ImageFileData
                    {
                        FileName = file.FileName,
                        Content = memoryStream.ToArray()
                    });
                }

                // Convert images to PDF
                var result = await _imageToPdfService.ConvertImagesToPdfAsync(request);

                if (mergeAll)
                {
                    // Return single PDF
                    return File(result, "application/pdf", "converted.pdf");
                }
                else
                {
                    // Return ZIP file with multiple PDFs
                    return File(result, "application/zip", "converted_images.zip");
                }
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Invalid request parameters");
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting images to PDF");
                return StatusCode(500, $"An error occurred: {ex.Message}");
            }
        }
    }
}
