namespace tooldeck_api.DAL.Models.CompressPdfModel
{
    public class PythonCompressionResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public long OriginalSize { get; set; }
        public long CompressedSize { get; set; }
        public double CompressionRatio { get; set; }
        public string? OutputPath { get; set; } // ← ADD THIS!
    }
}
