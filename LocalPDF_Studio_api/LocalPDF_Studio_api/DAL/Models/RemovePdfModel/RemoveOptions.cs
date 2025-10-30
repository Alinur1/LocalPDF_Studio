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


namespace LocalPDF_Studio_api.DAL.Models.RemovePdfModel
{
    public class RemoveOptions
    {
        // Specific pages to remove: e.g., [1, 3, 5, 10]
        public List<int>? Pages { get; set; }

        // Page ranges to remove: e.g., ["1-3", "7-9", "15-20"]
        public List<string>? PageRanges { get; set; }

        // Remove all even-numbered pages
        public bool RemoveEvenPages { get; set; } = false;

        // Remove all odd-numbered pages
        public bool RemoveOddPages { get; set; } = false;

        // Remove every Nth page (e.g., every 3rd page)
        public int? RemoveEveryNthPage { get; set; }

        // When using RemoveEveryNthPage, start from this page number (default: N)
        public int? StartFromPage { get; set; }
    }
}
