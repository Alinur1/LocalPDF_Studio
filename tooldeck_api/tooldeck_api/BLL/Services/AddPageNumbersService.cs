using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using tooldeck_api.BLL.Interfaces;
using tooldeck_api.DAL.Enums;
using tooldeck_api.DAL.Models.AddPageNumbers;

namespace tooldeck_api.BLL.Services
{
    public class AddPageNumbersService : IAddPageNumbersInterface
    {
        private readonly ILogger<AddPageNumbersService> _logger;

        public AddPageNumbersService(ILogger<AddPageNumbersService> logger)
        {
            _logger = logger;
        }

        public async Task<byte[]> AddPageNumbersAsync(AddPageNumbersRequest request)
        {
            return await Task.Run(() =>
            {
                using var document = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Modify);
                var totalPages = document.PageCount;

                for (int i = 0; i < totalPages; i++)
                {
                    var pageIndex = i;
                    var pageNumber = i + 1;

                    if (pageNumber < request.StartPage) continue;

                    var page = document.Pages[pageIndex];
                    using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
                    var font = new XFont("Arial", request.FontSize);

                    var currentNumber = request.StartNumber + (pageNumber - request.StartPage);
                    var text = FormatPageNumber(currentNumber, totalPages, request.Format);
                    var size = gfx.MeasureString(text, font);

                    var point = GetPosition(page, size, request.Position);
                    gfx.DrawString(text, font, XBrushes.Black, point);
                }

                using var stream = new MemoryStream();
                document.Save(stream, false);
                return stream.ToArray();
            });
        }

        private string FormatPageNumber(int current, int total, PageNumberFormat format)
        {
            return format switch
            {
                PageNumberFormat.Number => current.ToString(),
                PageNumberFormat.PageOfTotal => $"Page {current} of {total}",
                PageNumberFormat.NumberWithDash => $"-{current}-",
                PageNumberFormat.RomanLower => ToRoman(current).ToLower(),
                PageNumberFormat.RomanUpper => ToRoman(current),
                _ => current.ToString()
            };
        }

        private XPoint GetPosition(PdfPage page, XSize textSize, PageNumberPosition position)
        {
            var margin = 20;
            var width = page.Width;
            var height = page.Height;

            return position switch
            {
                PageNumberPosition.TopLeft => new XPoint(margin, margin + textSize.Height),
                PageNumberPosition.TopCenter => new XPoint((width - textSize.Width) / 2, margin + textSize.Height),
                PageNumberPosition.TopRight => new XPoint(width - textSize.Width - margin, margin + textSize.Height),
                PageNumberPosition.BottomLeft => new XPoint(margin, height - margin),
                PageNumberPosition.BottomCenter => new XPoint((width - textSize.Width) / 2, height - margin),
                PageNumberPosition.BottomRight => new XPoint(width - textSize.Width - margin, height - margin),
                _ => new XPoint((width - textSize.Width) / 2, height - margin)
            };
        }

        private string ToRoman(int number)
        {
            if (number < 1 || number > 3999) return number.ToString();
            var values = new[] { 1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1 };
            var numerals = new[] { "M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I" };
            var result = "";
            for (int i = 0; i < values.Length; i++)
            {
                while (number >= values[i])
                {
                    number -= values[i];
                    result += numerals[i];
                }
            }
            return result;
        }
    }
}
