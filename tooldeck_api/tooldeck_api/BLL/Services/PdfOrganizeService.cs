using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Models.OrganizePdfModel;

namespace tooldeck_api.BLL.Services
{
    public class PdfOrganizeService : IPdfOrganizeInterface
    {
        public async Task<byte[]> OrganizePdfAsync(string filePath, OrganizeOptions options)
        {
            return await Task.Run(() =>
            {
                if (!File.Exists(filePath))
                    throw new FileNotFoundException($"File not found: {filePath}");

                if (options == null)
                    throw new ArgumentNullException(nameof(options), "Organize options cannot be null");

                if (options.PageOrder == null || !options.PageOrder.Any())
                    throw new ArgumentException("Page order is required");

                using var inputDoc = PdfReader.Open(filePath, PdfDocumentOpenMode.Import);

                // Validate page order
                ValidatePageOrder(inputDoc.PageCount, options.PageOrder);

                // Create new document with reordered pages
                using var outputDoc = new PdfDocument();

                foreach (var pageInstruction in options.PageOrder)
                {
                    int pageNumber = pageInstruction.PageNumber;
                    int rotation = pageInstruction.Rotation;

                    // Validate page number
                    if (pageNumber < 1 || pageNumber > inputDoc.PageCount)
                        throw new ArgumentException($"Page number {pageNumber} is out of range (1-{inputDoc.PageCount})");

                    // Add the page
                    var page = outputDoc.AddPage(inputDoc.Pages[pageNumber - 1]);

                    // Apply rotation if specified
                    if (rotation != 0)
                    {
                        // Normalize rotation to 0, 90, 180, 270
                        int normalizedRotation = ((rotation % 360) + 360) % 360;

                        if (normalizedRotation % 90 != 0)
                            throw new ArgumentException($"Rotation must be a multiple of 90 degrees. Got: {rotation}");

                        // Get current rotation and add new rotation
                        int currentRotation = page.Rotate;
                        page.Rotate = (currentRotation + normalizedRotation) % 360;
                    }
                }

                if (outputDoc.PageCount == 0)
                    throw new InvalidOperationException("No pages in the organized PDF");

                return SaveToBytes(outputDoc);
            });
        }

        private void ValidatePageOrder(int totalPages, List<PageInstruction> pageOrder)
        {
            if (pageOrder == null || !pageOrder.Any())
                throw new ArgumentException("Page order cannot be empty");

            foreach (var instruction in pageOrder)
            {
                if (instruction.PageNumber < 1 || instruction.PageNumber > totalPages)
                    throw new ArgumentException($"Page number {instruction.PageNumber} is out of range (1-{totalPages})");
            }
        }

        private byte[] SaveToBytes(PdfDocument doc)
        {
            using var ms = new MemoryStream();
            doc.Save(ms, false);
            return ms.ToArray();
        }
    }
}
