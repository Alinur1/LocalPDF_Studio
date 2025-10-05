using tooldeck_api.DAL.Enums;

namespace tooldeck_api.DAL.Models.CompressPdfModel
{
    public class CompressOptions
    {
        // Compression quality preset (0=Low, 1=Medium, 2=High, 3=Custom)
        public CompressionQuality Quality { get; set; } = CompressionQuality.Medium;

        // Custom quality value (1-100) when Quality is set to Custom
        public int? CustomQuality { get; set; }

        // Remove metadata (author, title, keywords, etc.)
        public bool RemoveMetadata { get; set; } = false;

        // Remove unused objects and resources
        public bool RemoveUnusedObjects { get; set; } = true;

        // Get the actual quality value to use (1-100)
        public int GetQualityValue()
        {
            return Quality switch
            {
                CompressionQuality.Low => 50,
                CompressionQuality.Medium => 75,
                CompressionQuality.High => 90,
                CompressionQuality.Custom => CustomQuality ?? 75,
                _ => 75
            };
        }
    }
}
