using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.EditMetadataModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMetadataController : ControllerBase
    {
        private readonly IEditMetadataInterface _metadataService;
        private readonly ILogger<PdfMetadataController> _logger;

        public PdfMetadataController(IEditMetadataInterface metadataService, ILogger<PdfMetadataController> logger)
        {
            _metadataService = metadataService;
            _logger = logger;
        }

        [HttpPost("metadata")]
        public async Task<IActionResult> ProcessMetadata([FromBody] MetadataRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.FilePath))
                    return BadRequest("File path is required.");

                if (!System.IO.File.Exists(request.FilePath))
                    return NotFound($"File not found: {request.FilePath}");

                if (string.IsNullOrWhiteSpace(request.Operation))
                    return BadRequest("Operation is required (read or write).");

                _logger.LogInformation("Processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);

                var result = await _metadataService.ProcessMetadataAsync(request);

                if (!result.Success)
                {
                    return BadRequest(result.Message);
                }

                // For write operations, the service should return the PDF bytes
                // But since our current service interface returns MetadataResponse,
                // we need to modify the approach

                if (request.Operation.ToLower() == "write")
                {
                    // Create a simple write operation that doesn't conflict with the service
                    var outputName = Path.GetFileNameWithoutExtension(request.FilePath) + "_updated.pdf";
                    var tempFilePath = Path.GetTempFileName() + ".pdf";

                    using (var document = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Modify))
                    {
                        var info = document.Info;

                        // Apply metadata updates using proper PDF keys with slash prefix
                        UpdateMetadata(info, request.Metadata);

                        document.Save(tempFilePath);
                    }

                    var fileBytes = await System.IO.File.ReadAllBytesAsync(tempFilePath);
                    System.IO.File.Delete(tempFilePath);

                    return File(fileBytes, "application/pdf", outputName);
                }

                // For read operations, return the metadata
                return Ok(new { metadata = result.Metadata });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);
                return StatusCode(500, $"Error processing metadata: {ex.Message}");
            }
        }

        private void UpdateMetadata(PdfDictionary info, PdfMetadata metadata)
        {
            if (metadata == null) return;

            UpdateMetadataValue(info, "/Title", metadata.Title);
            UpdateMetadataValue(info, "/Author", metadata.Author);
            UpdateMetadataValue(info, "/Subject", metadata.Subject);
            UpdateMetadataValue(info, "/Keywords", metadata.Keywords);
            UpdateMetadataValue(info, "/Creator", metadata.Creator);
            UpdateMetadataValue(info, "/Producer", metadata.Producer);
        }

        private void UpdateMetadataValue(PdfDictionary info, string key, string value)
        {
            // Key should have slash prefix
            if (string.IsNullOrWhiteSpace(value))
            {
                if (info.Elements.ContainsKey(key))
                    info.Elements.Remove(key);
            }
            else
            {
                var pdfString = new PdfString(value);
                info.Elements[key] = pdfString;
            }
        }
    }
}
