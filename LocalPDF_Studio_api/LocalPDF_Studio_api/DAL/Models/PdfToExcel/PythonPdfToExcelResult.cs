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


using System.Text.Json.Serialization;

namespace LocalPDF_Studio_api.DAL.Models.PdfToExcel
{
    public class PythonPdfToExcelResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("pageCount")]
        public int PageCount { get; set; }

        [JsonPropertyName("tableCount")]
        public int TableCount { get; set; }

        [JsonPropertyName("flavor")]
        public string Flavor { get; set; } = "auto";

        [JsonPropertyName("format")]
        public string Format { get; set; } = "xlsx";

        [JsonPropertyName("notes")]
        public List<string> Notes { get; set; } = new();

        [JsonPropertyName("output")]
        public string? Output { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
