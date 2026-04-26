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
using LocalPDF_Studio_api.DAL.Models.PDFGrayscale;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfGrayscaleService : IPdfGrayscaleInterface
    {
        private readonly ILogger<PdfGrayscaleService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public PdfGrayscaleService(ILogger<PdfGrayscaleService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<byte[]> ConvertToGrayscaleAsync(GrayscaleRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_grayscale.pdf");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting Grayscale conversion. Engine: {_pythonExePath}");

                var grayscaleResult = await RunPythonGrayscaleAsync(request, tempOutputPath);

                if (!grayscaleResult.Success)
                    throw new Exception(grayscaleResult.Error ?? "Unknown Python grayscale conversion error");

                return await File.ReadAllBytesAsync(tempOutputPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to grayscale. File: {FilePath}", request.FilePath);
                throw;
            }
            finally
            {
                if (File.Exists(tempOutputPath))
                {
                    try { File.Delete(tempOutputPath); } catch { /* Ignore cleanup errors */ }
                }
            }
        }

        private async Task<PythonGrayscaleResult> RunPythonGrayscaleAsync(GrayscaleRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            var arguments = new List<string>
            {
                $"\"{_scriptPath}\"",
                "grayscale",
                $"\"{request.FilePath}\"",
                $"\"{outputPath}\""
            };

            if (!string.IsNullOrEmpty(request.CustomPages) && request.PagesRange == "custom")
                arguments.Add($"--custom-pages \"{request.CustomPages}\"");

            // Add conversion mode
            var mode = string.IsNullOrWhiteSpace(request.ConversionMode) ? "vector" : request.ConversionMode.ToLower();
            if (mode == "raster")
                arguments.Add("--mode raster");
            // else, default is vector

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8
            };

            // Inject the vendor folder for PyMuPDF/Ghostscript dependencies
            startInfo.EnvironmentVariables["PYTHONPATH"] = _vendorPath;

            using var process = new Process { StartInfo = startInfo };
            var outputBuilder = new System.Text.StringBuilder();
            var errorBuilder = new System.Text.StringBuilder();

            process.OutputDataReceived += (_, e) => { if (e.Data != null) outputBuilder.AppendLine(e.Data); };
            process.ErrorDataReceived += (_, e) =>
            {
                if (e.Data != null)
                {
                    errorBuilder.AppendLine(e.Data);
                    if (e.Data.StartsWith("PROGRESS:")) _logger.LogDebug($"Grayscale Progress: {e.Data}");
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // 5-minute timeout for heavy PDFs
            var timeout = TimeSpan.FromMinutes(5);
            var completed = await process.WaitForExitAsync(new CancellationTokenSource(timeout).Token).ContinueWith(t => !t.IsCanceled);

            if (!completed)
            {
                try { process.Kill(); } catch { }
                return new PythonGrayscaleResult { Success = false, Error = "Python process timed out" };
            }

            var stdout = outputBuilder.ToString().Trim();
            var stderr = errorBuilder.ToString().Trim();

            if (process.ExitCode != 0)
                return new PythonGrayscaleResult { Success = false, Error = $"Exit {process.ExitCode}: {stderr}" };

            try
            {
                return JsonSerializer.Deserialize<PythonGrayscaleResult>(stdout, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? throw new Exception("Empty result from Python");
            }
            catch (Exception ex)
            {
                return new PythonGrayscaleResult { Success = false, Error = $"JSON Error: {ex.Message}. Raw: {stdout}" };
            }
        }
    }
}