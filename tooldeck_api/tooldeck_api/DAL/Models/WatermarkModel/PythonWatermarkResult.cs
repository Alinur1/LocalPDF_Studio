namespace tooldeck_api.DAL.Models.WatermarkModel
{
    public class PythonWatermarkResult
    {
        public bool Success { get; set; }
        public string? Output { get; set; }
        public string? Error { get; set; }
        public int PageCount { get; set; }
        public int WatermarkedPages { get; set; }
    }
}
