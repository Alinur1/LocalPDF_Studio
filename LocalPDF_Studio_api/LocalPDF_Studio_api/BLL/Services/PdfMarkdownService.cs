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
using LocalPDF_Studio_api.DAL.Models.PDFMarkdown;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfMarkdownService : IPdfMarkdownInterface
    {
        private readonly ILogger<PdfMarkdownService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        private static readonly TimeSpan ProcessTimeout = TimeSpan.FromMinutes(10);

        public PdfMarkdownService(ILogger<PdfMarkdownService> logger)
        {
            _logger = logger;
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<PythonMarkdownResult> ConvertToMarkdownAsync(PdfMarkdownRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                if (string.IsNullOrWhiteSpace(request.OutputFolder))
                    throw new ArgumentException("Output folder must be provided.");

                // Derive the PDF's name - PDF Steam (filename without extension)
                var pdfStem = Path.GetFileNameWithoutExtension(request.FilePath);

                // Create the output subfolder: <OutputFolder>/<pdfName>/
                var outputSubFolder = Path.Combine(request.OutputFolder, pdfStem);
                Directory.CreateDirectory(outputSubFolder);

                _logger.LogInformation(
                    "Starting PDF to Markdown conversion: {FilePath} → {Folder}",
                    request.FilePath, outputSubFolder);

                var result = await RunPythonAsync(request, outputSubFolder, pdfStem);

                if (result.MissingDependencies?.Count > 0)
                    _logger.LogWarning("Missing optional dependencies: {Deps}",
                        string.Join(", ", result.MissingDependencies));

                if (result.Success)
                    _logger.LogInformation(
                        "Markdown conversion complete — Pages: {Pages}, Assets: {Assets}",
                        result.Meta?.PageCount ?? 0,
                        result.Meta?.AssetCount ?? 0);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error converting PDF to Markdown: {FilePath}", request.FilePath);
                throw;
            }
        }

        private async Task<PythonMarkdownResult> RunPythonAsync(PdfMarkdownRequest request, string outputSubFolder, string pdfStem)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python engine not found: {_pythonExePath}");

            if (!File.Exists(_scriptPath))
                throw new FileNotFoundException($"Python script not found: {_scriptPath}");

            var arguments = BuildArguments(request, outputSubFolder, pdfStem);

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExePath,
                Arguments = string.Join(" ", arguments),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8,
            };

            startInfo.EnvironmentVariables["PYTHONPATH"] = _vendorPath;

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
                if (string.IsNullOrEmpty(e.Data)) return;
                errorBuilder.AppendLine(e.Data);

                if (e.Data.StartsWith("PROGRESS_JSON:"))
                    _logger.LogDebug("Markdown progress: {Data}", e.Data);
                else
                    _logger.LogDebug("Python stderr: {Data}", e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            var completed = await Task.Run(() =>
                process.WaitForExit((int)ProcessTimeout.TotalMilliseconds));

            if (!completed)
            {
                TryKill(process);
                return Failure($"Python process timed out after {ProcessTimeout.TotalMinutes} minutes");
            }

            var stdout = outputBuilder.ToString().Trim();
            var stderr = errorBuilder.ToString().Trim();

            if (process.ExitCode != 0)
                return Failure($"Python exited with code {process.ExitCode}. stderr: {stderr}");

            if (string.IsNullOrEmpty(stdout))
                return Failure("Python process produced no output");

            try
            {
                var result = JsonSerializer.Deserialize<PythonMarkdownResult>(stdout,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                return result ?? Failure("Failed to deserialize Python response");
            }
            catch (Exception ex)
            {
                return Failure(
                    $"JSON parse error: {ex.Message} | stdout (first 500): " +
                    $"{stdout[..Math.Min(500, stdout.Length)]}");
            }
        }

        private List<string> BuildArguments(PdfMarkdownRequest request, string outputSubFolder, string pdfStem)
        {
            var args = new List<string>
            {
                $"\"{_scriptPath}\"",
                "pdf_to_markdown",
                $"\"{request.FilePath}\"",
                $"\"{outputSubFolder}\"",
                $"\"{pdfStem}\"",
            };

            if (!request.IncludeImages) args.Add("--no-images");
            if (!request.StripHeader) args.Add("--keep-header");
            if (!request.StripFooter) args.Add("--keep-footer");

            return args;
        }

        private static PythonMarkdownResult Failure(string error) =>
            new() { Success = false, Error = error };

        private static void TryKill(Process process)
        {
            try { process.Kill(); } catch { /* best-effort */ }
        }
    }
}
