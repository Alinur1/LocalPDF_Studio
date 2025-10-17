namespace LocalPDF_Studio_api.DAL.Models.OrganizePdfModel
{
    public class PageInstruction
    {
        // The original page number (1-based)
        public int PageNumber { get; set; }

        // Rotation in degrees (0, 90, 180, 270)
        public int Rotation { get; set; } = 0;
    }
}
