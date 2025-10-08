using tooldeck_api.DAL.Models.AddPageNumbers;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IAddPageNumbersInterface
    {
        Task<byte[]> AddPageNumbersAsync(AddPageNumbersRequest request);
    }
}
