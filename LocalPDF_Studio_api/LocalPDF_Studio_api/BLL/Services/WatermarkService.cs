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
using LocalPDF_Studio_api.DAL.Models.WatermarkModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class WatermarkService : IWatermarkInterface
    {
        private readonly ILogger<WatermarkService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public WatermarkService(ILogger<WatermarkService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<byte[]> AddWatermarkAsync(WatermarkRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_watermarked.pdf");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Running Python Watermark. Engine: {_pythonExePath}");

                var watermarkResult = await RunPythonWatermarkAsync(request, tempOutputPath);

                if (!watermarkResult.Success)
                    throw new Exception(watermarkResult.Error ?? "Unknown Python watermark error");

                return await File.ReadAllBytesAsync(tempOutputPath);
            }
            finally
            {
                if (File.Exists(tempOutputPath))
                {
                    try { File.Delete(tempOutputPath); } catch { /* Ignore cleanup errors */ }
                }
            }
        }

        private async Task<PythonWatermarkResult> RunPythonWatermarkAsync(WatermarkRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            // Pass the .py script path as the first argument to the python executable
            var arguments = new List<string>
            {
                $"\"{_scriptPath}\"",
                "watermark",
                $"\"{request.FilePath}\"",
                $"\"{outputPath}\"",
                $"--watermark-type {request.WatermarkType}",
                $"--text \"{request.Text}\"",
                $"--position {request.Position}",
                $"--rotation {request.Rotation}",
                $"--opacity {request.Opacity}",
                $"--font-size {request.FontSize}",
                $"--text-color {request.TextColor}",
                $"--image-scale {request.ImageScale}",
                $"--start-page {request.StartPage}",
                $"--end-page {request.EndPage}",
                $"--pages-range {request.PagesRange}",
                "--json"
            };

            if (request.WatermarkType == "image" && !string.IsNullOrEmpty(request.ImagePath))
            {
                arguments.Add($"--image-path \"{request.ImagePath}\"");
            }

            if (!string.IsNullOrEmpty(request.CustomPages))
            {
                arguments.Add($"--custom-pages \"{request.CustomPages}\"");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            // Inject the vendor folder so PyMuPDF is found automatically
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
                return new PythonWatermarkResult { Success = false, Error = $"Exit {process.ExitCode}: {stderr}" };
            }

            try
            {
                return JsonSerializer.Deserialize<PythonWatermarkResult>(stdout, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? new PythonWatermarkResult { Success = false, Error = "Empty JSON output" };
            }
            catch (Exception ex)
            {
                return new PythonWatermarkResult { Success = false, Error = $"Parse Error: {ex.Message}. Raw: {stdout}" };
            }
        }
    }
}