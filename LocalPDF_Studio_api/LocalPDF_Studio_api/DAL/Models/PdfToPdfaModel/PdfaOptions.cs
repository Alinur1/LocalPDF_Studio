namespace LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel
{
    public class PdfaOptions
    {
        /// <summary>
        /// PDF/A conformance level: pdfa1b, pdfa1a, pdfa2b, pdfa2a, pdfa3b
        /// </summary>
        public string ConformanceLevel { get; set; } = "pdfa1b";

        /// <summary>
        /// Embed all fonts in the output PDF/A
        /// </summary>
        public bool EmbedAllFonts { get; set; } = true;

        /// <summary>
        /// Subset fonts (embed only used characters)
        /// </summary>
        public bool SubsetFonts { get; set; } = true;
    }
}
