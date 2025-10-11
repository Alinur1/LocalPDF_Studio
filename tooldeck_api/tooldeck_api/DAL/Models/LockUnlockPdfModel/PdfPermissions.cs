namespace tooldeck_api.DAL.Models.LockUnlockPdfModel
{
    public class PdfPermissions
    {
        public bool AllowPrinting { get; set; } = true;
        public bool AllowCopying { get; set; } = true;
        public bool AllowModification { get; set; } = true;
        public bool AllowAnnotations { get; set; } = true;
    }
}
