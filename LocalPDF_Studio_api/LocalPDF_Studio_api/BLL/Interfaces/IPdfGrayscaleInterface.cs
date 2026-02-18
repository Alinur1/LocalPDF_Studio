using LocalPDF_Studio_api.DAL.Models.PDFGrayscale;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfGrayscaleInterface
    {
        Task<byte[]> ConvertToGrayscaleAsync(GrayscaleRequest request);
    }
}
