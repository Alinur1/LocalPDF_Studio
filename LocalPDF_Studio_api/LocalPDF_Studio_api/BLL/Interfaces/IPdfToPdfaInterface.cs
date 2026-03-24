using LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfToPdfaInterface
    {
        Task<PdfaResult> ConvertToPdfaAsync(string filePath, PdfaOptions options);
        Task<bool> IsConversionAvailableAsync();
    }
}
