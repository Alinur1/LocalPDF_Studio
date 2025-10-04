using tooldeck_api.DAL.Models.RemovePdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfRemoveInterface
    {
        Task<byte[]> RemovePagesAsync(string filePath, RemoveOptions options);
    }
}
