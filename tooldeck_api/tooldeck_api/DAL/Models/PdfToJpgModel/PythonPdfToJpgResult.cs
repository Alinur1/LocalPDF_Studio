namespace tooldeck_api.DAL.Models.PdfToJpgModel
{
    public class PythonPdfToJpgResult
    {
        public bool Success { get; set; }
        public string? Output { get; set; }
        public string? Error { get; set; }
        public int PageCount { get; set; }
    }
}
