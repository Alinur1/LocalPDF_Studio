using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.BLL.Services;
using tooldeck_api.DAL.Models.PdfToJpgModel;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfToJpgController : ControllerBase
    {
        private readonly IPdfToJpgInterface _pdfToJpgInterface;
        private readonly ILogger<PdfToJpgController> _logger;

        public PdfToJpgController(IPdfToJpgInterface pdfToJpgInterface, ILogger<PdfToJpgController> logger)
        {
            _pdfToJpgInterface = pdfToJpgInterface;
            _logger = logger;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> ConvertToJpg([FromBody] PdfToJpgRequest request)
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
                var zipBytes = await _pdfToJpgInterface.ConvertPdfToImagesAsync(request);

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
