namespace LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel
{
    public class PdfaResult
    {
        public bool Success { get; set; }
        public byte[]? ConvertedData { get; set; }
        public string? ConformanceLevel { get; set; }
        public string? Error { get; set; }
    }
}
