namespace tooldeck_api.DAL.Models.PdfExtractImages
{
    public class ImageData
    {
        public byte[] Data { get; set; } = Array.Empty<byte>();
        public string Format { get; set; } = "png";
    }
}
