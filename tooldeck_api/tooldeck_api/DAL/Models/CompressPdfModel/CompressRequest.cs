namespace tooldeck_api.DAL.Models.CompressPdfModel
{
    public class CompressRequest
    {
        public string? FilePath { get; set; }
        public CompressOptions? Options { get; set; }
    }
}
