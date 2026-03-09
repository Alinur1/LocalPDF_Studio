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

using PdfSharp.Fonts;

namespace LocalPDF_Studio_api.BLL.Utils
{
    public class LocalFontResolver : IFontResolver
    {
        private readonly string _fontsBasePath;

        public LocalFontResolver(string fontsBasePath)
        {
            _fontsBasePath = fontsBasePath;
        }

        public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic)
        {
            if (familyName.Equals("Times New Roman", StringComparison.OrdinalIgnoreCase))
                return new FontResolverInfo("times");

            return null;
        }

        public byte[]? GetFont(string faceName)
        {
            if (faceName == "times")
                return File.ReadAllBytes(Path.Combine(_fontsBasePath, "times.ttf"));

            return null;
        }
    }
}
