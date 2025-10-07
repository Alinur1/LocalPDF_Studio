using tooldeck_api.DAL.Models.PdfToImageModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfToImageInterface
    {
        Task<byte[]> ConvertPdfToImagesAsync(PdfToImageRequest request);
    }
}
