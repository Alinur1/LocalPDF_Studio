namespace LocalPDF_Studio_api.DAL.Models.OrganizePdfModel
{
    public class OrganizeOptions
    {
        // List of pages in the desired order with optional rotations
        // Can include duplicates for page duplication
        // Example: [1, 3, 2, 1] reorders and duplicates page 1
        public List<PageInstruction>? PageOrder { get; set; }
    }
}
