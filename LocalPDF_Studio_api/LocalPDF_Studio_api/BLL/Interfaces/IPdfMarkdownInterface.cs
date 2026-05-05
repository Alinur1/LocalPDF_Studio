using LocalPDF_Studio_api.DAL.Models.PDFMarkdown;

namespace LocalPDF_Studio_api.BLL.Interfaces
{
    public interface IPdfMarkdownInterface
    {
        Task<PythonMarkdownResult> ConvertToMarkdownAsync(PdfMarkdownRequest request);
    }
}
