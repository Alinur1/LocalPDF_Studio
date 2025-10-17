using LocalPDF_Studio_api.DAL.Models.RemovePdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfRemoveInterface
    {
        Task<byte[]> RemovePagesAsync(string filePath, RemoveOptions options);
    }
}
