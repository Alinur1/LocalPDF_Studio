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
using System.Text.Json.Serialization;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Enums;
using LocalPDF_Studio_api.DAL.Models.CompressPdfModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfCompressService : IPdfCompressInterface
    {
        private readonly string _pythonExecutablePath;

        public PdfCompressService()
        {
            // Determine the path to the Python executable based on the OS
            _pythonExecutablePath = GetPythonExecutablePath();
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
                    // Run Python compression script
                    var compressionResult = await RunPythonCompressionAsync(
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
                            // Ignore cleanup errors
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

        private async Task<PythonCompressionResult> RunPythonCompressionAsync(
            string inputPath,
            string outputPath,
            CompressOptions options)
        {
            Console.WriteLine($"=== PYTHON SCRIPT DEBUG ===");
            Console.WriteLine($"Executable path: {_pythonExecutablePath}");
            Console.WriteLine($"Exists? {File.Exists(_pythonExecutablePath)}");

            if (!File.Exists(_pythonExecutablePath))
            {
                var error = $"Python compression executable not found at: {_pythonExecutablePath}";
                Console.WriteLine($"ERROR: {error}");
                throw new FileNotFoundException(error);
            }

            // Build command-line arguments
            var qualityValue = options.GetQualityValue();
            var arguments = new List<string>
            {
                $"\"{inputPath}\"",
                $"\"{outputPath}\"",
                $"--quality {qualityValue}",
                "--json"
            };

            if (options.RemoveMetadata)
            {
                arguments.Add("--remove-metadata");
            }

            if (options.RemoveUnusedObjects)
            {
                arguments.Add("--remove-unused");
            }

            var argumentString = string.Join(" ", arguments);
            Console.WriteLine($"Arguments: {argumentString}");

            // Create process start info
            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExecutablePath,
                Arguments = argumentString,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(_pythonExecutablePath)
            };

            try
            {
                using var process = new Process { StartInfo = startInfo };

                // Capture output
                var outputBuilder = new System.Text.StringBuilder();
                var errorBuilder = new System.Text.StringBuilder();

                process.OutputDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        outputBuilder.AppendLine(e.Data);
                    }
                };

                process.ErrorDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        errorBuilder.AppendLine(e.Data);
                    }
                };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                // Wait for the process to complete with timeout (2 minutes)
                await process.WaitForExitAsync();

                // Give a bit of time for output buffers to flush
                await Task.Delay(100);

                var output = outputBuilder.ToString();
                var errorOutput = errorBuilder.ToString();

                Console.WriteLine($"Python stdout: {output}");
                Console.WriteLine($"Python stderr: {errorOutput}");
                Console.WriteLine($"Exit code: {process.ExitCode}");

                // Parse JSON output
                try
                {
                    var option = new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true,
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase, // ← ADD THIS
                        UnmappedMemberHandling = JsonUnmappedMemberHandling.Skip // ← ADD THIS if using .NET 7+
                    };

                    Console.WriteLine($"Raw Python output: '{output}'");

                    var result = JsonSerializer.Deserialize<PythonCompressionResult>(output, option);
                    Console.WriteLine($"Deserialized - Success: {result?.Success}, OriginalSize: {result?.OriginalSize}");
                    if (result != null)
                    {
                        return result;
                    }
                }
                catch (JsonException ex)
                {
                    Console.WriteLine($"JSON Parse Error: {ex.Message}");
                    // If JSON parsing fails, treat as error
                }

                // If we get here, something went wrong
                return new PythonCompressionResult
                {
                    Success = false,
                    Error = !string.IsNullOrEmpty(errorOutput)
                        ? errorOutput
                        : "Unknown error during compression"
                };
            }
            catch (Exception ex)
            {
                return new PythonCompressionResult
                {
                    Success = false,
                    Error = $"Failed to run compression script: {ex.Message}"
                };
            }
        }

        private string GetPythonExecutablePath()
        {
            // Get the base directory where the API is running
            var baseDirectory = AppContext.BaseDirectory;

            // Determine OS-specific executable name and path
            string executableName;
            string platformFolder;

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                executableName = "compress_pdf.exe";
                platformFolder = "backend_win";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                executableName = "compress_pdf";
                platformFolder = "backend_linux";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                executableName = "compress_pdf";
                platformFolder = "backend_macos";
            }
            else
            {
                throw new PlatformNotSupportedException("Unsupported operating system");
            }

            // The executable should be in the same directory as the API executable
            // Or in a scripts/python subdirectory
            var possiblePaths = new[]
            {
                Path.Combine(baseDirectory, executableName),
                Path.Combine(baseDirectory, "scripts", executableName),
                Path.Combine(baseDirectory, "python", executableName),
                Path.Combine(baseDirectory, "..", "..", "assets", platformFolder, "scripts", executableName)
            };

            foreach (var path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    return path;
                }
            }

            // If not found, return the first path (will throw error later)
            return possiblePaths[0];
        }
    }
}
