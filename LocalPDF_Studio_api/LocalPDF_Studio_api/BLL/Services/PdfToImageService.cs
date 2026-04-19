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


using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.PdfToImageModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfToImageService : IPdfToImageInterface
    {
        private readonly ILogger<PdfToImageService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public PdfToImageService(ILogger<PdfToImageService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<byte[]> ConvertPdfToImagesAsync(PdfToImageRequest request)
        {
            string tempZipPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_pdf_images.zip");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting Python-based conversion: {request.FilePath} -> {request.Format.ToUpper()}");

                var conversionResult = await RunPythonConversionAsync(request, tempZipPath);

                if (!conversionResult.Success)
                    throw new Exception(conversionResult.Error ?? "Unknown Python conversion error");

                return await File.ReadAllBytesAsync(tempZipPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to images");
                throw;
            }
            finally
            {
                if (File.Exists(tempZipPath))
                {
                    try { File.Delete(tempZipPath); } catch { /* Ignore cleanup errors */ }
                }
            }
        }

        private async Task<PythonPdfToImageResult> RunPythonConversionAsync(PdfToImageRequest request, string outputZipPath)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            // Arguments list updated to include the script path and command
            var arguments = new List<string>
            {
                $"\"{_scriptPath}\"",
                "convert_pdf_images",
                $"\"{request.FilePath}\"",
                $"\"{outputZipPath}\"",
                $"--dpi {request.Dpi}",
                $"--format {request.Format.ToLower()}",
                "--json"
            };

            if (request.IncludePageNumbers)
                arguments.Add("--include-page-numbers");

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            // Set PYTHONPATH so the engine can find the libraries in the vendor folder
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
            {
                return new PythonPdfToImageResult { Success = false, Error = $"Process Exit {process.ExitCode}: {stderr}" };
            }

            try
            {
                return JsonSerializer.Deserialize<PythonPdfToImageResult>(stdout, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? throw new Exception("Empty result from Python");
            }
            catch (Exception ex)
            {
                return new PythonPdfToImageResult { Success = false, Error = $"JSON Error: {ex.Message} | Raw: {stdout}" };
            }
        }
    }
}