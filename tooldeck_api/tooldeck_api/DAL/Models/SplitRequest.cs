using tooldeck_api.DAL.Enums;

namespace tooldeck_api.DAL.Models
{
    public class SplitRequest
    {
        public string? FilePath { get; set; }
        public SplitMethod Method { get; set; }
        public SplitOptions? Options { get; set; }
        public OutputFormat OutputFormat { get; set; } = OutputFormat.Zip;
    }
}
