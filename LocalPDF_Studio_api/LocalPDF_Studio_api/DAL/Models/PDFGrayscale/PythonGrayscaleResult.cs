namespace LocalPDF_Studio_api.DAL.Models.PDFGrayscale
{
    public class PythonGrayscaleResult
    {
        public bool Success { get; set; }
        public string? Output { get; set; }
        public string? Error { get; set; }
        public int PageCount { get; set; }
        public int ConvertedPages { get; set; }
        public bool HasImages { get; set; }
        public bool HasVectorGraphics { get; set; }
    }
}
