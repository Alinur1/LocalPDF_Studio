namespace tooldeck_api.DAL.Models.PdfToJpgModel
{
    public class PdfToJpgRequest
    {
        // Full path to the PDF file
        public string FilePath { get; set; } = string.Empty;

        // DPI (Dots Per Inch) for image quality
        // Common values: 72 (low), 150 (medium), 300 (high)
        public int Dpi { get; set; } = 150;

        // Output format: "jpg" or "png"
        public string Format { get; set; } = "jpg";

        // Whether to include page numbers in filenames
        // e.g., document_page_001.jpg, document_page_002.jpg
        public bool IncludePageNumbers { get; set; } = true;
    }
}
