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
            // ── Strategy 1 ─────────────────────────────────────────────
            // For bundled GS (snap / AppImage / packaged builds), the iccprofiles
            // folder is always relative to the GS binary — check this immediately
            // before anything else so this strategy never wastes time on GS subprocess calls
            // against a bundled binary that may not support .genpath or findlibfile.
            //
            // Covers snap layout:
            //   compiled-ghostscript/bin/gs
            //   compiled-ghostscript/share/ghostscript/<version>/iccprofiles/srgb.icc
            if (Path.IsPathRooted(ghostscriptProcessName) && File.Exists(ghostscriptProcessName))
            {
                var icc = SearchIccRelativeToBinary(ghostscriptProcessName);
                if (!string.IsNullOrEmpty(icc))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc relative to bundled binary: {icc}");
                    return icc;
                }
            }

            // ── Strategy 2 ───────────────────────────────────────────────────
            // Ask GS to print its full lib search path via .genpath.
            // Works on standard GS 9.x and 10.x installs on all platforms.
            // NOTE: Compiled/bundled GS builds (snap) may not support .genpath —
            // if it fails it will fall through cleanly.
            var genPathResult = await FindIccViaGenPath(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(genPathResult))
            {
                Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via .genpath: {genPathResult}");
                return genPathResult;
            }

            // ── Strategy 3 ───────────────────────────────────────────────────
            // Ask GS to locate srgb.icc on its own search path using findlibfile.
            var findLibResult = await FindIccViaFindLibFile(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(findLibResult) && File.Exists(findLibResult))
            {
                Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via findlibfile: {findLibResult}");
                return findLibResult;
            }

            // ── Strategy 4 ───────────────────────────────────────────────────
            // Resolve the real executable path (following symlinks — critical
            // for Homebrew on macOS where /usr/local/bin/gs symlinks into the
            // Cellar tree) then walk up the directory tree.
            var execPath = await GetGhostscriptExecutablePath(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(execPath))
            {
                var resolvedExec = ResolveSymlink(execPath);
                Console.WriteLine($"[PDFA_DEBUG] Resolved GS executable: {resolvedExec}");

                // Also run the relative-to-binary search on the resolved path
                // in case the original path was a symlink (macOS Homebrew)
                var iccFromResolved = SearchIccRelativeToBinary(resolvedExec);
                if (!string.IsNullOrEmpty(iccFromResolved))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc relative to resolved binary: {iccFromResolved}");
                    return iccFromResolved;
                }
            }

            // ── Strategy 4 ───────────────────────────────────────────────────
            // Last resort: well-known versioned install paths per platform.
            var wellKnown = FindIccInWellKnownPaths();
            if (!string.IsNullOrEmpty(wellKnown))
            {
                Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via well-known paths: {wellKnown}");
                return wellKnown;
            }

            Console.WriteLine("[PDFA_DEBUG] srgb.icc not found via any strategy.");
            return null;
        }

        /// <summary>
        /// Given the full path to a GS binary, walks up the directory tree
        /// looking for iccprofiles/srgb.icc in all known layouts:
        ///
        ///   bin/gs  →  ../iccprofiles/srgb.icc                  (simple bundled)
        ///   bin/gs  →  ../share/ghostscript/iccprofiles/         (some builds)
        ///   bin/gs  →  ../share/ghostscript/<version>/iccprofiles/ (snap / autotools install)
        ///   bin/gs  →  ../../share/ghostscript/<version>/iccprofiles/ (Homebrew Cellar)
        ///
        /// Walks up to 6 levels — enough for any real-world layout.
        /// </summary>
        private static string? SearchIccRelativeToBinary(string binaryPath)
        {
            var current = Path.GetDirectoryName(binaryPath);

            for (int level = 0; level < 6; level++)
            {
                if (current == null) break;

                Console.WriteLine($"[PDFA_DEBUG] SearchIccRelativeToBinary level {level}: {current}");

                // 1. Direct: <dir>/iccprofiles/srgb.icc
                var direct = Path.Combine(current, "iccprofiles", "srgb.icc");
                if (File.Exists(direct)) return direct;

                // 2. <dir>/share/ghostscript/iccprofiles/srgb.icc (non-versioned)
                var shareGsDir = Path.Combine(current, "share", "ghostscript");
                if (Directory.Exists(shareGsDir))
                {
                    var nonVersioned = Path.Combine(shareGsDir, "iccprofiles", "srgb.icc");
                    if (File.Exists(nonVersioned)) return nonVersioned;

                    // 3. <dir>/share/ghostscript/<version>/iccprofiles/srgb.icc (versioned)
                    try
                    {
                        foreach (var vDir in Directory.GetDirectories(shareGsDir))
                        {
                            var versioned = Path.Combine(vDir, "iccprofiles", "srgb.icc");
                            if (File.Exists(versioned)) return versioned;
                        }
                    }
                    catch { /* unreadable — skip */ }
                }

                // 4. Scan immediate subdirectories for iccprofiles/
                //    (covers Homebrew Cellar sibling layout)
                try
                {
                    foreach (var sub in Directory.GetDirectories(current, "*", SearchOption.TopDirectoryOnly))
                    {
                        var subIcc = Path.Combine(sub, "iccprofiles", "srgb.icc");
                        if (File.Exists(subIcc)) return subIcc;
                    }
                }
                catch { /* unreadable — skip */ }

                current = Path.GetDirectoryName(current);
            }

            return null;
        }

        /// <summary>
        /// Runs GS with .genpath to get its full lib search path, then looks for
        /// srgb.icc adjacent to each entry. Works on standard GS 9.x and 10.x.
        /// Returns null cleanly if the operator is unsupported (bundled/compiled GS).
        /// </summary>
        private async Task<string?> FindIccViaGenPath(string ghostscriptProcessName)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = ghostscriptProcessName,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                startInfo.ArgumentList.Add("-dNODISPLAY");
                startInfo.ArgumentList.Add("-dNOSAFER");
                startInfo.ArgumentList.Add("-q");
                startInfo.ArgumentList.Add("-c");
                startInfo.ArgumentList.Add(".genpath ==");
                startInfo.ArgumentList.Add("-c");
                startInfo.ArgumentList.Add("quit");

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                var rawOutput = (await outputTask).Trim();
                var rawError = (await errorTask).Trim();

                Console.WriteLine($"[PDFA_DEBUG] .genpath raw output: {rawOutput}");

                // If GS printed an error (e.g. /undefined in .genpath) — bail out cleanly
                if (string.IsNullOrWhiteSpace(rawOutput) ||
                    rawOutput.Contains("/undefined") ||
                    rawOutput.Contains("Error:"))
                {
                    Console.WriteLine("[PDFA_DEBUG] .genpath not supported or failed — skipping.");
                    return null;
                }

                // Output looks like: (path1:path2:path3) on Unix
                //                or (path1;path2;path3) on Windows
                var cleaned = rawOutput.Trim('(', ')');
                var separator = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? ';' : ':';
                var paths = cleaned.Split(separator, StringSplitOptions.RemoveEmptyEntries);

                foreach (var entry in paths)
                {
                    var trimmed = entry.Trim();
                    if (string.IsNullOrEmpty(trimmed)) continue;

                    Console.WriteLine($"[PDFA_DEBUG] .genpath entry: {trimmed}");

                    // srgb.icc may be in iccprofiles/ relative to the lib entry
                    // or 1–2 levels up from a Resource/ subdirectory.
                    var candidates = new[]
                    {
                        Path.Combine(trimmed, "iccprofiles", "srgb.icc"),
                        Path.Combine(trimmed, "..",   "iccprofiles", "srgb.icc"),
                        Path.Combine(trimmed, "..", "..", "iccprofiles", "srgb.icc"),
                    };

                    foreach (var candidate in candidates)
                    {
                        try
                        {
                            var normalized = Path.GetFullPath(candidate);
                            if (File.Exists(normalized))
                                return normalized;
                        }
                        catch { /* invalid path — skip */ }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] FindIccViaGenPath failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Asks GS to resolve srgb.icc via its own findlibfile operator.
        /// Returns null cleanly if unsupported.
        /// </summary>
        private async Task<string?> FindIccViaFindLibFile(string ghostscriptProcessName)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = ghostscriptProcessName,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                startInfo.ArgumentList.Add("-dNODISPLAY");
                startInfo.ArgumentList.Add("-dNOSAFER");
                startInfo.ArgumentList.Add("-q");
                startInfo.ArgumentList.Add("-c");
                startInfo.ArgumentList.Add("(srgb.icc) findlibfile { == pop } { pop } ifelse");
                startInfo.ArgumentList.Add("-c");
                startInfo.ArgumentList.Add("quit");

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output = (await outputTask).Trim();
                await errorTask;

                Console.WriteLine($"[PDFA_DEBUG] findlibfile raw output: {output}");

                if (string.IsNullOrWhiteSpace(output) ||
                    output.Contains("/undefined") ||
                    output.Contains("Error:"))
                    return null;

                var cleaned = output.Trim('(', ')', '"', ' ', '\n', '\r');
                return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] FindIccViaFindLibFile failed: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Resolves the full filesystem path of the GS executable using
        /// 'where' (Windows) or 'which' (Linux/macOS).
        /// If the process name is already an absolute rooted path, returns it directly.
        /// </summary>
        private async Task<string?> GetGhostscriptExecutablePath(string ghostscriptProcessName)
        {
            try
            {
                // Already an absolute path — return directly, no shell needed
                if (Path.IsPathRooted(ghostscriptProcessName) && File.Exists(ghostscriptProcessName))
                    return ghostscriptProcessName;

                var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
                var startInfo = new ProcessStartInfo
                {
                    FileName = isWindows ? "where" : "which",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                startInfo.ArgumentList.Add(ghostscriptProcessName);

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var output = (await process.StandardOutput.ReadToEndAsync()).Trim();
                await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                // 'where' may return multiple lines — take the first that exists on disk
                var firstLine = output
                    .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim())
                    .FirstOrDefault(l => File.Exists(l));

                Console.WriteLine($"[PDFA_DEBUG] GS executable path: {firstLine}");
                return firstLine;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] GetGhostscriptExecutablePath failed: {ex.Message}");
                return null;
            }
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

        /// <summary>
        /// Last-resort search of well-known versioned install paths per platform.
        /// Covers non-standard installs that all other strategies miss.
        /// </summary>
        private static string? FindIccInWellKnownPaths()
        {
            var candidates = new List<string>();

            // ── Bundled GS (snap / AppImage / packaged builds) ────────────────
            // AppContext.BaseDirectory = .../resources/assets/backend_linux/ (snap)
            //                         = .../<app>.app/Contents/MacOS/          (macOS dmg)
            //                         = .../resources/                          (Windows)
            foreach (var baseOffset in new[] { ".", ".." })
            {
                var bundledBase = Path.GetFullPath(
                    Path.Combine(AppContext.BaseDirectory, baseOffset, "compiled-ghostscript"));

                // Direct iccprofiles/
                candidates.Add(Path.Combine(bundledBase, "iccprofiles", "srgb.icc"));

                // share/ghostscript/iccprofiles/ (non-versioned)
                var shareGs = Path.Combine(bundledBase, "share", "ghostscript");
                candidates.Add(Path.Combine(shareGs, "iccprofiles", "srgb.icc"));

                // share/ghostscript/<version>/iccprofiles/ (versioned — snap autotools layout)
                if (Directory.Exists(shareGs))
                {
                    try
                    {
                        foreach (var vDir in Directory.GetDirectories(shareGs))
                            candidates.Add(Path.Combine(vDir, "iccprofiles", "srgb.icc"));
                    }
                    catch { /* skip */ }
                }
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                foreach (var root in new[]
                {
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)
                })
                {
                    if (!Directory.Exists(root)) continue;
                    // e.g. C:\Program Files\gs\gs10.06.0\iccprofiles\srgb.icc
                    foreach (var gsRoot in Directory.GetDirectories(root, "gs*", SearchOption.TopDirectoryOnly))
                    {
                        candidates.Add(Path.Combine(gsRoot, "iccprofiles", "srgb.icc"));
                        try
                        {
                            foreach (var vDir in Directory.GetDirectories(gsRoot))
                                candidates.Add(Path.Combine(vDir, "iccprofiles", "srgb.icc"));
                        }
                        catch { /* skip */ }
                    }
                }
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                // Homebrew ARM (/opt/homebrew) and Intel (/usr/local) Cellar paths
                // e.g. /opt/homebrew/Cellar/ghostscript/10.06.0_1/share/ghostscript/iccprofiles/
                //      /usr/local/Cellar/ghostscript/10.06.0_1/share/ghostscript/iccprofiles/
                foreach (var brewRoot in new[] { "/opt/homebrew", "/usr/local" })
                {
                    var cellarGs = Path.Combine(brewRoot, "Cellar", "ghostscript");
                    if (!Directory.Exists(cellarGs)) continue;
                    try
                    {
                        foreach (var vDir in Directory.GetDirectories(cellarGs))
                        {
                            var shareGs = Path.Combine(vDir, "share", "ghostscript");
                            candidates.Add(Path.Combine(shareGs, "iccprofiles", "srgb.icc"));
                            if (Directory.Exists(shareGs))
                            {
                                try
                                {
                                    foreach (var sub in Directory.GetDirectories(shareGs))
                                        candidates.Add(Path.Combine(sub, "iccprofiles", "srgb.icc"));
                                }
                                catch { /* skip */ }
                            }
                        }
                    }
                    catch { /* skip */ }
                }
            }
            else
            {
                // Linux system GS
                // e.g. /usr/share/ghostscript/10.06.0/iccprofiles/srgb.icc
                var gsShareRoot = "/usr/share/ghostscript";
                candidates.Add(Path.Combine(gsShareRoot, "iccprofiles", "srgb.icc"));
                candidates.Add("/usr/share/color/icc/ghostscript/srgb.icc");
                if (Directory.Exists(gsShareRoot))
                {
                    try
                    {
                        foreach (var vDir in Directory.GetDirectories(gsShareRoot))
                            candidates.Add(Path.Combine(vDir, "iccprofiles", "srgb.icc"));
                    }
                    catch { /* skip */ }
                }
            }

            foreach (var candidate in candidates)
            {
                try
                {
                    var normalized = Path.GetFullPath(candidate);
                    if (File.Exists(normalized))
                    {
                        Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via well-known paths: {normalized}");
                        return normalized;
                    }
                }
                catch { /* invalid path — skip */ }
            }

            return null;
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