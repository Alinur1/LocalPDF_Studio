using LocalPDF_Studio_api.DAL.Models.PdfExtractImages;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfExtractImagesInterface
    {
        Task<byte[]> ProcessImagesAsync(PdfExtractImagesRequest request);
    }
}
