using tooldeck_api.DAL.Models.CompressPdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfCompressInterface
    {
        Task<CompressResult> CompressPdfAsync(string filePath, CompressOptions options);
    }
}
