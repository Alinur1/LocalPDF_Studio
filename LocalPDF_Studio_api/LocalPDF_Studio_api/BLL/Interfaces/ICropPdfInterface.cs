using LocalPDF_Studio_api.DAL.Models.CropPdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface ICropPdfInterface
    {
        Task<byte[]> CropPdfAsync(CropPdfRequest request);
    }
}
