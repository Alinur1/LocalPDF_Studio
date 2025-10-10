namespace tooldeck_api.DAL.Models.CropPdfModel
{
    public class CropPdfResult
    {
        public bool Success { get; set; }
        public string? OutputPath { get; set; }
        public string? Error { get; set; }
        public int TotalPages { get; set; }
        public int CroppedPages { get; set; }
    }
}
