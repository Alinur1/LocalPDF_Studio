namespace tooldeck_api.DAL.Models.CropPdfModel
{
    public class CropPdfRequest
    {
        public string FilePath { get; set; } = string.Empty;

        // Frontend: "all", "current", or "custom"
        public string PagesRange { get; set; } = "all";

        // Frontend: "1, 2-3, 5"
        public string? CustomPages { get; set; }

        // Margin values (in points)
        public CropMargins Margins { get; set; } = new();

        // Optional current page index if future use
        public int? CurrentPage { get; set; }
    }
}
