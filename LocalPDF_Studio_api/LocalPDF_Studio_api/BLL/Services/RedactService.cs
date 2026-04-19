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
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public RedactService(ILogger<RedactService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<byte[]> RedactPdfAsync(RedactRequest request)
        {
            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_redacted.pdf");

            try
            {
                if (!File.Exists(request.File))
                    throw new FileNotFoundException($"File not found: {request.File}");

                ValidateRedactions(request.Redactions);
                _logger.LogInformation($"Starting Redaction. Redactions: {request.Redactions.Count}");

                var redactResult = await RunPythonRedactAsync(request, tempOutputPath);

                if (!redactResult.Success)
                    throw new Exception(redactResult.Error ?? "Unknown redaction error");

                return await File.ReadAllBytesAsync(tempOutputPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error redacting PDF: {FilePath}", request.File);
                throw;
            }
            finally
            {
                if (File.Exists(tempOutputPath))
                {
                    try { File.Delete(tempOutputPath); } catch { /* Cleanup silent */ }
                }
            }
        }

        private async Task<PythonRedactResult> RunPythonRedactAsync(RedactRequest request, string outputPath)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            // Create a temporary JSON file to pass redaction data safely
            var payload = new
            {
                file_path = request.File,
                output_path = outputPath,
                redactions = request.Redactions
            };

            string tempJsonFile = Path.GetTempFileName();

            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false
            };
            await File.WriteAllTextAsync(tempJsonFile, JsonSerializer.Serialize(payload, options));

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExePath,
                    // Use the 'redact' command pointing to the temp JSON file
                    Arguments = $"\"{_scriptPath}\" redact \"{tempJsonFile}\" --json",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

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
                    throw new Exception($"Redaction Failed (Code {process.ExitCode}): {stderr}");

                // Extract valid JSON from stdout (handles possible MuPDF xref warnings)
                string jsonPart = stdout;
                if (stdout.Contains("{") && stdout.Contains("}"))
                {
                    int startIndex = stdout.IndexOf('{');
                    int endIndex = stdout.LastIndexOf('}');
                    jsonPart = stdout.Substring(startIndex, (endIndex - startIndex) + 1);
                }

                return JsonSerializer.Deserialize<PythonRedactResult>(jsonPart, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                       ?? throw new Exception("Failed to parse redaction result");
            }
            finally
            {
                if (File.Exists(tempJsonFile)) File.Delete(tempJsonFile);
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
    }
}
