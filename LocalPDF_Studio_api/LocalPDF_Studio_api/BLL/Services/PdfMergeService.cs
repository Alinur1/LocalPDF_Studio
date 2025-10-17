using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using LocalPDF_Studio_api.BLL.Interfaces;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfMergeService : IPdfMergeInterface
    {
        public async Task<byte[]> MergeFilesAsync(IEnumerable<string> inputPaths)
        {
            return await Task.Run(() =>
            {
                using var outputDoc = new PdfDocument();

                foreach (var path in inputPaths)
                {
                    using var inputDoc = PdfReader.Open(path, PdfDocumentOpenMode.Import);

                    for (int i = 0; i < inputDoc.PageCount; i++)
                    {
                        outputDoc.AddPage(inputDoc.Pages[i]);
                    }
                }

                using var ms = new MemoryStream();
                outputDoc.Save(ms, false);
                return ms.ToArray();
            });
        }
    }
}
