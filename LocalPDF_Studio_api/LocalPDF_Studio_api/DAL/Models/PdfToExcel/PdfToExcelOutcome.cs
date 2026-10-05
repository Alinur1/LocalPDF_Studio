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


namespace LocalPDF_Studio_api.DAL.Models.PdfToExcel
{
    public class PdfToExcelOutcome
    {
        public byte[] FileBytes { get; set; } = Array.Empty<byte>();
        public string Format { get; set; } = "xlsx";
        public string OutputKind { get; set; } = "xlsx"; // "xlsx", "zip" or "csv"
        public int TableCount { get; set; }
        public List<string> Notes { get; set; } = new();
    }
}
