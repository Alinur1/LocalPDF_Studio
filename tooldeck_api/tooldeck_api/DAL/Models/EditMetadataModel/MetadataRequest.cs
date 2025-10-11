namespace tooldeck_api.DAL.Models.EditMetadataModel
{
    public class MetadataRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public string Operation { get; set; } = string.Empty; // "read" or "write"
        public PdfMetadata? Metadata { get; set; }
    }
}
