using tooldeck_api.DAL.Models;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IPdfRemoveInterface
    {
        Task<byte[]> RemovePagesAsync(string filePath, RemoveOptions options);
    }
}
