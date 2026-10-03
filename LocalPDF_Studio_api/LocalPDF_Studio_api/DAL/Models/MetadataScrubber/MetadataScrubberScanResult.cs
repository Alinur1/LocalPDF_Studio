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

namespace LocalPDF_Studio_api.DAL.Models.MetadataScrubber
{
    public class MetadataScrubberScanResult
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("encrypted")]
        public bool Encrypted { get; set; }

        [JsonPropertyName("signed")]
        public bool Signed { get; set; }

        [JsonPropertyName("signatureDetail")]
        public string SignatureDetail { get; set; } = string.Empty;

        [JsonPropertyName("findings")]
        public List<MetadataScrubberFinding> Findings { get; set; } = new();

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
