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


using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Utils
{
    public static class PythonJsonParser
    {
        /// <summary>
        /// Safely deserializes JSON from Python stdout, ignoring any 
        /// rogue warnings or debug prints that precede the actual payload.
        /// </summary>
        public static T CleanAndDeserialize<T>(string stdout)
        {
            if (string.IsNullOrWhiteSpace(stdout))
                throw new JsonException("Empty stdout received from Python process.");

            int jsonStartIndex = stdout.IndexOf('{');
            if (jsonStartIndex == -1)
                jsonStartIndex = stdout.IndexOf('[');

            if (jsonStartIndex >= 0)
            {
                string cleanJson = stdout.Substring(jsonStartIndex);
                return JsonSerializer.Deserialize<T>(cleanJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? throw new JsonException("JSON deserialization returned null.");
            }

            // Truncate raw output in error message to prevent massive log spam
            string safeRaw = stdout.Length > 200 ? stdout[..200] + "..." : stdout;
            throw new JsonException($"No valid JSON found in Python output. Raw start: {safeRaw}");
        }
    }
}
