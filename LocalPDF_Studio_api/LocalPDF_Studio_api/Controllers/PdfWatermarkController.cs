using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.WatermarkModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfWatermarkController : ControllerBase
    {
        private readonly IWatermarkInterface _watermarkInterface;
        private readonly ILogger<PdfWatermarkController> _logger;

        public PdfWatermarkController(IWatermarkInterface watermarkInterface, ILogger<PdfWatermarkController> logger)
        {
            _watermarkInterface = watermarkInterface;
            _logger = logger;
        }

        [HttpPost("add")]
        public async Task<IActionResult> AddWatermark([FromBody] WatermarkRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                {
                    return BadRequest("File path is required.");
                }
                if (!System.IO.File.Exists(request.FilePath))
                {
                    return NotFound($"File not found: {request.FilePath}");
                }
                if (request.WatermarkType != "text")
                {
                    return BadRequest("Only text watermarks are currently supported.");
                }
                if (request.Opacity < 1 || request.Opacity > 100)
                {
                    return BadRequest("Opacity must be between 1 and 100.");
                }
                if (request.FontSize < 8 || request.FontSize > 144)
                {
                    return BadRequest("Font size must be between 8 and 144.");
                }

                _logger.LogInformation($"Adding watermark to PDF: {request.FilePath}");

                var pdfBytes = await _watermarkInterface.AddWatermarkAsync(request);
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var outputFileName = $"{fileName}_watermarked.pdf";

                return File(pdfBytes, "application/pdf", outputFileName);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogError(ex, "Access denied to file: {FilePath}", request.FilePath);
                return StatusCode(403, "Access denied to the specified file.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding watermark to PDF: {FilePath}", request.FilePath);
                return StatusCode(500, $"An error occurred while adding watermark: {ex.Message}");
            }
        }
    }
}
