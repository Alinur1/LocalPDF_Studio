using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Models.CropPdfModel;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfCropController : ControllerBase
    {
        private readonly ICropPdfInterface _cropPdfInterface;
        private readonly ILogger<PdfCropController> _logger;

        public PdfCropController(ICropPdfInterface cropPdfInterface, ILogger<PdfCropController> logger)
        {
            _cropPdfInterface = cropPdfInterface;
            _logger = logger;
        }

        [HttpPost("crop")]
        public async Task<IActionResult> CropPdf([FromBody] CropPdfRequest request)
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

                // Validate crop values
                if (request.Top < 0 || request.Bottom < 0 || request.Left < 0 || request.Right < 0)
                {
                    return BadRequest("Crop values cannot be negative.");
                }

                _logger.LogInformation($"Cropping PDF: {request.FilePath}");

                // Crop the PDF
                var pdfBytes = await _cropPdfInterface.CropPdfAsync(request);

                // Return the cropped PDF
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var outputFileName = $"{fileName}_cropped.pdf";

                return File(pdfBytes, "application/pdf", outputFileName);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "Access denied to file: {FilePath}", request.FilePath);
                return StatusCode(403, "Access denied to the specified file.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cropping PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"An error occurred while cropping the PDF: {ex.Message}");
            }
        }
    }
}
