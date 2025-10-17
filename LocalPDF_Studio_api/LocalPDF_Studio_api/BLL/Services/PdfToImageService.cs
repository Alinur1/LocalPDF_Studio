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
        private readonly string _pythonExecutablePath;

        public PdfToImageService(ILogger<PdfToImageService> logger)
        {
            _logger = logger;
            _pythonExecutablePath = GetPythonExecutablePath();
        }

        public async Task<byte[]> ConvertPdfToImagesAsync(PdfToImageRequest request)
        {
            string tempZipPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_pdf_images.zip");

            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting Python-based PDF → {request.Format.ToUpper()} conversion (DPI: {request.Dpi})");

                var conversionResult = await RunPythonConversionAsync(request, tempZipPath);

                if (!conversionResult.Success)
                    throw new Exception(conversionResult.Error ?? "Unknown Python conversion error");

                var zipBytes = await File.ReadAllBytesAsync(tempZipPath);
                _logger.LogInformation($"PDF successfully converted to images (ZIP size: {zipBytes.Length / 1024} KB)");

                return zipBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to images");
                throw;
            }
            finally
            {
                try
                {
                    if (File.Exists(tempZipPath))
                        File.Delete(tempZipPath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temp ZIP");
                }
            }
        }

        private async Task<PythonPdfToImageResult> RunPythonConversionAsync(PdfToImageRequest request, string outputZipPath)
        {
            if (!File.Exists(_pythonExecutablePath))
                throw new FileNotFoundException($"Python converter not found: {_pythonExecutablePath}");

            var arguments = new List<string>
            {
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

            var stdout = outputBuilder.ToString();
            var stderr = errorBuilder.ToString();

            _logger.LogDebug($"Python stdout: {stdout}");
            _logger.LogDebug($"Python stderr: {stderr}");

            try
            {
                var result = JsonSerializer.Deserialize<PythonPdfToImageResult>(stdout, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (result == null)
                    throw new Exception("Failed to parse JSON output from Python");

                return result;
            }
            catch (Exception ex)
            {
                return new PythonPdfToImageResult { Success = false, Error = $"JSON parse error: {ex.Message} | Raw: {stdout}" };
            }
        }

        private string GetPythonExecutablePath()
        {
            var baseDir = AppContext.BaseDirectory;
            string exeName;
            string platformFolder;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                exeName = "convert_pdf_images.exe";
                platformFolder = "backend_windows";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                exeName = "convert_pdf_images";
                platformFolder = "backend_linux";
            }
            else
            {
                exeName = "convert_pdf_images";
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
