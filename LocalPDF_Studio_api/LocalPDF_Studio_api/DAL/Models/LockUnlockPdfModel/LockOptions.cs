namespace LocalPDF_Studio_api.DAL.Models.LockUnlockPdfModel
{
    public class LockOptions
    {
        public string OpenPassword { get; set; } = string.Empty;
        public string? PermissionsPassword { get; set; }
        public PdfPermissions Permissions { get; set; } = new();
        public int EncryptionLevel { get; set; } = 128; // 128 or 256
    }
}
