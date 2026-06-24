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



                // Derive the PDF's name - PDF Steam (filename without extension)
                var pdfStem = Path.GetFileNameWithoutExtension(request.FilePath);

                // Use a temporary folder for conversion output instead of user-specified folder
                var tempRoot = Path.Combine(Path.GetTempPath(), "LocalPDF_Studio", Guid.NewGuid().ToString());
                var outputSubFolder = Path.Combine(tempRoot, pdfStem);
                // Ensure the temporary output directory exists
                Directory.CreateDirectory(outputSubFolder);
                // No folder-exists conflict check needed for temporary locations


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

            var startInfo = new ProcessStartInfo
            {
                FileName = _pythonExePath,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8,
            };

            // Using ArgumentList instead of Arguments string so paths with spaces are passed correctly without any manual quoting.
            startInfo.ArgumentList.Add(_scriptPath);
            startInfo.ArgumentList.Add("pdf_to_markdown");
            startInfo.ArgumentList.Add(request.FilePath);
            startInfo.ArgumentList.Add(outputSubFolder);
            startInfo.ArgumentList.Add(pdfStem);

            if (!request.IncludeImages) startInfo.ArgumentList.Add("--no-images");
            if (!request.StripHeader) startInfo.ArgumentList.Add("--keep-header");
            if (!request.StripFooter) startInfo.ArgumentList.Add("--keep-footer");

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
            {
                _logger.LogError("Python process failed with ExitCode {Code}. Stderr: {Stderr}", process.ExitCode, stderr);
                return Failure($"Python exited with code {process.ExitCode}. See logs for details.");
            }

            if (string.IsNullOrEmpty(stdout))
                return Failure("Python process produced no output.");

            try
            {
                var lines = stdout.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                var jsonLine = lines.FirstOrDefault(line => line.TrimStart().StartsWith('{'));

                if (string.IsNullOrEmpty(jsonLine))
                {
                    return Failure("Python output did not contain a valid JSON result.");
                }

                return JsonSerializer.Deserialize<PythonMarkdownResult>(jsonLine,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                    ?? Failure("Failed to deserialize Python response.");
            }
            catch (JsonException ex)
            {
                return Failure($"JSON parse error: {ex.Message}");
            }
        }

        private static PythonMarkdownResult Failure(string error) =>
            new() { Success = false, Error = error };

        private static void TryKill(Process process)
        {
            try { process.Kill(); } catch { /* best-effort */ }
        }
    }
}
