using LocalPDF_Studio_api.DAL.Models.AddPageNumbers;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IAddPageNumbersInterface
    {
        Task<byte[]> AddPageNumbersAsync(AddPageNumbersRequest request);
    }
}
