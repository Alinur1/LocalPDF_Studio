using LocalPDF_Studio_api.DAL.Enums;
using LocalPDF_Studio_api.DAL.Models.SplitPdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfSplitInterface
    {
        Task<byte[]> SplitPdfAsync(string filePath, SplitMethod method, SplitOptions options);
    }
}
