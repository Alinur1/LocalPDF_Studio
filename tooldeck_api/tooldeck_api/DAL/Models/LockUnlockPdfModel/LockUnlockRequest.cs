namespace tooldeck_api.DAL.Models.LockUnlockPdfModel
{
    public class LockUnlockRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public string Operation { get; set; } = string.Empty; // "lock" or "unlock"
        public LockOptions? LockOptions { get; set; }
        public UnlockOptions? UnlockOptions { get; set; }
    }
}
