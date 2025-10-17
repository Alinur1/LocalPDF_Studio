using LocalPDF_Studio_api.DAL.Models.EditMetadataModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IEditMetadataInterface
    {
        Task<MetadataResponse> ProcessMetadataAsync(MetadataRequest request);
    }
}
