using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.DTOs;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfController : ControllerBase
    {
        private readonly IPdfMergeService _mergeService;

        public PdfController(IPdfMergeService mergeService)
        {
            _mergeService = mergeService;
        }

        [HttpPost("merge")]
        public async Task<IActionResult> Merge([FromBody] MergeRequestDto request)
        {
            if (request?.Files == null)
                return BadRequest("No files provided.");

            foreach (var f in request.Files)
            {
                if (!System.IO.File.Exists(f))
                    return BadRequest($"File not found: {f}");
            }

            var mergedBytes = await _mergeService.MergeFilesAsync(request.Files);

            return File(mergedBytes, "application/pdf", "merged.pdf");
        }
    }
}
