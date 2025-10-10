namespace tooldeck_api.DAL.Models.CropPdfModel
{
    public class CropPdfRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public double Top { get; set; }
        public double Bottom { get; set; }
        public double Left { get; set; }
        public double Right { get; set; }
        public bool ApplyToAllPages { get; set; } = true;
    }
}
