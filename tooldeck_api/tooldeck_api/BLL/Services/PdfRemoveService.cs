using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Models;

namespace tooldeck_api.BLL.Services
{
    public class PdfRemoveService : IPdfRemoveInterface
    {
        public async Task<byte[]> RemovePagesAsync(string filePath, RemoveOptions options)
        {
            return await Task.Run(() =>
            {
                if (!File.Exists(filePath))
                    throw new FileNotFoundException($"File not found: {filePath}");

                if (options == null)
                    throw new ArgumentNullException(nameof(options), "Remove options cannot be null");

                using var inputDoc = PdfReader.Open(filePath, PdfDocumentOpenMode.Import);

                // Get the pages to remove
                var pagesToRemove = GetPagesToRemove(inputDoc.PageCount, options);

                // Validate that we're not removing all pages
                if (pagesToRemove.Count >= inputDoc.PageCount)
                    throw new InvalidOperationException("Cannot remove all pages from the PDF");

                // Create new document with remaining pages
                using var outputDoc = new PdfDocument();

                for (int i = 0; i < inputDoc.PageCount; i++)
                {
                    // Pages are 0-indexed in code, but 1-indexed for users
                    int pageNumber = i + 1;

                    if (!pagesToRemove.Contains(pageNumber))
                    {
                        outputDoc.AddPage(inputDoc.Pages[i]);
                    }
                }

                if (outputDoc.PageCount == 0)
                    throw new InvalidOperationException("No pages remaining after removal");

                return SaveToBytes(outputDoc);
            });
        }

        private HashSet<int> GetPagesToRemove(int totalPages, RemoveOptions options)
        {
            var pagesToRemove = new HashSet<int>();

            // Process individual pages
            if (options.Pages != null && options.Pages.Any())
            {
                foreach (var page in options.Pages)
                {
                    if (page < 1 || page > totalPages)
                        throw new ArgumentException($"Page number {page} is out of range (1-{totalPages})");

                    pagesToRemove.Add(page);
                }
            }

            // Process page ranges
            if (options.PageRanges != null && options.PageRanges.Any())
            {
                foreach (var range in options.PageRanges)
                {
                    var (start, end) = ParsePageRange(range, totalPages);

                    for (int i = start; i <= end; i++)
                    {
                        pagesToRemove.Add(i);
                    }
                }
            }

            // Process even pages
            if (options.RemoveEvenPages)
            {
                for (int i = 2; i <= totalPages; i += 2)
                {
                    pagesToRemove.Add(i);
                }
            }

            // Process odd pages
            if (options.RemoveOddPages)
            {
                for (int i = 1; i <= totalPages; i += 2)
                {
                    pagesToRemove.Add(i);
                }
            }

            // Process every Nth page
            if (options.RemoveEveryNthPage.HasValue && options.RemoveEveryNthPage.Value > 0)
            {
                int n = options.RemoveEveryNthPage.Value;
                int startFrom = options.StartFromPage ?? n;

                for (int i = startFrom; i <= totalPages; i += n)
                {
                    pagesToRemove.Add(i);
                }
            }

            return pagesToRemove;
        }

        private (int start, int end) ParsePageRange(string range, int maxPages)
        {
            var parts = range.Split('-');
            if (parts.Length != 2)
                throw new ArgumentException($"Invalid page range format: {range}. Expected format: 'start-end' (e.g., '1-5')");

            if (!int.TryParse(parts[0].Trim(), out int start) || !int.TryParse(parts[1].Trim(), out int end))
                throw new ArgumentException($"Invalid page numbers in range: {range}");

            if (start < 1 || end > maxPages || start > end)
                throw new ArgumentException($"Page range {range} is out of bounds (1-{maxPages}) or invalid");

            return (start, end);
        }

        private byte[] SaveToBytes(PdfDocument doc)
        {
            using var ms = new MemoryStream();
            doc.Save(ms, false);
            return ms.ToArray();
        }
    }
}
