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


using LocalPDF_Studio_api.DAL.Enums;

namespace LocalPDF_Studio_api.DAL.Models.CompressPdfModel
{
    public class CompressOptions
    {
        // Compression quality preset (0=Low, 1=Medium, 2=High, 3=Custom)
        public CompressionQuality Quality { get; set; } = CompressionQuality.Medium;

        // Custom quality value (1-100) when Quality is set to Custom
        public int? CustomQuality { get; set; }

        // Remove metadata (author, title, keywords, etc.)
        public bool RemoveMetadata { get; set; } = false;

        // Remove unused objects and resources
        public bool RemoveUnusedObjects { get; set; } = true;

        // Get the actual quality value to use (1-100)
        public int GetQualityValue()
        {
            return Quality switch
            {
                CompressionQuality.Low => 50,
                CompressionQuality.Medium => 75,
                CompressionQuality.High => 90,
                CompressionQuality.Custom => CustomQuality ?? 75,
                _ => 75
            };
        }
    }
}
