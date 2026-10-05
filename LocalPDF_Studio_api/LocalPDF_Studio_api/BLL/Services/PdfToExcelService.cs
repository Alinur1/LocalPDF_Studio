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


using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.BLL.Utils;
using LocalPDF_Studio_api.DAL.Models.PdfToExcel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfToExcelService : IPdfToExcelInterface
    {
        private static readonly HashSet<string> AllowedFlavors = new(StringComparer.OrdinalIgnoreCase)
        {
            "auto",
            "lattice",
            "stream",
        };

        private static readonly HashSet<string> AllowedFormats = new(StringComparer.OrdinalIgnoreCase)
        {
            "xlsx",
            "csv",
        };

        private readonly ILogger<PdfToExcelService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public PdfToExcelService(ILogger<PdfToExcelService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<PdfToExcelOutcome> ConvertAsync(PdfToExcelRequest request)
        {
            if (!File.Exists(request.FilePath))
                throw new FileNotFoundException($"File not found: {request.FilePath}");

            var options = request.Options ?? new PdfToExcelOptions();
            var flavor = (options.Flavor ?? "auto").ToLowerInvariant();
            if (!AllowedFlavors.Contains(flavor))
                flavor = "auto";
            var format = (options.Format ?? "xlsx").ToLowerInvariant();
            if (!AllowedFormats.Contains(format))
                format = "xlsx";

            string extension = format == "csv" ? "zip" : "xlsx";
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_pdf_tables.{extension}");

            try
            {
                _logger.LogInformation("Starting PDF to Excel conversion: {FilePath} flavor={Flavor} format={Format}",
                    request.FilePath, flavor, format);

                var payload = new
                {
                    file_path = request.FilePath,
                    output_path = tempOutputPath,
                    pages = options.Pages,
                    page_ranges = options.PageRanges,
                    flavor,
                    format
                };
                string stdout = await RunPythonAsync("pdf_to_excel", payload);
                var result = PythonJsonParser.CleanAndDeserialize<PythonPdfToExcelResult>(stdout);

                if (!result.Success)
                    throw new Exception(result.Error ?? "Unknown table extraction error");

                if (!File.Exists(tempOutputPath))
                    throw new Exception("Table extraction output was not produced.");

                return new PdfToExcelOutcome
                {
                    FileBytes = await File.ReadAllBytesAsync(tempOutputPath),
                    Format = format,
                    TableCount = result.TableCount,
                    Notes = result.Notes ?? new List<string>(),
                };
            }
            finally
            {
                if (File.Exists(tempOutputPath))
                {
                    try { File.Delete(tempOutputPath); } catch { /* Cleanup silent */ }
                }
            }
        }

        private async Task<string> RunPythonAsync(string command, object payload)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            string tempJsonFile = Path.GetTempFileName();
            await File.WriteAllTextAsync(tempJsonFile, JsonSerializer.Serialize(payload));

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExePath,
                    Arguments = $"\"{_scriptPath}\" {command} \"{tempJsonFile}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                startInfo.EnvironmentVariables["PYTHONPATH"] = _vendorPath;

                using var process = new Process { StartInfo = startInfo };
                var outputBuilder = new System.Text.StringBuilder();
                var errorBuilder = new System.Text.StringBuilder();

                process.OutputDataReceived += (_, e) => { if (e.Data != null) outputBuilder.AppendLine(e.Data); };
                process.ErrorDataReceived += (_, e) => { if (e.Data != null) errorBuilder.AppendLine(e.Data); };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                await process.WaitForExitAsync();

                var stdout = outputBuilder.ToString().Trim();
                var stderr = errorBuilder.ToString().Trim();

                if (process.ExitCode != 0)
                    throw new Exception($"Table extraction Python process failed (Code {process.ExitCode}): {stderr}");

                return stdout;
            }
            finally
            {
                if (File.Exists(tempJsonFile)) File.Delete(tempJsonFile);
            }
        }
    }
}
