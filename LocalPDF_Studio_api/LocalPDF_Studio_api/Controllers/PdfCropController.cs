using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.CropPdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfCropController : ControllerBase
    {
        private readonly ICropPdfInterface _cropPdfService;
        private readonly ILogger<PdfCropController> _logger;

        public PdfCropController(ICropPdfInterface cropPdfService, ILogger<PdfCropController> logger)
        {
            _cropPdfService = cropPdfService;
            _logger = logger;
        }

        [HttpPost("crop")]
        public async Task<IActionResult> CropPdf([FromBody] CropPdfRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                _logger.LogInformation("Cropping PDF: {FilePath}", request.FilePath);

                var pdfBytes = await _cropPdfService.CropPdfAsync(request);
                var outputName = Path.GetFileNameWithoutExtension(request.FilePath) + "_cropped.pdf";

                return File(pdfBytes, "application/pdf", outputName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cropping PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"Error cropping PDF: {ex.Message}");
            }
        }
    }
}
