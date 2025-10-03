using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Enums;
using tooldeck_api.DAL.Models;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfSplitController : ControllerBase
    {
        private readonly IPdfSplitInterface _splitService;

        public PdfSplitController(IPdfSplitInterface splitService)
        {
            _splitService = splitService;
        }

        [HttpPost("split")]
        public async Task<IActionResult> Split([FromBody] SplitRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.FilePath))
                return BadRequest("Invalid request. File path is required.");

            if (!System.IO.File.Exists(request.FilePath))
                return BadRequest($"File not found: {request.FilePath}");

            try
            {
                var resultBytes = await _splitService.SplitPdfAsync(
                    request.FilePath,
                    request.Method,
                    request.Options
                );

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var downloadName = $"{fileName}_split.zip";

                return File(resultBytes, "application/zip", downloadName);
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error splitting PDF: {ex.Message}");
            }
        }

    }
}
