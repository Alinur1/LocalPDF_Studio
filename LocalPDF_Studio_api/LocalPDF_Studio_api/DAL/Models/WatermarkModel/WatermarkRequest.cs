namespace LocalPDF_Studio_api.DAL.Models.WatermarkModel
{
    public class WatermarkRequest
    {
        public string FilePath { get; set; } = string.Empty;
        public string WatermarkType { get; set; } = "text";
        public string Text { get; set; } = "CONFIDENTIAL";
        public string Position { get; set; } = "Center";
        public int Rotation { get; set; } = 45;
        public int Opacity { get; set; } = 60;
        public int FontSize { get; set; } = 36;
        public string TextColor { get; set; } = "#3498db";
        public string PagesRange { get; set; } = "all";
        public string CustomPages { get; set; } = "";
        public int StartPage { get; set; } = 1;
        public int EndPage { get; set; } = 0;
    }
}
