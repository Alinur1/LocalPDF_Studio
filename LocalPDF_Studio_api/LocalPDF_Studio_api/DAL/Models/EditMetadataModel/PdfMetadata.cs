namespace LocalPDF_Studio_api.DAL.Models.EditMetadataModel
{
    public class PdfMetadata
    {
        public string? Title { get; set; }
        public string? Author { get; set; }
        public string? Subject { get; set; }
        public string? Keywords { get; set; }
        public string? Creator { get; set; }
        public string? Producer { get; set; }
        public string? CreationDate { get; set; }
        public string? ModificationDate { get; set; }
        public int? PageCount { get; set; }
        public string? Description { get; set; }
    }
}
