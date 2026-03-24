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

        private async Task<PdfaResult> RunGhostscriptConversionAsync(string inputPath, string outputPath, PdfaOptions options)
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
                        Error = "Could not locate the sRGB ICC color profile (srgb.icc) required for PDF/A conversion. " +
                                "Please ensure Ghostscript is fully installed."
                    };
                }

                tempDefFile = Path.Combine(Path.GetTempPath(), $"PDFA_def_{Guid.NewGuid()}.ps");
                await WritePdfaDefinitionFile(tempDefFile, iccProfile, options);

                // Build the argument list — using ArgumentList avoids ALL quoting issues
                // with spaces in paths on Windows and Linux/macOS
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
                // NOTE: Do NOT add -dSAFER — in GS 9.50+ it is the default and
                // it blocks file access to paths outside GS's allowed list,
                // which breaks reading our temp PDFA_def.ps file.
                // Use -dNOSAFER to explicitly allow file access.
                startInfo.ArgumentList.Add("-dNOSAFER");
                startInfo.ArgumentList.Add("-sDEVICE=pdfwrite");
                startInfo.ArgumentList.Add($"-dPDFA={GetPdfaVersion(options.ConformanceLevel!)}");
                startInfo.ArgumentList.Add("-dPDFACompatibilityPolicy=1");
                startInfo.ArgumentList.Add("-sColorConversionStrategy=RGB");
                startInfo.ArgumentList.Add("-dEmbedAllFonts=true");
                startInfo.ArgumentList.Add($"-dSubsetFonts={(options.SubsetFonts ? "true" : "false")}");
                startInfo.ArgumentList.Add($"-sOutputFile={outputPath}");  // No manual quotes needed
                startInfo.ArgumentList.Add(tempDefFile);                   // No manual quotes needed
                startInfo.ArgumentList.Add(inputPath);                     // No manual quotes needed

                // Log the full command for debugging
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

        /// <summary>
        /// Returns the PDF/A version number (1, 2, or 3) for the -dPDFA= flag.
        /// </summary>
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

        /// <summary>
        /// Tries to locate the PDFA_def.ps file shipped with Ghostscript.
        /// Returns null if not found; the conversion will still proceed without it
        /// but may not be fully conformant.
        /// </summary>
        private static string? GetPdfaDefinitionFile(string conformanceLevel)
        {
            var candidates = new List<string>();

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                // Common Ghostscript install locations on Windows
                var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

                foreach (var root in new[] { programFiles, programFilesX86 })
                {
                    if (Directory.Exists(root))
                    {
                        foreach (var dir in Directory.GetDirectories(root, "gs*", SearchOption.TopDirectoryOnly))
                        {
                            candidates.Add(Path.Combine(dir, "lib", "PDFA_def.ps"));
                        }
                    }
                }
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                candidates.Add("/opt/homebrew/share/ghostscript/PDFA_def.ps");
                candidates.Add("/usr/local/share/ghostscript/PDFA_def.ps");

                // Try versioned paths
                foreach (var dir in new[] { "/opt/homebrew/share/ghostscript", "/usr/local/share/ghostscript" })
                {
                    if (Directory.Exists(dir))
                    {
                        foreach (var sub in Directory.GetDirectories(dir))
                        {
                            candidates.Add(Path.Combine(sub, "PDFA_def.ps"));
                        }
                    }
                }
            }
            else
            {
                // Linux
                candidates.Add("/usr/share/ghostscript/PDFA_def.ps");
                candidates.Add("/usr/share/doc/ghostscript/examples/PDFA_def.ps");

                // Try versioned paths
                foreach (var dir in new[] { "/usr/share/ghostscript" })
                {
                    if (Directory.Exists(dir))
                    {
                        foreach (var sub in Directory.GetDirectories(dir))
                        {
                            candidates.Add(Path.Combine(sub, "PDFA_def.ps"));
                        }
                    }
                }
            }

            // Also check bundled assets (snap / packaged builds)
            var bundledDef = Path.Combine(AppContext.BaseDirectory, "compiled-ghostscript", "lib", "PDFA_def.ps");
            candidates.Insert(0, bundledDef);

            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Using PDFA_def.ps: {candidate}");
                    return candidate;
                }
            }

            Console.WriteLine("[PDFA_DEBUG] PDFA_def.ps not found; proceeding without it.");
            return null;
        }

        private async Task WritePdfaDefinitionFile(string defFilePath, string iccProfilePath, PdfaOptions options)
        {
            // PostScript requires forward slashes even on Windows
            var escapedIcc = iccProfilePath.Replace("\\", "/");

            // NOTE: Do NOT indent this — PostScript is whitespace-sensitive in some parsers
            // and leading spaces before [ can cause issues. Keep it flush left.
            var content =
                "%!PS-Adobe-3.0\n" +
                "[ /Title (PDF/A Converted Document)\n" +
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

        private async Task<string?> FindSrgbIccProfile(string ghostscriptProcessName)
        {
            // Strategy 1: Ask Ghostscript itself where its resource directory is
            var gsResourceDir = await GetGhostscriptResourceDir(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(gsResourceDir))
            {
                // srgb.icc lives in iccprofiles/ inside the resource dir
                var iccPath = Path.Combine(gsResourceDir, "iccprofiles", "srgb.icc");
                if (File.Exists(iccPath))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via GS resource dir: {iccPath}");
                    return iccPath;
                }

                // Some Ghostscript builds put it one level up
                var iccPathAlt = Path.Combine(gsResourceDir, "..", "iccprofiles", "srgb.icc");
                var iccPathAltNorm = Path.GetFullPath(iccPathAlt);
                if (File.Exists(iccPathAltNorm))
                {
                    Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via GS resource dir (alt): {iccPathAltNorm}");
                    return iccPathAltNorm;
                }
            }

            // Strategy 2: Ask Ghostscript to locate the file directly using findlibfile
            var directPath = await GetIccPathFromGhostscript(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(directPath) && File.Exists(directPath))
            {
                Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc via GS findlibfile: {directPath}");
                return directPath;
            }

            // Strategy 3: Search relative to the Ghostscript executable itself
            var execPath = await GetGhostscriptExecutablePath(ghostscriptProcessName);
            if (!string.IsNullOrEmpty(execPath))
            {
                var gsDir = Path.GetDirectoryName(execPath);
                // Walk up from bin/ to find iccprofiles/
                var current = gsDir;
                for (int i = 0; i < 4; i++) // max 4 levels up
                {
                    if (current == null) break;
                    var candidate = Path.Combine(current, "iccprofiles", "srgb.icc");
                    if (File.Exists(candidate))
                    {
                        Console.WriteLine($"[PDFA_DEBUG] Found srgb.icc by walking up from executable: {candidate}");
                        return candidate;
                    }
                    current = Path.GetDirectoryName(current);
                }
            }

            Console.WriteLine("[PDFA_DEBUG] srgb.icc not found via any strategy.");
            return null;
        }

        /// <summary>
        /// Runs: gs -dNODISPLAY -dNOSAFER -q -c "systemdict /resourcedir get ==" -c quit
        /// Returns the Ghostscript resource directory path, e.g:
        /// C:/Program Files/gs/gs10.06.0/Resource/
        /// </summary>
        private async Task<string?> GetGhostscriptResourceDir(string ghostscriptProcessName)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = ghostscriptProcessName,
                    Arguments = "-dNODISPLAY -dNOSAFER -q -c \"systemdict /resourcedir get ==\" -c quit",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output = (await outputTask).Trim();
                await errorTask; // drain stderr

                Console.WriteLine($"[PDFA_DEBUG] GS resource dir raw output: {output}");

                if (string.IsNullOrWhiteSpace(output)) return null;

                // GS prints the path wrapped in parentheses: (C:/Program Files/gs/gs10.06.0/Resource/)
                var cleaned = output.Trim('(', ')', '"', ' ', '\n', '\r');
                Console.WriteLine($"[PDFA_DEBUG] GS resource dir cleaned: {cleaned}");

                return Directory.Exists(cleaned) ? cleaned : null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] GetGhostscriptResourceDir failed: {ex.Message}");
                return null;
            }
        }

        private async Task<string?> GetIccPathFromGhostscript(string ghostscriptProcessName)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = ghostscriptProcessName,
                    Arguments = "-dNODISPLAY -dNOSAFER -q -c \"(srgb.icc) findlibfile { == pop } { pop } ifelse\" -c quit",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var outputTask = process.StandardOutput.ReadToEndAsync();
                var errorTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                var output = (await outputTask).Trim();
                await errorTask;

                Console.WriteLine($"[PDFA_DEBUG] GS findlibfile raw output: {output}");

                if (string.IsNullOrWhiteSpace(output)) return null;

                var cleaned = output.Trim('(', ')', '"', ' ', '\n', '\r');
                return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[PDFA_DEBUG] GetIccPathFromGhostscript failed: {ex.Message}");
                return null;
            }
        }

        private async Task<string?> GetGhostscriptExecutablePath(string ghostscriptProcessName)
        {
            try
            {
                var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
                var startInfo = new ProcessStartInfo
                {
                    FileName = isWindows ? "where" : "which",
                    Arguments = ghostscriptProcessName,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();

                var output = (await process.StandardOutput.ReadToEndAsync()).Trim();
                await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                // 'where' can return multiple lines — take the first valid one
                var firstLine = output.Split('\n', StringSplitOptions.RemoveEmptyEntries)
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

        private string GetGhostscriptProcessName()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return "gswin64c.exe";

            // Check for bundled Ghostscript (snap / packaged Linux builds)
            var bundledGs = Path.Combine(AppContext.BaseDirectory, "compiled-ghostscript", "bin", "gs");
            if (File.Exists(bundledGs))
            {
                Console.WriteLine($"[PDFA_DEBUG] Using bundled Ghostscript: {bundledGs}");
                return bundledGs;
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                if (File.Exists("/opt/homebrew/bin/gs")) return "/opt/homebrew/bin/gs";
                if (File.Exists("/usr/local/bin/gs")) return "/usr/local/bin/gs";
            }

            return "gs";
        }
    }
}
