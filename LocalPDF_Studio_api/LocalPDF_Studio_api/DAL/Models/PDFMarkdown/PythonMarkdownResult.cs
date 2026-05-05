namespace LocalPDF_Studio_api.DAL.Models.PDFMarkdown
{
    public class PythonMarkdownResult
    {
        public bool Success { get; set; }
        public string? Markdown { get; set; }
        public string? Error { get; set; }
        public string? Engine { get; set; }
        public List<MarkdownAsset> Assets { get; set; } = [];
        public MarkdownMeta? Meta { get; set; }
        public List<string>? MissingDependencies { get; set; }
        public string? OutputPath { get; set; }
        public string? AssetDirectory { get; set; }
    }
}
