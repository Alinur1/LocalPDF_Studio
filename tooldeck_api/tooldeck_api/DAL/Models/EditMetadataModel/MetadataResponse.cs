namespace tooldeck_api.DAL.Models.EditMetadataModel
{
    public class MetadataResponse
    {
        public bool Success { get; set; }
        public PdfMetadata? Metadata { get; set; }
        public string? Message { get; set; }
    }
}
