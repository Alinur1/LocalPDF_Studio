using tooldeck_api.DAL.Models.EditMetadataModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface IEditMetadataInterface
    {
        Task<MetadataResponse> ProcessMetadataAsync(MetadataRequest request);
    }
}
