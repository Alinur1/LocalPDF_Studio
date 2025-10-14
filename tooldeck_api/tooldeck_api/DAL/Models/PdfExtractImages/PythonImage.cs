using System.Text.Json.Serialization;

namespace tooldeck_api.DAL.Models.PdfExtractImages
{
    public class PythonImage
    {
        [JsonPropertyName("page")]
        public int Page { get; set; }

        [JsonPropertyName("index")]
        public int Index { get; set; }

        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; }

        [JsonPropertyName("data")]
        public string Data { get; set; }
    }
}
