/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


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
