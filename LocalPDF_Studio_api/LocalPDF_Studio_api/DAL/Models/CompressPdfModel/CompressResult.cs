namespace LocalPDF_Studio_api.DAL.Models.CompressPdfModel
{
    public class CompressResult
    {
        public bool Success { get; set; }
        public byte[]? CompressedData { get; set; }
        public long OriginalSize { get; set; }
        public long CompressedSize { get; set; }
        public double CompressionRatio { get; set; }
        public string? Error { get; set; }
    }
}
