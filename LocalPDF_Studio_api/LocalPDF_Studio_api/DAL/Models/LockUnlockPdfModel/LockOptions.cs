namespace LocalPDF_Studio_api.DAL.Models.LockUnlockPdfModel
{
    public class LockOptions
    {
        public string OpenPassword { get; set; } = string.Empty;
        public int EncryptionLevel { get; set; } = 128;
    }
}
