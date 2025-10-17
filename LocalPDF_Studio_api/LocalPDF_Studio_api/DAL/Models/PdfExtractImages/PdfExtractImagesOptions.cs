namespace LocalPDF_Studio_api.DAL.Models.PdfExtractImages
{
    public class PdfExtractImagesOptions
    {
        public string Mode { get; set; } = "extract"; // "extract" or "remove"
        public List<int>? Pages { get; set; }
        public List<string>? PageRanges { get; set; }

        // Extract-specific options
        public bool? PreserveQuality { get; set; }
        public bool? PreserveFormat { get; set; }
        public bool? PreserveMetadata { get; set; }
    }
}
