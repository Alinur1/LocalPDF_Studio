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
using LocalPDF_Studio_api.DAL.Models.RedactPdf;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class RedactService : IRedactInterface
    {
        private readonly ILogger<RedactService> _logger;
        private readonly string _pythonExecutablePath;

        public RedactService(ILogger<RedactService> logger)
        {
            _logger = logger;
            _pythonExecutablePath = GetPythonExecutablePath();
        }

        public async Task<byte[]> RedactPdfAsync(RedactRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_redacted.pdf");

            try
            {
                // Validate input
                if (string.IsNullOrWhiteSpace(request.File))
                    throw new ArgumentException("File path is required");

                if (!File.Exists(request.File))
                    throw new FileNotFoundException($"File not found: {request.File}");

                if (request.Redactions == null || request.Redactions.Count == 0)
                    throw new ArgumentException("At least one redaction area is required");

                // Validate redaction areas
                ValidateRedactions(request.Redactions);

                _logger.LogInformation($"Starting PDF redaction: {request.File}, Redactions: {request.Redactions.Count}");

                // Run Python redaction script
                var redactResult = await RunPythonRedactAsync(request, tempOutputPath);

                if (!redactResult.Success)
                    throw new Exception(redactResult.Error ?? "Unknown redaction error");

                if (!File.Exists(tempOutputPath))
                    throw new FileNotFoundException("Redacted PDF was not created");

                // Read and return the redacted PDF
                var pdfBytes = await File.ReadAllBytesAsync(tempOutputPath);

                _logger.LogInformation(
                    $"Redaction successful - Size: {pdfBytes.Length / 1024} KB, " +
                    $"Total Redactions: {redactResult.TotalRedactions}, " +
                    $"Pages Redacted: {redactResult.PagesRedacted}"
                );

                return pdfBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error redacting PDF: {FilePath}", request.File);
                throw;
            }
            finally
            {
                // Clean up temporary file
                try
                {
                    if (File.Exists(tempOutputPath))
                        File.Delete(tempOutputPath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temporary redacted PDF");
                }
            }
        }

        private void ValidateRedactions(List<RedactionArea> redactions)
        {
            for (int i = 0; i < redactions.Count; i++)
            {
                var redact = redactions[i];

                if (redact.Page < 1)
                    throw new ArgumentException($"Redaction {i}: Page number must be >= 1");

                if (redact.X < 0 || redact.X > 1)
                    throw new ArgumentException($"Redaction {i}: X coordinate must be between 0 and 1");

                if (redact.Y < 0 || redact.Y > 1)
                    throw new ArgumentException($"Redaction {i}: Y coordinate must be between 0 and 1");

                if (redact.Width <= 0 || redact.Width > 1)
                    throw new ArgumentException($"Redaction {i}: Width must be between 0 and 1");

                if (redact.Height <= 0 || redact.Height > 1)
                    throw new ArgumentException($"Redaction {i}: Height must be between 0 and 1");

                if (redact.X + redact.Width > 1)
                    throw new ArgumentException($"Redaction {i}: X + Width exceeds page boundary");

                if (redact.Y + redact.Height > 1)
                    throw new ArgumentException($"Redaction {i}: Y + Height exceeds page boundary");

                if (string.IsNullOrWhiteSpace(redact.Color))
                    throw new ArgumentException($"Redaction {i}: Color is required");

                if (!IsValidHexColor(redact.Color))
                    throw new ArgumentException($"Redaction {i}: Invalid hex color format");
            }
        }

        private bool IsValidHexColor(string color)
        {
            if (string.IsNullOrWhiteSpace(color))
                return false;

            color = color.Trim();
            if (!color.StartsWith("#"))
                return false;

            if (color.Length != 7) // #RRGGBB
                return false;

            return color.Substring(1).All(c =>
                (c >= '0' && c <= '9') ||
                (c >= 'A' && c <= 'F') ||
                (c >= 'a' && c <= 'f')
            );
        }

        private async Task<PythonRedactResult> RunPythonRedactAsync(RedactRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExecutablePath))
                throw new FileNotFoundException($"Python redaction tool not found: {_pythonExecutablePath}");

            // Serialize redactions to JSON
            var redactionsJson = JsonSerializer.Serialize(request.Redactions, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            // Build command arguments
            var arguments = new List<string>
            {
                "redact",
                $"\"{request.File}\"",
                $"\"{outputPath}\"",
                $"--redactions \"{redactionsJson.Replace("\"", "\\\"")}\"",
                "--json"
            };

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

            // Check exit code
            if (process.ExitCode != 0)
            {
                return new PythonRedactResult
                {
                    Success = false,
                    Error = $"Python process exited with code {process.ExitCode}. Error: {stderr}"
                };
            }

            if (string.IsNullOrEmpty(stdout))
            {
                return new PythonRedactResult
                {
                    Success = false,
                    Error = "Python process returned no output"
                };
            }

            string jsonPart = stdout;
            if (stdout.Contains("{") && stdout.Contains("}"))
            {
                // Find the boundaries of the JSON object to ignore MuPDF's "xref" warnings
                int startIndex = stdout.IndexOf('{');
                int endIndex = stdout.LastIndexOf('}');
                jsonPart = stdout.Substring(startIndex, (endIndex - startIndex) + 1);
            }

            // Parse JSON result
            try
            {
                var result = JsonSerializer.Deserialize<PythonRedactResult>(stdout, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });

                if (result == null)
                    throw new Exception("Failed to parse JSON output from Python");

                return result;
            }
            catch (Exception ex)
            {
                return new PythonRedactResult
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
                exeName = "localpdf_studio_python.exe";
                platformFolder = "backend_win";
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                exeName = "localpdf_studio_python";
                platformFolder = "backend_linux";
            }
            else
            {
                exeName = "localpdf_studio_python";
                platformFolder = "backend_mac";
            }

            var possiblePaths = new[]
            {
                Path.Combine(baseDir, exeName),
                Path.Combine(baseDir, "scripts", exeName),
                Path.Combine(baseDir, "python", exeName),
                Path.Combine(baseDir, "..", "..", "assets", platformFolder, "scripts", exeName)
            };

            foreach (var path in possiblePaths)
            {
                if (File.Exists(path))
                {
                    _logger.LogInformation($"Found Python redaction executable at: {path}");
                    return path;
                }
            }

            _logger.LogWarning($"Python redaction executable not found, using default path: {possiblePaths[0]}");
            return possiblePaths[0];
        }
    }
}
