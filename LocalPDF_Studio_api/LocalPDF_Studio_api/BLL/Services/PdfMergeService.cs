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


using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using LocalPDF_Studio_api.BLL.Interfaces;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfMergeService : IPdfMergeInterface
    {
        public async Task<byte[]> MergeFilesAsync(IEnumerable<string> inputPaths)
        {
            return await Task.Run(() =>
            {
                using var outputDoc = new PdfDocument();

                foreach (var path in inputPaths)
                {
                    using var inputDoc = PdfReader.Open(path, PdfDocumentOpenMode.Import);

                    for (int i = 0; i < inputDoc.PageCount; i++)
                    {
                        outputDoc.AddPage(inputDoc.Pages[i]);
                    }
                }

                using var ms = new MemoryStream();
                outputDoc.Save(ms, false);
                return ms.ToArray();
            });
        }
    }
}
