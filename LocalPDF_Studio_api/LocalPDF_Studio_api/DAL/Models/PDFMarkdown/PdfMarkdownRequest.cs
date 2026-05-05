namespace LocalPDF_Studio_api.DAL.Models.PDFMarkdown
{
    public class PdfMarkdownRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public bool IncludeImages { get; set; } = true;
        public bool StripHeader { get; set; } = true;
        public bool StripFooter { get; set; } = true;
    }
}
