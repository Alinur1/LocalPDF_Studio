using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.BLL.Services;
using LocalPDF_Studio_api.DAL.Models.PdfToImageModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfToImageController : ControllerBase
    {
        private readonly IPdfToImageInterface _pdfToImageInterface;
        private readonly ILogger<PdfToImageController> _logger;

        public PdfToImageController(IPdfToImageInterface pdfToImageInterface, ILogger<PdfToImageController> logger)
        {
            _pdfToImageInterface = pdfToImageInterface;
            _logger = logger;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> ConvertToJpg([FromBody] PdfToImageRequest request)
        {
            try
            {
                // Validate request
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    return BadRequest("File path is required.");
                }

                if (!System.IO.File.Exists(request.FilePath))
                {
                    return NotFound($"File not found: {request.FilePath}");
                }

                // Validate DPI
                if (request.Dpi <= 0 || request.Dpi > 600)
                {
                    return BadRequest("DPI must be between 1 and 600.");
                }

                // Validate format
                var validFormats = new[] { "jpg", "jpeg", "png" };
                if (!validFormats.Contains(request.Format.ToLower()))
                {
                    return BadRequest("Format must be 'jpg' or 'png'.");
                }

                _logger.LogInformation($"Converting PDF to {request.Format.ToUpper()}: {request.FilePath}");

                // Convert PDF to images and get ZIP file
                var zipBytes = await _pdfToImageInterface.ConvertPdfToImagesAsync(request);

                // Return ZIP file
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var zipFileName = $"{fileName}_images.zip";

                return File(zipBytes, "application/zip", zipFileName);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "Access denied to file: {FilePath}", request.FilePath);
                return StatusCode(403, "Access denied to the specified file.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to images: {FilePath}", request.FilePath);
                return StatusCode(500, $"An error occurred while converting the PDF: {ex.Message}");
            }
        }
    }
}
