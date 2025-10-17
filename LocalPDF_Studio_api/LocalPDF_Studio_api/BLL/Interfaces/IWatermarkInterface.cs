using LocalPDF_Studio_api.DAL.Models.WatermarkModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IWatermarkInterface
    {
        Task<byte[]> AddWatermarkAsync(WatermarkRequest request);
    }
}
