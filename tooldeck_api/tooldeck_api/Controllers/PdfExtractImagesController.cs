using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.BLL.Services;
using tooldeck_api.DAL.Models.PdfExtractImages;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfExtractImagesController : ControllerBase
    {
        private readonly IPdfExtractImagesInterface _extractImagesService;

        public PdfExtractImagesController(IPdfExtractImagesInterface extractImagesService)
        {
            _extractImagesService = extractImagesService;
        }

        [HttpPost("extract")]
        public async Task<IActionResult> ExtractImages([FromBody] PdfExtractImagesRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                {
                    return BadRequest("Invalid file path.");
                }

                if (request.Options == null)
                {
                    return BadRequest("Options are required.");
                }

                var resultBytes = await _extractImagesService.ProcessImagesAsync(request);

                if (request.Options.Mode == "extract")
                {
                    return File(resultBytes, "application/zip", "extracted_images.zip");
                }
                else // remove mode
                {
                    return File(resultBytes, "application/pdf", "images_removed.pdf");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error processing images: {ex.Message}");
            }
        }
    }
}
