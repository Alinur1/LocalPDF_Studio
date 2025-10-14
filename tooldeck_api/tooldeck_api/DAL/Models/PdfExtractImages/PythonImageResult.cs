using System.Text.Json.Serialization;

namespace tooldeck_api.DAL.Models.PdfExtractImages
{
    public class PythonImageResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error")]
        public string Error { get; set; }

        [JsonPropertyName("extracted_count")]
        public int ExtractedCount { get; set; }

        [JsonPropertyName("processed_pages")]
        public int ProcessedPages { get; set; }

        [JsonPropertyName("images")]
        public List<PythonImage> Images { get; set; } = new();

        [JsonPropertyName("pdf_data")] // This matches the Python JSON key
        public string PdfData { get; set; }

        [JsonPropertyName("removed_images_count")]
        public int RemovedImagesCount { get; set; }
    }
}
