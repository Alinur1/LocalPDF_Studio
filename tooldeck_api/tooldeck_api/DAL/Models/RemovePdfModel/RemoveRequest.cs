namespace tooldeck_api.DAL.Models.RemovePdfModel
{
    public class RemoveRequest
    {
        public string? FilePath { get; set; }
        public RemoveOptions? Options { get; set; }
    }
}
