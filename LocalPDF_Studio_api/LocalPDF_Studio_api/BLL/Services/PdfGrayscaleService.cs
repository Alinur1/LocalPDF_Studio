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
        private readonly string _pythonExecutablePath;

        public PdfGrayscaleService(ILogger<PdfGrayscaleService> logger)
        {
            _logger = logger;
            _pythonExecutablePath = GetPythonExecutablePath();
        }

        public async Task<byte[]> ConvertToGrayscaleAsync(GrayscaleRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_grayscale.pdf");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting PDF to grayscale conversion: {request.FilePath}");

                var grayscaleResult = await RunPythonGrayscaleAsync(request, tempOutputPath);

                if (!grayscaleResult.Success)
                    throw new Exception(grayscaleResult.Error ?? "Unknown Python grayscale conversion error");

                if (!File.Exists(tempOutputPath))
                    throw new FileNotFoundException("Grayscale PDF was not created");

                var pdfBytes = await File.ReadAllBytesAsync(tempOutputPath);
                _logger.LogInformation(
                    $"Grayscale conversion successful (PDF size: {pdfBytes.Length / 1024} KB, " +
                    $"Pages: {grayscaleResult.PageCount}, " +
                    $"Has Images: {grayscaleResult.HasImages}, " +
                    $"Has Vector: {grayscaleResult.HasVectorGraphics})");

                return pdfBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to grayscale. File: {FilePath}", request.FilePath);
                throw;
            }
            finally
            {
                try
                {
                    if (File.Exists(tempOutputPath))
                        File.Delete(tempOutputPath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temp PDF");
                }
            }
        }

        private async Task<PythonGrayscaleResult> RunPythonGrayscaleAsync(GrayscaleRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExecutablePath))
                throw new FileNotFoundException($"PDF grayscale tool not found: {_pythonExecutablePath}");

            var arguments = new List<string>
            {
                $"\"{request.FilePath}\"",
                $"\"{outputPath}\""
            };

            // Add custom pages argument
            if (!string.IsNullOrEmpty(request.CustomPages) && request.PagesRange == "custom")
            {
                arguments.Add($"--custom-pages \"{request.CustomPages}\"");
            }

            // Add image preservation flag
            if (!request.PreserveImages)
            {
                arguments.Add("--skip-images");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExecutablePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8
            };

            using var process = new Process { StartInfo = startInfo };
            var outputBuilder = new System.Text.StringBuilder();
            var errorBuilder = new System.Text.StringBuilder();

            process.OutputDataReceived += (_, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    outputBuilder.AppendLine(e.Data);
            };

            process.ErrorDataReceived += (_, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    errorBuilder.AppendLine(e.Data);

                    // Log progress messages if any
                    if (e.Data.StartsWith("PROGRESS:"))
                    {
                        _logger.LogDebug($"Grayscale conversion progress: {e.Data}");
                    }
                    else
                    {
                        _logger.LogDebug($"Python stderr: {e.Data}");
                    }
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // Wait with timeout (5 minutes for large files)
            var timeout = TimeSpan.FromMinutes(5);
            var completed = await Task.Run(() => process.WaitForExit((int)timeout.TotalMilliseconds));

            if (!completed)
            {
                try
                {
                    process.Kill();
                }
                catch { }

                return new PythonGrayscaleResult
                {
                    Success = false,
                    Error = $"Python process timed out after {timeout.TotalMinutes} minutes"
                };
            }

            var stdout = outputBuilder.ToString().Trim();
            var stderr = errorBuilder.ToString().Trim();

            _logger.LogDebug($"Python stdout: {stdout}");
            if (!string.IsNullOrEmpty(stderr) && !stderr.Contains("PROGRESS:"))
                _logger.LogWarning($"Python stderr: {stderr}");

            if (process.ExitCode != 0)
            {
                return new PythonGrayscaleResult
                {
                    Success = false,
                    Error = $"Python process exited with code {process.ExitCode}. Error: {stderr}"
                };
            }

            if (string.IsNullOrEmpty(stdout))
            {
                return new PythonGrayscaleResult
                {
                    Success = false,
                    Error = "Python process returned no output"
                };
            }

            try
            {
                var result = JsonSerializer.Deserialize<PythonGrayscaleResult>(stdout, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (result == null)
                    throw new Exception("Failed to parse JSON output from Python");

                return result;
            }
            catch (Exception ex)
            {
                return new PythonGrayscaleResult
                {
                    Success = false,
                    Error = $"JSON parse error: {ex.Message} | Raw stdout: {stdout} | Stderr: {stderr}"
                };
            }
        }

        private string GetPythonExecutablePath()
        {
            var baseDir = AppContext.BaseDirectory;
            string exeName;
            string platformFolder;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                exeName = "pdf_to_grayscale.exe";
                platformFolder = "backend_win";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                exeName = "pdf_to_grayscale";
                platformFolder = "backend_linux";
            }
            else
            {
                exeName = "pdf_to_grayscale";
                platformFolder = "backend_mac";
            }

            var possiblePaths = new[]
            {
                Path.Combine(baseDir, exeName),
                Path.Combine(baseDir, "scripts", exeName),
                Path.Combine(baseDir, "python", exeName),
                Path.Combine(baseDir, "..", "..", "assets", platformFolder, "scripts", exeName),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Executables", exeName)
            };

            foreach (var path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    _logger.LogInformation($"Found Python executable at: {path}");
                    return path;
                }
            }

            _logger.LogWarning($"Python executable not found, using default: {possiblePaths[0]}");
            return possiblePaths[0];
        }
    }
}
