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
using LocalPDF_Studio_api.DAL.Models.PdfExtractImages;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfExtractImagesService : IPdfExtractImagesInterface
    {
        private readonly ILogger<PdfExtractImagesService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public PdfExtractImagesService(ILogger<PdfExtractImagesService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<byte[]> ProcessImagesAsync(PdfExtractImagesRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation($"Starting Image Processing Mode: {request.Options.Mode}");

                var pythonResult = await RunPythonImageProcessingAsync(request);

                if (!pythonResult.Success)
                    throw new Exception(pythonResult.Error ?? "Unknown Python image processing error");

                if (request.Options.Mode == "extract")
                {
                    if (pythonResult.Images == null || pythonResult.Images.Count == 0)
                        return CreateEmptyZip();

                    return CreateZipFromImages(pythonResult.Images);
                }
                else // remove mode
                {
                    if (string.IsNullOrEmpty(pythonResult.PdfData))
                        throw new Exception("No PDF data returned from image removal");

                    return Convert.FromBase64String(pythonResult.PdfData);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing images in PDF");
                throw;
            }
        }

        private async Task<PythonImageResult> RunPythonImageProcessingAsync(PdfExtractImagesRequest request)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            var pythonRequest = new
            {
                file_path = request.FilePath,
                pages = request.Options.Pages,
                page_ranges = request.Options.PageRanges,
                mode = request.Options.Mode
            };

            string jsonRequest = JsonSerializer.Serialize(pythonRequest);
            string tempJsonFile = Path.GetTempFileName();
            await File.WriteAllTextAsync(tempJsonFile, jsonRequest);

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExePath,
                    Arguments = $"\"{_scriptPath}\" extract_images \"{tempJsonFile}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                // Allow Python to find PyMuPDF/Pillow
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
                    throw new Exception($"Python Process Failed (Code {process.ExitCode}): {stderr}");

                return JsonSerializer.Deserialize<PythonImageResult>(stdout, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? throw new Exception("Failed to parse Python JSON output");
            }
            finally
            {
                if (File.Exists(tempJsonFile)) File.Delete(tempJsonFile);
            }
        }

        private byte[] CreateZipFromImages(List<PythonImage> images)
        {
            using var memoryStream = new System.IO.MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                foreach (var image in images)
                {
                    var imageData = Convert.FromBase64String(image.Data);
                    var extension = image.Format.ToLower() == "jpg" ? "jpg" : "png";
                    var fileName = $"page_{image.Page}_image_{image.Index:D4}.{extension}";

                    var entry = archive.CreateEntry(fileName, System.IO.Compression.CompressionLevel.NoCompression);
                    using var entryStream = entry.Open();
                    entryStream.Write(imageData, 0, imageData.Length);
                }
            }
            return memoryStream.ToArray();
        }

        private byte[] CreateEmptyZip()
        {
            using var memoryStream = new System.IO.MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                // Create a readme file explaining no images were found
                var entry = archive.CreateEntry("no_images_found.txt", System.IO.Compression.CompressionLevel.NoCompression);
                using var writer = new System.IO.StreamWriter(entry.Open());
                writer.WriteLine("No images were found in the specified pages.");
                writer.WriteLine("This could mean:");
                writer.WriteLine("- The PDF contains no images");
                writer.WriteLine("- The selected pages contain no images");
                writer.WriteLine("- The images are in a format that couldn't be extracted");
            }
            return memoryStream.ToArray();
        }
    }
}
