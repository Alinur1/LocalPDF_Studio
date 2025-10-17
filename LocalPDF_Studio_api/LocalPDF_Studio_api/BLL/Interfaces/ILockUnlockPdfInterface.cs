using LocalPDF_Studio_api.DAL.Models.LockUnlockPdfModel;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface ILockUnlockPdfInterface
    {
        Task<byte[]> ProcessPdfAsync(LockUnlockRequest request);
    }
}
