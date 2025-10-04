namespace tooldeck_api.DAL.Models.SplitPdfModel
{
    public class SplitOptions
    {
        // For ByPageRanges: e.g., ["1-3", "5-7", "10-12"]
        public List<string>? PageRanges { get; set; }

        // For AtSpecificPages: e.g., [3, 5, 10] splits AFTER these pages
        public List<int>? SplitPages { get; set; }

        // For EveryNPages: e.g., 5 (split every 5 pages)
        public int? PageInterval { get; set; }

        // For ByBlankPages
        public double? BlankThreshold { get; set; } = 0.98; // 98% white = blank
    }
}
