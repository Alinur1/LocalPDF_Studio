using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.AddPageNumbers;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AddPageNumbersController : ControllerBase
    {
        private readonly IAddPageNumbersInterface _service;
        private readonly ILogger<AddPageNumbersController> _logger;

        public AddPageNumbersController(IAddPageNumbersInterface service, ILogger<AddPageNumbersController> logger)
        {
            _service = service;
            _logger = logger;
        }

        [HttpPost("add")]
        public async Task<IActionResult> AddPageNumbers([FromBody] AddPageNumbersRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                if (request.FontSize < 8 || request.FontSize > 72)
                    return BadRequest("Font size must be between 8 and 72.");

                _logger.LogInformation($"Adding page numbers to: {request.FilePath}");

                var result = await _service.AddPageNumbersAsync(request);
                var fileName = Path.GetFileNameWithoutExtension(request.FilePath) + "_numbered.pdf";

                return File(result, "application/pdf", fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding page numbers");
                return StatusCode(500, $"Error: {ex.Message}");
            }
        }
    }
}
