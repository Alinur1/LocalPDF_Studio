using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Models.MergePdfModel;

namespace tooldeck_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMergeController : ControllerBase
    {
        private readonly IPdfMergeInterface _mergeService;

        public PdfMergeController(IPdfMergeInterface mergeService)
        {
            _mergeService = mergeService;
        }

        [HttpPost("merge")]
        public async Task<IActionResult> Merge([FromBody] MergeRequest request)
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
