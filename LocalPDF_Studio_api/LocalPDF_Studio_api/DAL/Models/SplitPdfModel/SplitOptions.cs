namespace LocalPDF_Studio_api.DAL.Models.SplitPdfModel
{
    public class SplitOptions
    {
        public List<string>? PageRanges { get; set; }
        public List<int>? SplitPages { get; set; }
        public int? PageInterval { get; set; }
    }
}
