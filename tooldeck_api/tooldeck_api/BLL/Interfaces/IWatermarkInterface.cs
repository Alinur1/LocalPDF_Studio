using tooldeck_api.DAL.Models.WatermarkModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IWatermarkInterface
    {
        Task<byte[]> AddWatermarkAsync(WatermarkRequest request);
    }
}
