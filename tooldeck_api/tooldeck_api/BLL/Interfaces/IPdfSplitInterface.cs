using tooldeck_api.DAL.Enums;
using tooldeck_api.DAL.Models.SplitPdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfSplitInterface
    {
        Task<byte[]> SplitPdfAsync(string filePath, SplitMethod method, SplitOptions options);
    }
}
