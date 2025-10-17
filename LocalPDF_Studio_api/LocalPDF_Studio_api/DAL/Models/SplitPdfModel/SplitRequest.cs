using LocalPDF_Studio_api.DAL.Enums;

namespace LocalPDF_Studio_api.DAL.Models.SplitPdfModel
{
    public class SplitRequest
    {
        public string? FilePath { get; set; }
        public SplitMethod Method { get; set; }
        public SplitOptions? Options { get; set; }
        public OutputFormat OutputFormat { get; set; } = OutputFormat.Zip;
    }
}
