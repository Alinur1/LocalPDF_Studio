using tooldeck_api.DAL.Models.LockUnlockPdfModel;

namespace tooldeck_api.BLL.Interfaces
{
    public interface ILockUnlockPdfInterface
    {
        Task<byte[]> ProcessPdfAsync(LockUnlockRequest request);
    }
}
