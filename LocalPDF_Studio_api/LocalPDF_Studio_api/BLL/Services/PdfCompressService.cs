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
using LocalPDF_Studio_api.DAL.Enums;
using LocalPDF_Studio_api.DAL.Models.CompressPdfModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfCompressService : IPdfCompressInterface
    {
        private readonly IGhostscriptInterface _ghostscriptInterface;

        public PdfCompressService(IGhostscriptInterface ghostscriptInterface)
        {
            _ghostscriptInterface = ghostscriptInterface;
        }

        public async Task<bool> IsCompressionAvailableAsync()
        {
            return await _ghostscriptInterface.IsGhostscriptAvailableAsync();
        }

        public async Task<CompressResult> CompressPdfAsync(string filePath, CompressOptions options)
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException($"File not found: {filePath}");

            if (options == null)
                throw new ArgumentNullException(nameof(options), "Compress options cannot be null");

            // Validate custom quality if using custom mode
            if (options.Quality == CompressionQuality.Custom)
            {
                if (!options.CustomQuality.HasValue || options.CustomQuality.Value < 1 || options.CustomQuality.Value > 100)
                    throw new ArgumentException("Custom quality must be between 1 and 100");
            }

            // Check if Ghostscript is available before proceeding
            if (!await IsCompressionAvailableAsync())
            {
                return new CompressResult
                {
                    Success = false,
                    Error = "Ghostscript is not available. Please install Ghostscript to use compression features."
                };
            }

            try
            {
                // Get original file size
                var originalFileInfo = new FileInfo(filePath);
                long originalSize = originalFileInfo.Length;

                // Create temporary output path
                string tempOutputPath = Path.Combine(
                    Path.GetTempPath(),
                    $"compressed_{Guid.NewGuid()}.pdf"
                );

                try
                {
                    // Run Ghostscript compression
                    var compressionResult = await RunGhostscriptCompressionAsync(
                        filePath,
                        tempOutputPath,
                        options
                    );

                    if (!compressionResult.Success)
                    {
                        return new CompressResult
                        {
                            Success = false,
                            Error = compressionResult.Error ?? "Unknown compression error"
                        };
                    }

                    // Read the compressed file
                    byte[] compressedData = await File.ReadAllBytesAsync(tempOutputPath);
                    long compressedSize = compressedData.Length;

                    // Calculate compression ratio
                    double compressionRatio = originalSize > 0
                        ? ((double)(originalSize - compressedSize) / originalSize) * 100
                        : 0;

                    return new CompressResult
                    {
                        Success = true,
                        CompressedData = compressedData,
                        OriginalSize = originalSize,
                        CompressedSize = compressedSize,
                        CompressionRatio = Math.Round(compressionRatio, 2)
                    };
                }
                finally
                {
                    // Clean up temporary file
                    if (File.Exists(tempOutputPath))
                    {
                        try
                        {
                            File.Delete(tempOutputPath);
                        }
                        catch
                        {
                            // Ignoring cleanup errors
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                return new CompressResult
                {
                    Success = false,
                    Error = $"Error compressing PDF: {ex.Message}"
                };
            }
        }

        private async Task<CompressResult> RunGhostscriptCompressionAsync(
            string inputPath,
            string outputPath,
            CompressOptions options)
        {
            try
            {
                var ghostscriptCommand = BuildGhostscriptCommand(inputPath, outputPath, options);
                var processName = GetGhostscriptProcessName();

                var startInfo = new ProcessStartInfo
                {
                    FileName = processName,
                    Arguments = ghostscriptCommand,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var output = await process.StandardOutput.ReadToEndAsync();
                var error = await process.StandardError.ReadToEndAsync();

                await process.WaitForExitAsync();

                if (process.ExitCode == 0 && File.Exists(outputPath))
                {
                    return new CompressResult { Success = true };
                }
                else
                {
                    return new CompressResult
                    {
                        Success = false,
                        Error = $"Ghostscript compression failed. Exit code: {process.ExitCode}. Error: {error}"
                    };
                }
            }
            catch (Exception ex)
            {
                return new CompressResult
                {
                    Success = false,
                    Error = $"Failed to run Ghostscript compression: {ex.Message}"
                };
            }
        }

        private string BuildGhostscriptCommand(string inputPath, string outputPath, CompressOptions options)
        {
            var quality = options.GetQualityValue();
            var dpi = quality >= 80 ? "150" : quality >= 60 ? "120" : "96";

            var commands = new List<string>
            {
                    "-dNOPAUSE",
                    "-dBATCH",
                    "-dSAFER",

                    // Force PDFSharp compatibility
                    "-dCompatibilityLevel=1.7",
                    "-dCompressObjects=false",
                    "-dAvoidBinarySnippets=true",
                    "-dDetectDuplicateImages=false",

                    "-sDEVICE=pdfwrite",

                    // Keep quality profiles
                    $"-dPDFSETTINGS=/{GetPdfSettings(options.Quality)}",

                    // Font settings
                    "-dEmbedAllFonts=true",
                    "-dSubsetFonts=true",

                    // Image downsampling
                    $"-dColorImageDownsampleType=/Bicubic",
                    $"-dColorImageResolution={dpi}",
                    $"-dGrayImageDownsampleType=/Bicubic",
                    $"-dGrayImageResolution={dpi}",
                    $"-dMonoImageDownsampleType=/Bicubic",
                    $"-dMonoImageResolution={dpi}",

                    // Image filters — important for PDFSharp
                    "-dColorImageFilter=/FlateEncode",
                    "-dGrayImageFilter=/FlateEncode",
                    "-dMonoImageFilter=/FlateEncode",

                    // Output file
                    $"-sOutputFile=\"{outputPath}\"",

                    $"\"{inputPath}\""
            };

            return string.Join(" ", commands);
        }

        private string GetPdfSettings(CompressionQuality quality)
        {
            return quality switch
            {
                CompressionQuality.High => "prepress",    // High quality, color preserving
                CompressionQuality.Medium => "ebook",     // Medium quality
                CompressionQuality.Low => "screen",       // Low quality, smallest size
                CompressionQuality.Custom => "ebook",     // Default for custom
                _ => "ebook"
            };
        }

        private string GetGhostscriptProcessName()
        {
            Console.WriteLine("Checking for windows ghostscript [PdfCompressService]");
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return "gswin64c.exe";
            }                
            Console.WriteLine("Checking finished for windows ghostscript [PdfCompressService]");
            // Linux/macOS fallback
            string baseDir = AppContext.BaseDirectory;
            Console.WriteLine("Checking for bundled ghostscript base directory for snap [PdfCompressService]" + baseDir);
            string bundledGs = Path.Combine(
                baseDir,
                "compiled-ghostscript/bin/gs"
            );
            Console.WriteLine("Searching finished for bundled ghostscript for snap [PdfCompressService]"  + bundledGs);
            // Use bundled if present
            if (System.IO.File.Exists(bundledGs))
            {
                Console.WriteLine("Using bundled ghostscript" + bundledGs);
                return bundledGs;   
            }
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                string homebrewArm = "/opt/homebrew/bin/gs";
                string homebrewIntel = "/usr/local/bin/gs";

                if (File.Exists(homebrewArm))
                {
                    Console.WriteLine("Using Homebrew ghostscript at (ARM) " + homebrewArm);
                    return homebrewArm;
                }

                if (File.Exists(homebrewIntel))
                {
                    Console.WriteLine("Using Homebrew ghostscript at (Intel) " + homebrewIntel);
                    return homebrewIntel;
                }
            }

            Console.WriteLine("Using system ghostscript.");
            return "gs";
        }
    }
}