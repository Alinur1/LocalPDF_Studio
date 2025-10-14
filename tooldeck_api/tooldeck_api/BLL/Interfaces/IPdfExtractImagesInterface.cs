using tooldeck_api.DAL.Models.PdfExtractImages;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfExtractImagesInterface
    {
        Task<byte[]> ProcessImagesAsync(PdfExtractImagesRequest request);
    }
}
