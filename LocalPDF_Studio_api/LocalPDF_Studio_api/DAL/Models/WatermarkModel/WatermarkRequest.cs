/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


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
        public string? CustomPages { get; set; } = "";
        public int StartPage { get; set; } = 1;
        public int EndPage { get; set; } = 0;
        public string? ImagePath { get; set; }
        public int ImageScale { get; set; } = 50;
    }
}
