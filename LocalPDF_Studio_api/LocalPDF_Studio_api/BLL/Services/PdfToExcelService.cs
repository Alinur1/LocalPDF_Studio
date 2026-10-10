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
using LocalPDF_Studio_api.DAL.Models.PdfToExcel;
using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfToExcelService : IPdfToExcelInterface
    {
        private static readonly HashSet<string> AllowedFlavors = new(StringComparer.OrdinalIgnoreCase)
        {
            "auto",
            "lattice",
            "stream",
            "hybrid",
        };

        private static readonly HashSet<string> AllowedFormats = new(StringComparer.OrdinalIgnoreCase)
        {
            "xlsx",
            "csv",
        };

        private static readonly TimeSpan ExtractionTimeout = TimeSpan.FromMinutes(10);
        private readonly ILogger<PdfToExcelService> _logger;
        private readonly string _pythonExePath;
        private readonly string _scriptPath;
        private readonly string _vendorPath;

        public PdfToExcelService(ILogger<PdfToExcelService> logger)
        {
            _logger = logger;
            // AppContext.BaseDirectory should be '.../assets/backend_win/', '.../assets/backend_linux/' and '.../assets/backend_mac/'.
            var baseDir = AppContext.BaseDirectory;
            bool isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            _pythonExePath = Path.Combine(baseDir, "PyBackend", "Engine", isWindows ? "python.exe" : "bin/python3");
            _scriptPath = Path.Combine(baseDir, "PyBackend", "Scripts", "localpdf_studio_python.py");
            _vendorPath = Path.Combine(baseDir, "PyBackend", "vendor");
        }

        public async Task<PdfToExcelOutcome> ConvertAsync(PdfToExcelRequest request, CancellationToken cancellationToken = default)
        {
            if (!File.Exists(request.FilePath))
                throw new FileNotFoundException($"File not found: {request.FilePath}");

            var options = request.Options ?? new PdfToExcelOptions();
            var flavor = (options.Flavor ?? "auto").ToLowerInvariant();
            if (!AllowedFlavors.Contains(flavor))
                flavor = "auto";
            var format = (options.Format ?? "xlsx").ToLowerInvariant();
            if (!AllowedFormats.Contains(format))
                format = "xlsx";

            if (format == "csv")
                return await ConvertCsvAsync(request.FilePath, options, flavor, cancellationToken);

            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_pdf_tables.xlsx");
            // Python reports the real path it wrote; honor it (temp dir only).
            string actualPath = tempOutputPath;

            try
            {
                _logger.LogInformation("Starting PDF to Excel conversion: {FilePath} flavor={Flavor} format={Format} coerce={Coerce} merge={Merge}",
                    request.FilePath, flavor, format, options.CoerceNumbers, options.MergeContinuations);

                var payload = new
                {
                    file_path = request.FilePath,
                    output_path = tempOutputPath,
                    pages = options.Pages,
                    page_ranges = options.PageRanges,
                    flavor,
                    format,
                    coerce_numbers = options.CoerceNumbers,
                    merge_continuations = options.MergeContinuations
                };
                string stdout = await RunPythonAsync("pdf_to_excel", payload, cancellationToken);
                var result = PythonJsonParser.CleanAndDeserialize<PythonPdfToExcelResult>(stdout);

                if (!result.Success)
                    throw new Exception(result.Error ?? "Unknown table extraction error");

                // Honor the path Python actually wrote (temp dir only).
                if (!string.IsNullOrWhiteSpace(result.Output))
                {
                    try
                    {
                        var full = Path.GetFullPath(result.Output);
                        if (full.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)
                            && File.Exists(full))
                            actualPath = full;
                    }
                    catch { /* fall through to tempOutputPath check */ }
                }

                if (!File.Exists(actualPath))
                    throw new Exception("Table extraction output was not produced.");

                return new PdfToExcelOutcome
                {
                    FileBytes = await File.ReadAllBytesAsync(actualPath, cancellationToken),
                    Format = format,
                    OutputKind = "xlsx",
                    TableCount = result.TableCount,
                    Notes = result.Notes ?? new List<string>(),
                };
            }
            finally
            {
                foreach (var candidate in new[] { tempOutputPath, actualPath, tempOutputPath + ".part", actualPath + ".part" })
                {
                    try { if (File.Exists(candidate)) File.Delete(candidate); } catch { /* Cleanup silent */ }
                }
            }
        }

        private async Task<PdfToExcelOutcome> ConvertCsvAsync(string filePath, PdfToExcelOptions options, string flavor, CancellationToken cancellationToken)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_pdf_tables_csv");
            Directory.CreateDirectory(tempDir);

            try
            {
                _logger.LogInformation("Starting PDF to Excel conversion: {FilePath} flavor={Flavor} format=csv coerce={Coerce} merge={Merge}",
                    filePath, flavor, options.CoerceNumbers, options.MergeContinuations);

                var payload = new
                {
                    file_path = filePath,
                    output_path = tempDir,
                    pages = options.Pages,
                    page_ranges = options.PageRanges,
                    flavor,
                    format = "csv",
                    coerce_numbers = options.CoerceNumbers,
                    merge_continuations = options.MergeContinuations
                };
                string stdout = await RunPythonAsync("pdf_to_excel", payload, cancellationToken);
                var result = PythonJsonParser.CleanAndDeserialize<PythonPdfToExcelResult>(stdout);

                if (!result.Success)
                    throw new Exception(result.Error ?? "Unknown table extraction error");

                // Resolve the directory Python actually wrote (temp dir only).
                string actualDir = tempDir;
                if (!string.IsNullOrWhiteSpace(result.Output))
                {
                    try
                    {
                        var full = Path.GetFullPath(result.Output);
                        if (full.StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)
                            && Directory.Exists(full))
                            actualDir = full;
                    }
                    catch { /* fall through to tempDir */ }
                }

                var csvPaths = ResolveCsvPaths(actualDir, result.Files);
                if (csvPaths.Count == 0)
                    throw new Exception("Table extraction output was not produced.");

                byte[] zipBytes = CreateZipFromFiles(csvPaths);

                return new PdfToExcelOutcome
                {
                    FileBytes = zipBytes,
                    Format = "csv",
                    OutputKind = "zip",
                    TableCount = result.TableCount,
                    Notes = result.Notes ?? new List<string>(),
                };
            }
            finally
            {
                try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); } catch { /* Cleanup silent */ }
            }
        }

        private static List<string> ResolveCsvPaths(string directory, List<string>? reportedFiles)
        {
            var paths = new List<string>();

            if (reportedFiles != null && reportedFiles.Count > 0)
            {
                foreach (var name in reportedFiles)
                {
                    // Guard against path traversal: only accept basenames inside the temp dir.
                    var safeName = Path.GetFileName(name);
                    if (string.IsNullOrWhiteSpace(safeName))
                        continue;
                    var full = Path.Combine(directory, safeName);
                    if (File.Exists(full))
                        paths.Add(full);
                }
            }

            if (paths.Count == 0 && Directory.Exists(directory))
            {
                paths.AddRange(Directory.GetFiles(directory, "*.csv"));
                paths.Sort(StringComparer.OrdinalIgnoreCase);
            }

            return paths;
        }

        private static byte[] CreateZipFromFiles(List<string> csvPaths)
        {
            using var zipStream = new MemoryStream();
            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
            {
                foreach (var path in csvPaths)
                {
                    var entry = archive.CreateEntry(Path.GetFileName(path), CompressionLevel.Optimal);
                    using var entryStream = entry.Open();
                    using var fileStream = File.OpenRead(path);
                    fileStream.CopyTo(entryStream);
                }
            }
            return zipStream.ToArray();
        }

        private async Task<string> RunPythonAsync(string command, object payload, CancellationToken cancellationToken)
        {
            if (!File.Exists(_pythonExePath))
                throw new FileNotFoundException($"Python Engine not found: {_pythonExePath}");

            string tempJsonFile = Path.GetTempFileName();
            await File.WriteAllTextAsync(tempJsonFile, JsonSerializer.Serialize(payload));

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = _pythonExePath,
                    Arguments = $"\"{_scriptPath}\" {command} \"{tempJsonFile}\"",
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

                // Two independent reasons to stop waiting: the caller's token
                // (client disconnect / app shutdown) and the hard timeout.
                // Linked so either one cancels the wait.
                using var timeoutCts = new CancellationTokenSource(ExtractionTimeout);
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                try
                {
                    await process.WaitForExitAsync(linkedCts.Token);
                }
                catch (OperationCanceledException) when (!process.HasExited)
                {
                    // Kill the whole tree so a hung pdfplumber run cannot
                    // outlive the request as an orphaned CPU-spinning process.
                    try { process.Kill(entireProcessTree: true); }
                    catch (InvalidOperationException) { /* already gone */ }
                    catch (System.ComponentModel.Win32Exception) { /* already dying */ }

                    // Reap so the async output/error handlers finish and the
                    // process handle is released; ignore a second failure.
                    try { await process.WaitForExitAsync(CancellationToken.None); }
                    catch (OperationCanceledException) { /* give up reaping */ }

                    var killedStderr = errorBuilder.ToString().Trim();

                    if (cancellationToken.IsCancellationRequested)
                    {
                        throw new OperationCanceledException(
                            "Table extraction was cancelled.", cancellationToken);
                    }

                    _logger.LogWarning("Table extraction timed out after {Timeout} and was killed. Stderr tail: {Stderr}",
                        ExtractionTimeout, Truncate(killedStderr, 500));

                    throw new TimeoutException(
                        $"Table extraction timed out after {(int)ExtractionTimeout.TotalMinutes} minutes and was stopped. " +
                        "The PDF may contain a page the table engine cannot process. " +
                        "Try selecting specific pages, or a stricter flavor (lattice/stream/hybrid) instead of auto.");
                }

                var stdout = outputBuilder.ToString().Trim();
                var stderr = errorBuilder.ToString().Trim();

                if (process.ExitCode != 0)
                    throw new Exception($"Table extraction Python process failed (Code {process.ExitCode}): {stderr}");

                return stdout;
            }
            finally
            {
                if (File.Exists(tempJsonFile)) File.Delete(tempJsonFile);
            }
        }

        private static string Truncate(string s, int max) =>
            string.IsNullOrEmpty(s) ? s : (s.Length > max ? s[..max] + "..." : s);
    }
}
