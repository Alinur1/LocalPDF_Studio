using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Enums;
using tooldeck_api.DAL.Models.CompressPdfModel;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfCompressController : ControllerBase
    {
        private readonly IPdfCompressInterface _compressService;

        public PdfCompressController(IPdfCompressInterface compressService)
        {
            _compressService = compressService;
        }

        [HttpPost("compress")]
        public async Task<IActionResult> CompressPdf([FromBody] CompressRequest request)
        {
            Console.WriteLine($"=== COMPRESS DEBUG START ===");
            Console.WriteLine($"Request null? {request == null}");
            Console.WriteLine($"FilePath: {request?.FilePath}");
            Console.WriteLine($"Options null? {request?.Options == null}");

            if (request?.Options != null)
            {
                Console.WriteLine($"Quality: {request.Options.Quality}");
                Console.WriteLine($"CustomQuality: {request.Options.CustomQuality}");
                Console.WriteLine($"RemoveMetadata: {request.Options.RemoveMetadata}");
                Console.WriteLine($"RemoveUnusedObjects: {request.Options.RemoveUnusedObjects}");
            }

            // Validate request
            if (request == null || string.IsNullOrEmpty(request.FilePath))
            {
                Console.WriteLine("FAILED: Invalid request");
                return BadRequest("Invalid request. File path is required.");
            }

            if (!System.IO.File.Exists(request.FilePath))
            {
                Console.WriteLine($"FAILED: File not found at {request.FilePath}");
                return BadRequest($"File not found: {request.FilePath}");
            }

            if (request.Options == null)
            {
                Console.WriteLine("FAILED: Options are null");
                return BadRequest("Compress options are required.");
            }

            Console.WriteLine("All validations passed, calling service...");

            // Validate custom quality if needed
            if (request.Options.Quality == CompressionQuality.Custom)
            {
                if (!request.Options.CustomQuality.HasValue ||
                    request.Options.CustomQuality.Value < 1 ||
                    request.Options.CustomQuality.Value > 100)
                {
                    return BadRequest("Custom quality must be between 1 and 100.");
                }
            }

            try
            {
                // Compress the PDF
                var result = await _compressService.CompressPdfAsync(
                    request.FilePath,
                    request.Options
                );

                // Check if compression was successful
                if (!result.Success)
                {
                    return BadRequest(result.Error ?? "Compression failed");
                }

                // Add compression statistics to response headers
                Response.Headers.Add("X-Original-Size", result.OriginalSize.ToString());
                Response.Headers.Add("X-Compressed-Size", result.CompressedSize.ToString());
                Response.Headers.Add("X-Compression-Ratio", result.CompressionRatio.ToString("F2"));

                // Get filename for download
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{fileName}_compressed.pdf";

                // Return the compressed PDF
                return File(result.CompressedData!, "application/pdf", downloadName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (FileNotFoundException ex)
            {
                return NotFound(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error compressing PDF: {ex.Message}");
            }
        }

        // Health check endpoint to verify Python compression script is available
        [HttpGet("health")]
        public IActionResult HealthCheck()
        {
            try
            {
                // You can add logic here to verify the Python executable exists
                return Ok(new
                {
                    status = "healthy",
                    message = "PDF compression service is running"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    status = "unhealthy",
                    error = ex.Message
                });
            }
        }
    }
}
