using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Models.CropPdfModel;

namespace tooldeck_api.BLL.Services
{
    public class CropPdfService : ICropPdfInterface
    {
        private readonly ILogger<CropPdfService> _logger;

        public CropPdfService(ILogger<CropPdfService> logger)
        {
            _logger = logger;
        }

        public async Task<byte[]> CropPdfAsync(CropPdfRequest request)
        {
            return await Task.Run(() => CropPdfSync(request));
        }

        private byte[] CropPdfSync(CropPdfRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting PDF crop with PdfSharpCore: {request.FilePath}");

                // Open the input document
                var inputDocument = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Import);
                var outputDocument = new PdfDocument();

                for (int i = 0; i < inputDocument.Pages.Count; i++)
                {
                    var inputPage = inputDocument.Pages[i];

                    // Add the page to the output document
                    var outputPage = outputDocument.AddPage(inputPage);

                    // Get the media box (original page size)
                    var mediaBox = outputPage.MediaBox;

                    // Calculate new crop box
                    var cropX1 = mediaBox.X1 + request.Left;
                    var cropY1 = mediaBox.Y1 + request.Bottom;
                    var cropX2 = mediaBox.X2 - request.Right;
                    var cropY2 = mediaBox.Y2 - request.Top;

                    // Validate crop box
                    if (cropX2 > cropX1 && cropY2 > cropY1)
                    {
                        // Set the new crop box using two points (bottom-left and top-right)
                        outputPage.CropBox = new PdfRectangle(new XPoint(cropX1, cropY1), new XPoint(cropX2, cropY2));
                    }
                    else
                    {
                        _logger.LogWarning($"Page {i + 1}: Invalid crop dimensions, using original page size");
                    }
                }

                // Save to memory stream
                using var memoryStream = new MemoryStream();
                outputDocument.Save(memoryStream, false);
                outputDocument.Close();
                inputDocument.Close();

                var resultBytes = memoryStream.ToArray();
                _logger.LogInformation($"PDF cropped successfully with PdfSharpCore. Pages: {inputDocument.Pages.Count}");

                return resultBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cropping PDF with PdfSharpCore");
                throw;
            }
        }
    }
}