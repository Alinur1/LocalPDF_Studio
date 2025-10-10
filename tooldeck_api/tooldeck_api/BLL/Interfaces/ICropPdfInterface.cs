using tooldeck_api.DAL.Models.CropPdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface ICropPdfInterface
    {
        Task<byte[]> CropPdfAsync(CropPdfRequest request);
    }
}
