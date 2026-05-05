using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.PDFMarkdown;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMarkdownController : ControllerBase
    {
        private readonly IPdfMarkdownInterface _markdownService;
        private readonly ILogger<PdfMarkdownController> _logger;

        public PdfMarkdownController(
            IPdfMarkdownInterface markdownService,
            ILogger<PdfMarkdownController> logger)
        {
            _markdownService = markdownService;
            _logger = logger;
        }

        [HttpPost("convert")]
        public async Task<IActionResult> Convert([FromBody] PdfMarkdownRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.FilePath))
                return BadRequest(new { error = "File path is required." });

            if (!System.IO.File.Exists(request.FilePath))
                return NotFound(new { error = $"File not found: {request.FilePath}" });

            var extension = Path.GetExtension(request.FilePath).ToLowerInvariant();
            if (extension != ".pdf")
                return BadRequest(new { error = "File must be a PDF." });

            var fileInfo = new FileInfo(request.FilePath);
            if (fileInfo.Length > 200 * 1024 * 1024) // 200 MB
                _logger.LogWarning("Large PDF: {Size} MB", fileInfo.Length / 1024 / 1024);

            try
            {
                _logger.LogInformation("Markdown conversion requested: {FilePath}", request.FilePath);
                var result = await _markdownService.ConvertToMarkdownAsync(request);

                if (!result.Success)
                {
                    if (result.MissingDependencies?.Count > 0)
                    {
                        return UnprocessableEntity(new
                        {
                            error = result.Error,
                            missingDependencies = result.MissingDependencies,
                        });
                    }

                    return StatusCode(500, new { error = result.Error });
                }

                var fileName = Path.GetFileNameWithoutExtension(request.FilePath);
                var response = Content(result.Markdown ?? string.Empty, "text/markdown; charset=utf-8");

                Response.Headers.Append("X-Page-Count", result.Meta?.PageCount.ToString() ?? "0");
                Response.Headers.Append("X-Asset-Count", (result.Assets?.Count ?? 0).ToString());
                Response.Headers.Append("X-Base-Font-Size", result.Meta?.BaseFontSize.ToString("F1") ?? "0");
                Response.Headers.Append("X-Output-Filename", $"{fileName}.md");

                if (!string.IsNullOrEmpty(result.AssetDirectory))
                    Response.Headers.Append("X-Asset-Directory", result.AssetDirectory);

                if (result.MissingDependencies?.Count > 0)
                    Response.Headers.Append("X-Missing-Dependencies",
                        string.Join(",", result.MissingDependencies));

                return response;
            }
            catch (FileNotFoundException ex)
            {
                _logger.LogWarning(ex, "File not found");
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error during markdown conversion: {FilePath}", request.FilePath);
                return StatusCode(500, new
                {
                    error = "An error occurred while converting the PDF.",
                    details = ex.Message,
                });
            }
        }

        [HttpPost("assets-only")]
        public async Task<IActionResult> AssetsOnly([FromBody] PdfMarkdownRequest request)
        {
            request.IncludeImages = true;
            request.StripHeader = true;
            request.StripFooter = true;

            if (string.IsNullOrWhiteSpace(request.FilePath) || !System.IO.File.Exists(request.FilePath))
                return BadRequest(new { error = "Valid file path is required." });

            try
            {
                var result = await _markdownService.ConvertToMarkdownAsync(request);
                if (!result.Success)
                    return StatusCode(500, new { error = result.Error });

                return Ok(new
                {
                    pageCount = result.Meta?.PageCount ?? 0,
                    assetCount = result.Assets?.Count ?? 0,
                    assets = result.Assets,
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error extracting assets: {FilePath}", request.FilePath);
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
