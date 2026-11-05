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

namespace LocalPDF_Studio_api.DAL.Models.imageToPdf
{
    public class ImageToPdfRequest
    {
        // Page orientation: "portrait" or "landscape"
        public string Orientation { get; set; } = "portrait";

        // Page size: "fit", "a4", or "letter"
        public string PageSize { get; set; } = "a4";

        // Whether to merge all images into one PDF file
        public bool MergeAll { get; set; } = true;

        // List of images to convert
        public List<ImageFileData> Images { get; set; } = new List<ImageFileData>();
    }
}
