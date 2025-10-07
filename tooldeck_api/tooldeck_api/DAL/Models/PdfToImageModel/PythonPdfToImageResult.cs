namespace tooldeck_api.DAL.Models.PdfToImageModel
{
    public class PythonPdfToImageResult
    {
        public bool Success { get; set; }
        public string? Output { get; set; }
        public string? Error { get; set; }
        public int PageCount { get; set; }
    }
}
