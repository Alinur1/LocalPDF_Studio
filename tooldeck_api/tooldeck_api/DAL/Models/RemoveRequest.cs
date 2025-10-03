namespace tooldeck_api.DAL.Models
{
    public class RemoveRequest
    {
        public string? FilePath { get; set; }
        public RemoveOptions? Options { get; set; }
    }
}
