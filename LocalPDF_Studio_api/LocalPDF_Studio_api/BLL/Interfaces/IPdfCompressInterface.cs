using LocalPDF_Studio_api.DAL.Models.CompressPdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfCompressInterface
    {
        Task<CompressResult> CompressPdfAsync(string filePath, CompressOptions options);
    }
}
