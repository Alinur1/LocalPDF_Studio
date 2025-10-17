namespace LocalPDF_Studio_api.DAL.Models.RemovePdfModel
{
    public class RemoveOptions
    {
        // Specific pages to remove: e.g., [1, 3, 5, 10]
        public List<int>? Pages { get; set; }

        // Page ranges to remove: e.g., ["1-3", "7-9", "15-20"]
        public List<string>? PageRanges { get; set; }

        // Remove all even-numbered pages
        public bool RemoveEvenPages { get; set; } = false;

        // Remove all odd-numbered pages
        public bool RemoveOddPages { get; set; } = false;

        // Remove every Nth page (e.g., every 3rd page)
        public int? RemoveEveryNthPage { get; set; }

        // When using RemoveEveryNthPage, start from this page number (default: N)
        public int? StartFromPage { get; set; }
    }
}
