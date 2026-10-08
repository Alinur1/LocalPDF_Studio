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
using LocalPDF_Studio_api.BLL.Utils;
using LocalPDF_Studio_api.DAL.Models.PdfBlankDuplicate;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfBlankDuplicateService : IPdfBlankDuplicateInterface
    {
        private const int DefaultTimeoutSeconds = 300;

        private static readonly HashSet<string> AllowedPresets = new(StringComparer.OrdinalIgnoreCase)
        {
            "strict",
            "balanced",
            "lenient",
        };

        private readonly ILogger<PdfBlankDuplicateService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;
        private readonly int _timeoutSeconds;

        public PdfBlankDuplicateService(ILogger<PdfBlankDuplicateService> logger, IConfiguration configuration)
        {
            _logger = logger;
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
            _timeoutSeconds = int.TryParse( configuration?["PdfScan:TimeoutSeconds"], out var seconds) && seconds > 0 ? seconds : DefaultTimeoutSeconds;
        }

        public async Task<PdfBlankDuplicateScanResult> ScanAsync(PdfBlankDuplicateScanRequest request, CancellationToken cancellationToken = default)
        {
            if (!File.Exists(request.FilePath))
                throw new FileNotFoundException($"File not found: {request.FilePath}");

            var preset = (request.Preset ?? "balanced").ToLowerInvariant();
            if (!AllowedPresets.Contains(preset))
                preset = "balanced";

            var stopwatch = Stopwatch.StartNew();
            _logger.LogInformation("Starting page analysis: {FilePath} preset={Preset}", request.FilePath, preset);

            var payload = new { file_path = request.FilePath, preset };
            string stdout = await RunPythonAsync("blank_duplicate_scan", payload, cancellationToken);

            var result = PythonJsonParser.CleanAndDeserialize<PdfBlankDuplicateScanResult>(stdout);
            _logger.LogInformation( "Page analysis finished in {Elapsed}ms: {Blanks} blanks, {Groups} duplicate groups", stopwatch.ElapsedMilliseconds, result.Blanks?.Count ?? 0, result.Groups?.Count ?? 0);
            return result;
        }

        private async Task<string> RunPythonAsync(string command, object payload, CancellationToken cancellationToken)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            string tempJsonFile = Path.GetTempFileName();
            await File.WriteAllTextAsync(tempJsonFile, JsonSerializer.Serialize(payload), cancellationToken);

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExePath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                };
                // ArgumentList quotes each argument safely (spaces in paths).
                startInfo.ArgumentList.Add(_scriptPath);
                startInfo.ArgumentList.Add(command);
                startInfo.ArgumentList.Add(tempJsonFile);

                startInfo.EnvironmentVariables["PYTHONPATH"] = _vendorPath;
                startInfo.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
                startInfo.EnvironmentVariables["PYTHONUTF8"] = "1";
                // The user's site-packages must never shadow the vendored libs.
                startInfo.EnvironmentVariables["PYTHONNOUSERSITE"] = "1";

                using var process = new Process { StartInfo = startInfo };
                var outputBuilder = new StringBuilder();
                var errorBuilder = new StringBuilder();
                process.OutputDataReceived += (_, e) => { if (e.Data != null) outputBuilder.AppendLine(e.Data); };
                process.ErrorDataReceived += (_, e) => { if (e.Data != null) errorBuilder.AppendLine(e.Data); };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_timeoutSeconds));
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource( cancellationToken, timeoutCts.Token);
                try
                {
                    await process.WaitForExitAsync(linkedCts.Token);
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    KillProcessTree(process);
                    throw new TimeoutException(
                        $"Page analysis did not complete within {_timeoutSeconds}s. " +
                        "Try the 'strict' preset, a lower render DPI, or a smaller document.");
                }
                catch (OperationCanceledException)
                {
                    KillProcessTree(process); // caller cancelled (client gone)
                    throw;
                }

                process.WaitForExit();

                var stdout = outputBuilder.ToString().Trim();
                var stderr = errorBuilder.ToString().Trim();

                if (process.ExitCode != 0)
                    throw new InvalidOperationException($"Python process failed (exit {process.ExitCode}): {Truncate(stderr)}");

                return stdout;
            }
            finally
            {
                try { if (File.Exists(tempJsonFile)) File.Delete(tempJsonFile); }
                catch { /* best effort */ }
            }
        }

        private static void KillProcessTree(Process process)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch { /* racing normal exit */ }
        }

        private static string Truncate(string value) =>
            value.Length > 500 ? value[..500] + "..." : value;
    }
}