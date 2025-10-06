using tooldeck_api.DAL.Models.PdfToJpgModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfToJpgInterface
    {
        Task<byte[]> ConvertPdfToImagesAsync(PdfToJpgRequest request);
    }
}
