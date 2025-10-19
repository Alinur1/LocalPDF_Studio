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
        private readonly string _pythonExecutablePath;

        public WatermarkService(ILogger<WatermarkService> logger)
        {
            _logger = logger;
            _pythonExecutablePath = GetPythonExecutablePath();
        }

        public async Task<byte[]> AddWatermarkAsync(WatermarkRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_watermarked.pdf");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting Python-based watermark addition: {request.FilePath}, Type: {request.WatermarkType}");

                var watermarkResult = await RunPythonWatermarkAsync(request, tempOutputPath);

                if (!watermarkResult.Success)
                    throw new Exception(watermarkResult.Error ?? "Unknown Python watermark error");

                if (!File.Exists(tempOutputPath))
                    throw new FileNotFoundException("Watermarked PDF was not created");

                var pdfBytes = await File.ReadAllBytesAsync(tempOutputPath);
                _logger.LogInformation($"Watermark successfully added (PDF size: {pdfBytes.Length / 1024} KB, Pages: {watermarkResult.WatermarkedPages})");

                return pdfBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding watermark to PDF. File: {FilePath}, Type: {WatermarkType}",
                    request.FilePath, request.WatermarkType);
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

        private async Task<PythonWatermarkResult> RunPythonWatermarkAsync(WatermarkRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExecutablePath))
                throw new FileNotFoundException($"Python watermark tool not found: {_pythonExecutablePath}");

            var arguments = new List<string>
            {
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
                arguments.Add($"--custom-pages \"{request.CustomPages}\"");

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExecutablePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
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
                    errorBuilder.AppendLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();

            var stdout = outputBuilder.ToString().Trim();
            var stderr = errorBuilder.ToString().Trim();

            _logger.LogDebug($"Python stdout: {stdout}");
            if (!string.IsNullOrEmpty(stderr))
                _logger.LogWarning($"Python stderr: {stderr}");

            if (process.ExitCode != 0)
            {
                return new PythonWatermarkResult
                {
                    Success = false,
                    Error = $"Python process exited with code {process.ExitCode}. Error: {stderr}"
                };
            }
            if (string.IsNullOrEmpty(stdout))
            {
                return new PythonWatermarkResult
                {
                    Success = false,
                    Error = "Python process returned no output"
                };
            }
            try
            {
                var result = JsonSerializer.Deserialize<PythonWatermarkResult>(stdout, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (result == null)
                    throw new Exception("Failed to parse JSON output from Python");

                return result;
            }
            catch (Exception ex)
            {
                return new PythonWatermarkResult
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
                exeName = "add_watermark.exe";
                platformFolder = "backend_windows";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                exeName = "add_watermark";
                platformFolder = "backend_linux";
            }
            else
            {
                exeName = "add_watermark";
                platformFolder = "backend_macos";
            }

            var possiblePaths = new[]
            {
                Path.Combine(baseDir, exeName),
                Path.Combine(baseDir, "scripts", exeName),
                Path.Combine(baseDir, "python", exeName),
                Path.Combine(baseDir, "..", "..", "assets", platformFolder, "scripts", exeName)
            };

            foreach (var path in possiblePaths)
                if (File.Exists(path)) return path;

            return possiblePaths[0];
        }
    }
}
