using tooldeck_api.DAL.Enums;

namespace tooldeck_api.DAL.Models.AddPageNumbers
{
    public class AddPageNumbersRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public PageNumberPosition Position { get; set; } = PageNumberPosition.BottomCenter;
        public PageNumberFormat Format { get; set; } = PageNumberFormat.Number;
        public int FontSize { get; set; } = 12;
        public int StartPage { get; set; } = 1;
        public int StartNumber { get; set; } = 1;
    }
}
