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
    public class PdfToExcelOptions
    {
        public List<int>? Pages { get; set; }
        public List<string>? PageRanges { get; set; }
        public string Flavor { get; set; } = "auto"; // "auto", "lattice" or "stream"
        public string Format { get; set; } = "xlsx"; // "xlsx" or "csv"
    }
}
