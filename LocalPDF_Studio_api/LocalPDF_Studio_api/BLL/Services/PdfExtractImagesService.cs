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
        private readonly string _pythonExecutablePath;

        public PdfExtractImagesService(ILogger<PdfExtractImagesService> logger)
        {
            _logger = logger;
            _pythonExecutablePath = GetPythonExecutablePath();
        }

        public async Task<byte[]> ProcessImagesAsync(PdfExtractImagesRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                if (request.Options == null)
                    throw new ArgumentException("Options are required");

                _logger.LogInformation($"Starting Python-based image processing: {request.FilePath}, Mode: {request.Options.Mode}");

                var pythonResult = await RunPythonImageProcessingAsync(request);

                if (!pythonResult.Success)
                {
                    var errorMsg = pythonResult.Error ?? "Unknown Python image processing error";
                    _logger.LogError($"Python processing failed: {errorMsg}");
                    throw new Exception(errorMsg);
                }

                if (request.Options.Mode == "extract")
                {
                    if (pythonResult.Images == null || pythonResult.Images.Count == 0)
                    {
                        _logger.LogWarning("No images found to extract");
                        // Return empty zip instead of error
                        return CreateEmptyZip();
                    }

                    _logger.LogInformation($"Successfully extracted {pythonResult.ExtractedCount} images from {pythonResult.ProcessedPages} pages");
                    return CreateZipFromImages(pythonResult.Images);
                }
                else // remove mode
                {
                    _logger.LogInformation($"DEBUG: PdfData length: {pythonResult.PdfData?.Length ?? 0}");
                    _logger.LogInformation($"DEBUG: First 100 chars of PdfData: {pythonResult.PdfData?.Substring(0, Math.Min(100, pythonResult.PdfData.Length))}");

                    if (string.IsNullOrEmpty(pythonResult.PdfData))
                    {
                        _logger.LogError("No PDF data returned from image removal");
                        throw new Exception("No PDF data returned from image removal");
                    }

                    try
                    {
                        var pdfBytes = Convert.FromBase64String(pythonResult.PdfData);
                        _logger.LogInformation($"DEBUG: Converted to {pdfBytes.Length} bytes");
                        _logger.LogInformation($"Successfully removed images from {pythonResult.ProcessedPages} pages. PDF size: {pdfBytes.Length} bytes");
                        return pdfBytes;
                    }
                    catch (FormatException ex)
                    {
                        _logger.LogError($"Invalid base64 PDF data: {ex.Message}");
                        _logger.LogInformation($"DEBUG: PdfData sample: {pythonResult.PdfData?.Substring(0, Math.Min(200, pythonResult.PdfData.Length))}");
                        throw new Exception("Invalid PDF data returned from image removal");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing images in PDF");
                throw new Exception($"Error processing images: {ex.Message}", ex);
            }
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

        private async Task<PythonImageResult> RunPythonImageProcessingAsync(PdfExtractImagesRequest request)
        {
            if (!File.Exists(_pythonExecutablePath))
                throw new FileNotFoundException($"Python image tool not found: {_pythonExecutablePath}");

            var pythonRequest = new
            {
                file_path = request.FilePath,
                pages = request.Options.Pages,
                page_ranges = request.Options.PageRanges,
                mode = request.Options.Mode
            };

            var jsonRequest = JsonSerializer.Serialize(pythonRequest);

            // Write JSON to a temporary file to avoid command line escaping issues
            var tempJsonFile = Path.GetTempFileName();
            await File.WriteAllTextAsync(tempJsonFile, jsonRequest);

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExecutablePath,
                    Arguments = $"\"{tempJsonFile}\"", // Pass the temp file path instead of raw JSON
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(_pythonExecutablePath)
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

                _logger.LogInformation($"Starting Python process: {startInfo.FileName} {startInfo.Arguments}");
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                await process.WaitForExitAsync();

                var stdout = outputBuilder.ToString().Trim();
                var stderr = errorBuilder.ToString().Trim();

                _logger.LogDebug($"Python stdout: {stdout}");
                if (!string.IsNullOrEmpty(stderr))
                    _logger.LogWarning($"Python stderr: {stderr}");

                if (string.IsNullOrEmpty(stdout))
                {
                    throw new Exception("Python process returned no output");
                }

                try
                {
                    //_logger.LogInformation($"Raw Python output: {stdout}");
                    var result = JsonSerializer.Deserialize<PythonImageResult>(stdout, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (result == null)
                        throw new Exception("Failed to parse JSON output from Python");

                    return result;
                }
                catch (JsonException ex)
                {
                    _logger.LogError($"JSON parse error. Raw output: {stdout}");
                    throw new Exception($"JSON parse error: {ex.Message}. Raw output: {stdout}");
                }
            }
            finally
            {
                // Clean up temp file
                try
                {
                    if (File.Exists(tempJsonFile))
                        File.Delete(tempJsonFile);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete temp JSON file");
                }
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

        private string GetPythonExecutablePath()
        {
            var baseDir = AppContext.BaseDirectory;
            string exeName;
            string platformFolder;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                exeName = "extract_images.exe";
                platformFolder = "backend_win";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                exeName = "extract_images";
                platformFolder = "backend_linux";
            }
            else
            {
                exeName = "extract_images";
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
