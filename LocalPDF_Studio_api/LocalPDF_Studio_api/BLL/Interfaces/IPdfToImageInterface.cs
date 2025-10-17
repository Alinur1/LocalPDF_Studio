using LocalPDF_Studio_api.DAL.Models.PdfToImageModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfToImageInterface
    {
        Task<byte[]> ConvertPdfToImagesAsync(PdfToImageRequest request);
    }
}
