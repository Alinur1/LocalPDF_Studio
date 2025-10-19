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

        private (int start, int end) ParsePageRange(string range, int maxPages)
        {
            range = range.Trim();
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
    }
}
