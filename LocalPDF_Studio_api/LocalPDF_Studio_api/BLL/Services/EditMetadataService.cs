using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.Advanced;
using PdfSharpCore.Pdf.IO;
using System.Text;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.EditMetadataModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class EditMetadataService : IEditMetadataInterface
    {
        private readonly ILogger<EditMetadataService> _logger;

        public EditMetadataService(ILogger<EditMetadataService> logger)
        {
            _logger = logger;
        }

        public async Task<MetadataResponse> ProcessMetadataAsync(MetadataRequest request)
        {
            return await Task.Run(() => ProcessMetadataSync(request));
        }

        private MetadataResponse ProcessMetadataSync(MetadataRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    return new MetadataResponse { Success = false, Message = $"File not found: {request.FilePath}" };

                _logger.LogInformation("Processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);

                return request.Operation.ToLower() switch
                {
                    "read" => ReadMetadata(request),
                    "write" => WriteMetadata(request),
                    _ => new MetadataResponse { Success = false, Message = $"Invalid operation: {request.Operation}" }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing metadata {Operation}: {FilePath}", request.Operation, request.FilePath);
                return new MetadataResponse { Success = false, Message = $"Error processing metadata: {ex.Message}" };
            }
        }

        private MetadataResponse ReadMetadata(MetadataRequest request)
        {
            try
            {
                using var document = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.ReadOnly);

                var metadata = new PdfMetadata
                {
                    PageCount = document.PageCount
                };

                // Try to read from Info dictionary (traditional PDF metadata)
                var info = document.Info;
                if (info != null)
                {
                    metadata.Title = GetMetadataValue(info, "Title");
                    metadata.Author = GetMetadataValue(info, "Author");
                    metadata.Subject = GetMetadataValue(info, "Subject");
                    metadata.Keywords = GetMetadataValue(info, "Keywords");
                    metadata.Creator = GetMetadataValue(info, "Creator");
                    metadata.Producer = GetMetadataValue(info, "Producer");
                    metadata.CreationDate = GetMetadataValue(info, "CreationDate");
                    metadata.ModificationDate = GetMetadataValue(info, "ModDate");
                }

                // If traditional metadata is empty, try to read from XMP metadata
                if (IsMetadataEmpty(metadata))
                {
                    _logger.LogInformation("Traditional metadata empty, trying XMP metadata: {FilePath}", request.FilePath);
                    ReadXmpMetadata(document, metadata);
                }

                // If still empty, try alternative key names
                if (IsMetadataEmpty(metadata))
                {
                    _logger.LogInformation("Trying alternative metadata keys: {FilePath}", request.FilePath);
                    ReadAlternativeMetadata(document, metadata);
                }

                _logger.LogInformation("Metadata read successfully - Title: {Title}, Author: {Author}", metadata.Title, metadata.Author);

                return new MetadataResponse
                {
                    Success = true,
                    Metadata = metadata,
                    Message = "Metadata retrieved successfully"
                };
            }
            catch (PdfReaderException ex) when (ex.Message.Contains("password"))
            {
                _logger.LogWarning("Encrypted PDF cannot be read without password: {FilePath}", request.FilePath);
                return new MetadataResponse { Success = false, Message = "PDF is encrypted. Please unlock it first to read metadata." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reading metadata from PDF: {FilePath}", request.FilePath);
                return new MetadataResponse { Success = false, Message = $"Error reading metadata: {ex.Message}" };
            }
        }

        private bool IsMetadataEmpty(PdfMetadata metadata)
        {
            return string.IsNullOrEmpty(metadata.Title) &&
                   string.IsNullOrEmpty(metadata.Author) &&
                   string.IsNullOrEmpty(metadata.Subject) &&
                   string.IsNullOrEmpty(metadata.Keywords) &&
                   string.IsNullOrEmpty(metadata.Creator) &&
                   string.IsNullOrEmpty(metadata.Producer);
        }

        private void ReadXmpMetadata(PdfDocument document, PdfMetadata metadata)
        {
            try
            {
                // Look for XMP metadata stream
                if (document.Internals.Catalog.Elements.ContainsKey("/Metadata"))
                {
                    var metadataObject = document.Internals.Catalog.Elements["/Metadata"];
                    if (metadataObject is PdfReference reference && reference.Value is PdfDictionary metadataDict)
                    {
                        if (metadataDict.Elements.ContainsKey("/Type") &&
                            metadataDict.Elements["/Type"] is PdfName typeName &&
                            typeName.Value == "/Metadata" &&
                            metadataDict.Elements.ContainsKey("/Subtype") &&
                            metadataDict.Elements["/Subtype"] is PdfName subtypeName &&
                            subtypeName.Value == "/XML")
                        {
                            // This is XMP metadata, but PdfSharpCore doesn't have built-in XMP parsing
                            // We'll extract the raw stream and try basic parsing
                            if (metadataDict.Stream != null)
                            {
                                var xmpBytes = metadataDict.Stream.Value;
                                var xmpContent = Encoding.UTF8.GetString(xmpBytes);
                                ParseBasicXmpMetadata(xmpContent, metadata);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error reading XMP metadata from PDF: {FilePath}", document.ToString());
            }
        }

        private void ParseBasicXmpMetadata(string xmpContent, PdfMetadata metadata)
        {
            try
            {
                // Basic XMP parsing - look for common tags
                if (string.IsNullOrEmpty(metadata.Title))
                    metadata.Title = ExtractXmpValue(xmpContent, "dc:title");

                if (string.IsNullOrEmpty(metadata.Author))
                    metadata.Author = ExtractXmpValue(xmpContent, "dc:creator");

                if (string.IsNullOrEmpty(metadata.Subject))
                    metadata.Subject = ExtractXmpValue(xmpContent, "dc:description");

                if (string.IsNullOrEmpty(metadata.Keywords))
                    metadata.Keywords = ExtractXmpValue(xmpContent, "pdf:Keywords");

                if (string.IsNullOrEmpty(metadata.Creator))
                    metadata.Creator = ExtractXmpValue(xmpContent, "xmp:CreatorTool");

                if (string.IsNullOrEmpty(metadata.Producer))
                    metadata.Producer = ExtractXmpValue(xmpContent, "pdf:Producer");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error parsing XMP metadata");
            }
        }

        private string ExtractXmpValue(string xmpContent, string tagName)
        {
            try
            {
                var startTag = $"<{tagName}";
                var endTag = $"</{tagName}>";

                var startIndex = xmpContent.IndexOf(startTag);
                if (startIndex == -1) return null;

                var valueStart = xmpContent.IndexOf('>', startIndex) + 1;
                var valueEnd = xmpContent.IndexOf(endTag, valueStart);

                if (valueEnd == -1) return null;

                var value = xmpContent.Substring(valueStart, valueEnd - valueStart).Trim();

                // Remove CDATA if present
                if (value.StartsWith("<![CDATA[") && value.EndsWith("]]>"))
                {
                    value = value.Substring(9, value.Length - 12);
                }

                return string.IsNullOrWhiteSpace(value) ? null : value;
            }
            catch
            {
                return null;
            }
        }

        private void ReadAlternativeMetadata(PdfDocument document, PdfMetadata metadata)
        {
            try
            {
                var info = document.Info;

                // Try alternative/common key variations
                if (string.IsNullOrEmpty(metadata.Author))
                    metadata.Author = GetMetadataValue(info, "Author") ?? GetMetadataValue(info, "Authors");

                if (string.IsNullOrEmpty(metadata.Creator))
                    metadata.Creator = GetMetadataValue(info, "Creator") ?? GetMetadataValue(info, "SourceApplication");

                if (string.IsNullOrEmpty(metadata.Producer))
                    metadata.Producer = GetMetadataValue(info, "Producer") ?? GetMetadataValue(info, "PDFProducer");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error reading alternative metadata");
            }
        }

        private string GetMetadataValue(PdfDictionary info, string key)
        {
            if (info?.Elements == null) return null;

            // Try with slash prefix (PDF standard)
            var pdfKey = key.StartsWith("/") ? key : "/" + key;

            if (info.Elements.ContainsKey(pdfKey))
            {
                var value = info.Elements[pdfKey];

                if (value is PdfString pdfString)
                {
                    var stringValue = pdfString.Value;
                    return string.IsNullOrWhiteSpace(stringValue) ? null : stringValue.Trim();
                }
                else if (value is PdfName pdfName)
                {
                    var nameValue = pdfName.Value;
                    return string.IsNullOrWhiteSpace(nameValue) ? null : nameValue.Trim();
                }
                else if (value is PdfItem pdfItem)
                {
                    var itemValue = pdfItem.ToString();
                    return string.IsNullOrWhiteSpace(itemValue) ? null : itemValue.Trim();
                }
            }

            return null;
        }

        private MetadataResponse WriteMetadata(MetadataRequest request)
        {
            if (request.Metadata == null)
                return new MetadataResponse { Success = false, Message = "Metadata is required for write operation" };

            try
            {
                // Read the original document and modify metadata
                using var document = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Modify);
                var info = document.Info;

                // Update metadata values - ensure we use proper PDF keys with slash prefix
                UpdateMetadataValue(info, "/Title", request.Metadata.Title);
                UpdateMetadataValue(info, "/Author", request.Metadata.Author);
                UpdateMetadataValue(info, "/Subject", request.Metadata.Subject);
                UpdateMetadataValue(info, "/Keywords", request.Metadata.Keywords);
                UpdateMetadataValue(info, "/Creator", request.Metadata.Creator);
                UpdateMetadataValue(info, "/Producer", request.Metadata.Producer);

                // Set modification date to current time in PDF format
                //var now = DateTime.Now;
                //var modDate = now.ToString("D:yyyyMMddHHmmsszzz").Replace(":", "'") + "'";
                //info.Elements.SetString("/ModDate", modDate);

                // Save to memory stream and get bytes
                using var memoryStream = new MemoryStream();
                document.Save(memoryStream, false);
                var pdfBytes = memoryStream.ToArray();

                _logger.LogInformation("Metadata written successfully: {FilePath}", request.FilePath);

                // Return success with the PDF bytes
                return new MetadataResponse
                {
                    Success = true,
                    Message = "Metadata updated successfully",
                    PdfBytes = pdfBytes
                };
            }
            catch (PdfReaderException ex) when (ex.Message.Contains("password"))
            {
                _logger.LogWarning("Encrypted PDF cannot be modified without password: {FilePath}", request.FilePath);
                return new MetadataResponse { Success = false, Message = "PDF is encrypted. Please unlock it first to modify metadata." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error writing metadata to PDF: {FilePath}", request.FilePath);
                return new MetadataResponse { Success = false, Message = $"Error writing metadata: {ex.Message}" };
            }
        }

        private void UpdateMetadataValue(PdfDictionary info, string key, string value)
        {
            // Key should already have slash prefix from the caller
            if (string.IsNullOrWhiteSpace(value))
            {
                // Remove the key if value is empty
                if (info.Elements.ContainsKey(key))
                {
                    info.Elements.Remove(key);
                }
            }
            else
            {
                // Create a new PdfString
                var pdfString = new PdfString(value);
                info.Elements[key] = pdfString;
            }
        }
    }
}
