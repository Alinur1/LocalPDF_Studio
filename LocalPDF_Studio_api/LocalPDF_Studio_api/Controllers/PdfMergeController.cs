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


using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.MergePdfModel;

namespace LocalPDF_Studio_api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PdfMergeController : ControllerBase
    {
        private readonly IPdfMergeInterface _mergeService;

        public PdfMergeController(IPdfMergeInterface mergeService)
        {
            _mergeService = mergeService;
        }

        [HttpPost("merge")]
        public async Task<IActionResult> Merge([FromBody] MergeRequest request)
        {
            if (request?.Files == null)
                return BadRequest("No files provided.");

            foreach (var f in request.Files)
            {
                if (!System.IO.File.Exists(f))
                    return BadRequest($"File not found: {f}");
            }

            var mergedBytes = await _mergeService.MergeFilesAsync(request.Files);

            return File(mergedBytes, "application/pdf", "merged.pdf");
        }
    }
}
