using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using System.IO.Compression;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Enums;
using LocalPDF_Studio_api.DAL.Models.SplitPdfModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfSplitService : IPdfSplitInterface
    {
        public async Task<byte[]> SplitPdfAsync(string filePath, SplitMethod method, SplitOptions options)
        {
            return await Task.Run(() =>
            {
                if (!File.Exists(filePath))
                    throw new FileNotFoundException($"File not found: {filePath}");

                using var inputDoc = PdfReader.Open(filePath, PdfDocumentOpenMode.Import);
                var fileName = Path.GetFileNameWithoutExtension(filePath);

                List<(string name, byte[] data)> outputFiles = method switch
                {
                    SplitMethod.ByPageRanges => SplitByPageRanges(inputDoc, options, fileName),
                    SplitMethod.AtSpecificPages => SplitAtSpecificPages(inputDoc, options, fileName),
                    SplitMethod.EveryNPages => SplitEveryNPages(inputDoc, options, fileName),
                    SplitMethod.ExtractAllPages => ExtractAllPages(inputDoc, fileName),
                    SplitMethod.ByBlankPages => SplitByBlankPages(inputDoc, options, fileName),
                    _ => throw new ArgumentException("Invalid split method")
                };

                return CreateZipArchive(outputFiles, fileName);
            });
        }


        private List<(string name, byte[] data)> SplitByPageRanges(PdfDocument inputDoc, SplitOptions options, string fileName)
        {
            if (options.PageRanges == null || !options.PageRanges.Any())
                throw new ArgumentException("Page ranges are required");

            var results = new List<(string, byte[])>();
            int partNumber = 1;

            foreach (var range in options.PageRanges)
            {
                var (start, end) = ParsePageRange(range, inputDoc.PageCount);

                using var outputDoc = new PdfDocument();
                for (int i = start - 1; i < end; i++)
                {
                    outputDoc.AddPage(inputDoc.Pages[i]);
                }

                results.Add(($"{fileName}_part{partNumber}_pages{start}-{end}.pdf", SaveToBytes(outputDoc)));
                partNumber++;
            }

            return results;
        }

        private List<(string name, byte[] data)> SplitAtSpecificPages(PdfDocument inputDoc, SplitOptions options, string fileName)
        {
            if (options.SplitPages == null || !options.SplitPages.Any())
                throw new ArgumentException("Split pages are required");

            var results = new List<(string, byte[])>();
            var splitPoints = options.SplitPages.OrderBy(p => p).ToList();

            // Add start and end boundaries
            var boundaries = new List<int> { 0 };
            boundaries.AddRange(splitPoints);
            boundaries.Add(inputDoc.PageCount);

            for (int i = 0; i < boundaries.Count - 1; i++)
            {
                int start = boundaries[i];
                int end = boundaries[i + 1];

                using var outputDoc = new PdfDocument();
                for (int pageIdx = start; pageIdx < end; pageIdx++)
                {
                    outputDoc.AddPage(inputDoc.Pages[pageIdx]);
                }

                results.Add(($"{fileName}_part{i + 1}_pages{start + 1}-{end}.pdf", SaveToBytes(outputDoc)));
            }

            return results;
        }

        private List<(string name, byte[] data)> SplitEveryNPages(PdfDocument inputDoc, SplitOptions options, string fileName)
        {
            if (!options.PageInterval.HasValue || options.PageInterval.Value < 1)
                throw new ArgumentException("Valid page interval is required");

            var results = new List<(string, byte[])>();
            int interval = options.PageInterval.Value;
            int partNumber = 1;

            for (int i = 0; i < inputDoc.PageCount; i += interval)
            {
                int start = i;
                int end = Math.Min(i + interval, inputDoc.PageCount);

                using var outputDoc = new PdfDocument();
                for (int pageIdx = start; pageIdx < end; pageIdx++)
                {
                    outputDoc.AddPage(inputDoc.Pages[pageIdx]);
                }

                results.Add(($"{fileName}_part{partNumber}_pages{start + 1}-{end}.pdf", SaveToBytes(outputDoc)));
                partNumber++;
            }

            return results;
        }

        private List<(string name, byte[] data)> ExtractAllPages(PdfDocument inputDoc, string fileName)
        {
            var results = new List<(string, byte[])>();

            for (int i = 0; i < inputDoc.PageCount; i++)
            {
                using var outputDoc = new PdfDocument();
                outputDoc.AddPage(inputDoc.Pages[i]);
                results.Add(($"{fileName}_page{i + 1}.pdf", SaveToBytes(outputDoc)));
            }

            return results;
        }

        private List<(string name, byte[] data)> SplitByBlankPages(PdfDocument inputDoc, SplitOptions options, string fileName)
        {
            double threshold = options.BlankThreshold ?? 0.98;
            var results = new List<(string, byte[])>();
            var currentDoc = new PdfDocument();
            int partNumber = 1;
            int startPage = 1;
            int currentPage = 1;

            for (int i = 0; i < inputDoc.PageCount; i++)
            {
                var page = inputDoc.Pages[i];
                bool isBlank = IsPageBlank(page, threshold);

                if (isBlank && currentDoc.PageCount > 0)
                {
                    // Save current document before blank page
                    results.Add(($"{fileName}_part{partNumber}_pages{startPage}-{currentPage - 1}.pdf", SaveToBytes(currentDoc)));
                    currentDoc.Dispose();
                    currentDoc = new PdfDocument();
                    partNumber++;
                    startPage = currentPage + 1;
                }
                else if (!isBlank)
                {
                    currentDoc.AddPage(page);
                }

                currentPage++;
            }

            // Save remaining pages
            if (currentDoc.PageCount > 0)
            {
                results.Add(($"{fileName}_part{partNumber}_pages{startPage}-{inputDoc.PageCount}.pdf", SaveToBytes(currentDoc)));
            }

            currentDoc.Dispose();
            return results;
        }

        private bool IsPageBlank(PdfPage page, double threshold)
        {
            // A more sophisticated implementation would analyze actual content streams
            try
            {
                var contents = page.Contents;
                if (contents == null) return true;

                // A page can have multiple content streams. We need to combine them.
                byte[] contentBytes;
                using (var ms = new MemoryStream())
                {
                    foreach (var stream in contents)
                    {
                        var bytes = stream.Stream.Value;
                        ms.Write(bytes, 0, bytes.Length);
                    }
                    contentBytes = ms.ToArray();
                }

                if (contentBytes == null || contentBytes.Length < 100) return true;

                // Convert to string to analyze
                // Using ASCII might be safer if the stream contains binary data that isn't valid UTF8
                var contentString = System.Text.Encoding.ASCII.GetString(contentBytes);

                // Check for minimal content indicators
                // Blank pages typically have very little content
                if (contentString.Trim().Length < 20) return true;

                // Count actual drawing operations (more sophisticated check)
                int drawingOps = 0;
                // PDF operators for drawing paths, text, images, etc.
                string[] drawOps = { " l", " m", " c", " re", " S", " s", " f", " F", " B", " b", " BT", "Do" };
                foreach (var op in drawOps)
                {
                    drawingOps += CountOccurrences(contentString, op);
                }

                // If very few drawing operations, likely blank
                return drawingOps < 5;
            }
            catch
            {
                // If we can't determine, assume not blank to be safe
                return false;
            }
        }

        private int CountOccurrences(string text, string pattern)
        {
            int count = 0;
            int index = 0;
            while ((index = text.IndexOf(pattern, index)) != -1)
            {
                count++;
                index += pattern.Length;
            }
            return count;
        }

        private (int start, int end) ParsePageRange(string range, int maxPages)
        {
            range = range.Trim();

            // Handle single page
            if (!range.Contains('-'))
            {
                if (int.TryParse(range, out int singlePage))
                {
                    if (singlePage >= 1 && singlePage <= maxPages)
                        return (singlePage, singlePage);
                    else
                        throw new ArgumentException($"Page number {singlePage} is out of range (1-{maxPages})");
                }
                throw new ArgumentException($"Invalid page number: '{range}'");
            }

            // Handle range
            var parts = range.Split('-');
            if (parts.Length != 2)
                throw new ArgumentException($"Invalid range format: '{range}'. Use 'start-end' or single page numbers.");

            if (int.TryParse(parts[0].Trim(), out int start) && int.TryParse(parts[1].Trim(), out int end))
            {
                if (start < 1) throw new ArgumentException($"Start page cannot be less than 1: '{range}'");
                if (end > maxPages) throw new ArgumentException($"End page cannot exceed {maxPages}: '{range}'");
                if (start > end) throw new ArgumentException($"Start page cannot be greater than end page: '{range}'");

                return (start, end);
            }

            throw new ArgumentException($"Invalid page numbers in range: '{range}'");
        }

        private byte[] SaveToBytes(PdfDocument doc)
        {
            using var ms = new MemoryStream();
            doc.Save(ms, false);
            return ms.ToArray();
        }

        private byte[] CreateZipArchive(List<(string name, byte[] data)> files, string fileName)
        {
            using var zipStream = new MemoryStream();
            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
            {
                foreach (var (name, data) in files)
                {
                    var entry = archive.CreateEntry(name, CompressionLevel.Optimal);
                    using var entryStream = entry.Open();
                    entryStream.Write(data, 0, data.Length);
                }
            }
            return zipStream.ToArray();
        }

        private byte[] CreateMultiplePdfsResponse(List<(string name, byte[] data)> files)
        {
            // For multiple PDFs without ZIP, we'll return the first file
            // In a real scenario, you might want to handle this differently
            // or return an error if multiple files are requested without ZIP
            if (files.Count == 1)
                return files[0].data;

            throw new InvalidOperationException("Multiple PDF output requires ZIP format");
        }
    }
}
