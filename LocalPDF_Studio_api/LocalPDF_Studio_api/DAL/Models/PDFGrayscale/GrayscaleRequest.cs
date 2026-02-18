namespace LocalPDF_Studio_api.DAL.Models.PDFGrayscale
{
    public class GrayscaleRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public bool PreserveImages { get; set; } = true;
        public bool PreserveVectorGraphics { get; set; } = true;
        public string? PagesRange { get; set; } = "all";
        public string? CustomPages { get; set; }
    }
}
