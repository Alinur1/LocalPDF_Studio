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


namespace LocalPDF_Studio_api.DAL.Models.PDFMarkdown
{
    public class PythonMarkdownResult
    {
        public bool Success { get; set; }
        public string? Markdown { get; set; }
        public string? Error { get; set; }
        public string? Engine { get; set; }
        public List<MarkdownAsset> Assets { get; set; } = [];
        public MarkdownMeta? Meta { get; set; }
        public List<string>? MissingDependencies { get; set; }
        public string? OutputPath { get; set; }
        public string? AssetDirectory { get; set; }
    }
}
