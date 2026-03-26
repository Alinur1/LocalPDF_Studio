using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfToPdfaService : IPdfToPdfaInterface
    {
        private readonly IGhostscriptInterface _ghostscriptInterface;

        public PdfToPdfaService(IGhostscriptInterface ghostscriptInterface)
        {
            _ghostscriptInterface = ghostscriptInterface;
        }

        public async Task<bool> IsConversionAvailableAsync()
        {
            return await _ghostscriptInterface.IsGhostscriptAvailableAsync();
        }

        public async Task<PdfaResult> ConvertToPdfaAsync(string filePath, PdfaOptions options)
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException($"File not found: {filePath}");

            if (options == null)
                throw new ArgumentNullException(nameof(options), "PDF/A options cannot be null");

            var validLevels = new[] { "pdfa1b", "pdfa1a", "pdfa2b", "pdfa2a", "pdfa3b" };
            if (!validLevels.Contains(options.ConformanceLevel?.ToLower()))
                throw new ArgumentException($"Invalid conformance level: {options.ConformanceLevel}");

            if (!await IsConversionAvailableAsync())
            {
                return new PdfaResult
                {
                    Success = false,
                    Error = "Ghostscript is not available. Please install Ghostscript to use PDF/A conversion."
                };
            }

            string tempOutputPath = Path.Combine(
                Path.GetTempPath(),
                $"pdfa_{Guid.NewGuid()}.pdf"
            );

            try
            {
                var conversionResult = await RunGhostscriptConversionAsync(filePath, tempOutputPath, options);

                if (!conversionResult.Success)
                {
                    return new PdfaResult
                    {
                        Success = false,
                        Error = conversionResult.Error ?? "Unknown conversion error"
                    };
                }

                byte[] convertedData = await File.ReadAllBytesAsync(tempOutputPath);

                return new PdfaResult
                {
                    Success = true,
                    ConvertedData = convertedData,
                    ConformanceLevel = options.ConformanceLevel
                };
            }
            catch (Exception ex)
            {
                return new PdfaResult
                {
                    Success = false,
                    Error = $"Error converting PDF to PDF/A: {ex.Message}"
                };
            }
            finally
            {
                if (File.Exists(tempOutputPath))
                {
                    try { File.Delete(tempOutputPath); } catch { /* ignore cleanup errors */ }
                }
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Core conversion
        // ─────────────────────────────────────────────────────────────────────

        private async Task<PdfaResult> RunGhostscriptConversionAsync(
            string inputPath,
            string outputPath,
            PdfaOptions options)
        {
            string? tempDefFile = null;

            try
            {
                var processName = GetGhostscriptProcessName();
                var iccProfile = await FindSrgbIccProfile(processName);

                if (string.IsNullOrEmpty(iccProfile))
                {
                    return new PdfaResult
                    {
                        Success = false,
                        Error = "Could not locate the sRGB ICC color profile (srgb.icc) required for PDF/A " +
                                "conversion. Please ensure Ghostscript is fully installed."
                    };
                }

                tempDefFile = Path.Combine(Path.GetTempPath(), $"PDFA_def_{Guid.NewGuid()}.ps");
                await WritePdfaDefinitionFile(tempDefFile, iccProfile, options);

                // Use ArgumentList — each entry is passed as a discrete OS argument,
                // which correctly handles spaces in paths on ALL platforms without
                // any manual quote wrapping.
                var startInfo = new ProcessStartInfo
                {
                    FileName = processName,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                startInfo.ArgumentList.Add("-dNOPAUSE");
                startInfo.ArgumentList.Add("-dBATCH");
                // -dNOSAFER: In GS 9.50+ SAFER mode is the default and restricts
                // file I/O to a permitted path list. Our temp PDFA_def.ps sits in
                // the system temp dir which is outside that list, causing an
                // "Unrecoverable error". -dNOSAFER disables this restriction.
                // This is safe here because of full control all input files.
                startInfo.ArgumentList.Add("-dNOSAFER");
                startInfo.ArgumentList.Add("-sDEVICE=pdfwrite");
                startInfo.ArgumentList.Add($"-dPDFA={GetPdfaVersion(options.ConformanceLevel!)}");
                startInfo.ArgumentList.Add("-dPDFACompatibilityPolicy=1");
                startInfo.ArgumentList.Add("-sColorConversionStrategy=RGB");
                startInfo.ArgumentList.Add("-dEmbedAllFonts=true");
                startInfo.ArgumentList.Add($"-dSubsetFonts={(options.SubsetFonts ? "true" : "false")}");
                startInfo.ArgumentList.Add($"-sOutputFile={outputPath}");
                // PDFA_def.ps MUST come before the input PDF in the argument list
                startInfo.ArgumentList.Add(tempDefFile);
                startInfo.ArgumentList.Add(inputPath);

                Console.WriteLine($"[PDFA_DEBUG] Process: {processName}");
                Console.WriteLine($"[PDFA_DEBUG] Arguments:");
                foreach (var arg in startInfo.ArgumentList)
                    Console.WriteLine($"[PDFA_DEBUG]   {arg}");

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var stdoutTask = process.StandardOutput.ReadToEndAsync();
                var stderrTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                var stdout = await stdoutTask;
                var stderr = await stderrTask;

                Console.WriteLine($"[PDFA_DEBUG] Exit code: {process.ExitCode}");
                if (!string.IsNullOrWhiteSpace(stdout))
                    Console.WriteLine($"[PDFA_DEBUG] STDOUT: {stdout.Trim()}");
                if (!string.IsNullOrWhiteSpace(stderr))
                    Console.WriteLine($"[PDFA_DEBUG] STDERR: {stderr.Trim()}");

                if (process.ExitCode == 0 && File.Exists(outputPath))
                    return new PdfaResult { Success = true };

                return new PdfaResult
                {
                    Success = false,
                    Error = $"Ghostscript exited with code {process.ExitCode}. Details: {stderr}"
                };
            }
            catch (Exception ex)
            {
                return new PdfaResult
                {
                    Success = false,
                    Error = $"Failed to run Ghostscript: {ex.Message}"
                };
            }
            finally
            {
                if (tempDefFile != null && File.Exists(tempDefFile))
                    try { File.Delete(tempDefFile); } catch { /* ignore */ }
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // PDFA_def.ps generation
        // ─────────────────────────────────────────────────────────────────────

        private async Task WritePdfaDefinitionFile(
            string defFilePath,
            string iccProfilePath,
            PdfaOptions options)
        {
            // PostScript requires forward slashes even on Windows
            var escapedIcc = iccProfilePath.Replace("\\", "/");

            // Keep every line flush-left — PostScript can be sensitive to
            // unexpected whitespace before tokens.
            var content =
                "%!PS-Adobe-3.0\n" +
                "[ /Title ()\n" +
                "  /DOCINFO pdfmark\n" +
                "\n" +
                "[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark\n" +
                "[{icc_PDFA} << /N 3 >> /PUT pdfmark\n" +
                "[{icc_PDFA} (" + escapedIcc + ") (r) file /PUT pdfmark\n" +
                "\n" +
                "[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark\n" +
                "[{OutputIntent_PDFA} <<\n" +
                "  /Type /OutputIntent\n" +
                "  /S /GTS_PDFA1\n" +
                "  /DestOutputProfile {icc_PDFA}\n" +
                "  /OutputConditionIdentifier (sRGB)\n" +
                ">> /PUT pdfmark\n" +
                "\n" +
                "[{Catalog} <<\n" +
                "  /OutputIntents [{OutputIntent_PDFA}]\n" +
                ">> /PUT pdfmark\n";

            Console.WriteLine($"[PDFA_DEBUG] Writing PDFA_def.ps to: {defFilePath}");
            Console.WriteLine($"[PDFA_DEBUG] PDFA_def.ps content:\n{content}");

            await File.WriteAllTextAsync(defFilePath, content);
        }

        // ─────────────────────────────────────────────────────────────────────
        // srgb.icc discovery — 4 strategies, platform-aware
        // ─────────────────────────────────────────────────────────────────────

        private async Task<string?> FindSrgbIccProfile(string ghostscriptProcessName)
        {
            var baseDir = AppContext.BaseDirectory;            
            string[] searchPaths = {
                Path.Combine(baseDir, "assets", "common", "iccprofiles", "srgb.icc"),
                Path.Combine(baseDir, "..", "assets", "common", "iccprofiles", "srgb.icc"),
                Path.Combine(baseDir, "..", "..", "assets", "common", "iccprofiles", "srgb.icc"),
                Path.Combine(baseDir, "..", "..", "..", "assets", "common", "iccprofiles", "srgb.icc")
            };

            foreach (var path in searchPaths)
            {
                var normalizedPath = Path.GetFullPath(path);
                if (File.Exists(normalizedPath))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Found bundled srgb.icc at: {normalizedPath}");
                    return normalizedPath;
                }
            }

            Console.WriteLine("[PDFA_DEBUG] srgb.icc not found in bundled common assets.");
            return null;
        }

        /// <summary>
        /// Follows symlinks to their real target. Essential on macOS Homebrew
        /// where /usr/local/bin/gs → /usr/local/Cellar/ghostscript/x.x.x/bin/gs.
        /// Without this, walking up from /usr/local/bin/ never reaches the
        /// Cellar tree where iccprofiles/ actually lives.
        /// </summary>
        private static string ResolveSymlink(string path)
        {
            try
            {
                var info = new FileInfo(path);
                if (info.LinkTarget != null)
                {
                    var target = info.LinkTarget;
                    // LinkTarget may be relative — resolve against the symlink's directory
                    if (!Path.IsPathRooted(target))
                        target = Path.GetFullPath(
                            Path.Combine(Path.GetDirectoryName(path)!, target));

                    Console.WriteLine($"[PDFA_DEBUG] Symlink {path} -> {target}");
                    // Recurse to handle chained symlinks
                    return ResolveSymlink(target);
                }
                return path;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] ResolveSymlink failed for {path}: {ex.Message}");
                return path;
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Helpers
        // ─────────────────────────────────────────────────────────────────────

        private static int GetPdfaVersion(string conformanceLevel)
        {
            return conformanceLevel.ToLower() switch
            {
                "pdfa1a" or "pdfa1b" => 1,
                "pdfa2a" or "pdfa2b" => 2,
                "pdfa3b" => 3,
                _ => 1
            };
        }

        private string GetGhostscriptProcessName()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return "gswin64c.exe";

            // Bundled GS (snap / packaged Linux builds)
            var bundledGs = Path.Combine(
                AppContext.BaseDirectory, "compiled-ghostscript", "bin", "gs");
            if (File.Exists(bundledGs))
            {
                Console.WriteLine($"[PDFA_DEBUG] Using bundled Ghostscript: {bundledGs}");
                return bundledGs;
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                // Return the symlink path — ResolveSymlink() will follow it to
                // the real Cellar path when needed for icc discovery.
                if (File.Exists("/opt/homebrew/bin/gs")) return "/opt/homebrew/bin/gs";
                if (File.Exists("/usr/local/bin/gs")) return "/usr/local/bin/gs";
            }

            return "gs";
        }
    }
}