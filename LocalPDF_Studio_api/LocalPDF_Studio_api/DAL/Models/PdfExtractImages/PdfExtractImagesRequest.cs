namespace LocalPDF_Studio_api.DAL.Models.PdfExtractImages
{
    public class PdfExtractImagesRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public PdfExtractImagesOptions Options { get; set; } = new();
    }
}
