using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.PdfToPdfaModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class PdfToPdfaService : IPdfToPdfaInterface
    {
        public async Task<bool> IsConversionAvailableAsync()
        {
            return File.Exists(GetGsBinaryPath());
        }

        public async Task<PdfaResult> ConvertToPdfaAsync(string filePath, PdfaOptions options)
        {
            if (!File.Exists(filePath)) throw new FileNotFoundException($"File: {filePath}");

            string tempOutputPath = Path.Combine(Path.GetTempPath(), $"pdfa_{Guid.NewGuid()}.pdf");
            string tempDefFile = Path.Combine(Path.GetTempPath(), $"PDFA_def_{Guid.NewGuid()}.ps");

            try
            {
                string gsPath = GetGsBinaryPath();
                string iccPath = GetBundledIccPath();

                EnsureExecutablePermission(gsPath);
                await WritePdfaDefinitionFile(tempDefFile, iccPath, options);

                var startInfo = new ProcessStartInfo
                {
                    FileName = gsPath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(gsPath)
                };

                startInfo.ArgumentList.Add("-dNOPAUSE");
                startInfo.ArgumentList.Add("-dBATCH");
                startInfo.ArgumentList.Add("-dNOSAFER");
                startInfo.ArgumentList.Add("-sDEVICE=pdfwrite");
                string gsBaseDir = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(gsPath)!, ".."));
                startInfo.ArgumentList.Add($"-I{Path.Combine(gsBaseDir, "lib")}");
                startInfo.ArgumentList.Add($"-I{Path.Combine(gsBaseDir, "Resource")}");
                startInfo.ArgumentList.Add($"-dPDFA={GetPdfaVersion(options.ConformanceLevel)}");
                startInfo.ArgumentList.Add("-dPDFACompatibilityPolicy=1");
                startInfo.ArgumentList.Add("-sColorConversionStrategy=RGB");
                startInfo.ArgumentList.Add("-dEmbedAllFonts=true");
                startInfo.ArgumentList.Add($"-dSubsetFonts={(options.SubsetFonts ? "true" : "false")}");
                startInfo.ArgumentList.Add($"-sOutputFile={tempOutputPath}");
                startInfo.ArgumentList.Add(tempDefFile);
                startInfo.ArgumentList.Add(filePath);

                using var process = Process.Start(startInfo);
                await process!.WaitForExitAsync();

                if (process.ExitCode == 0 && File.Exists(tempOutputPath))
                {
                    return new PdfaResult
                    {
                        Success = true,
                        ConvertedData = await File.ReadAllBytesAsync(tempOutputPath),
                        ConformanceLevel = options.ConformanceLevel
                    };
                }

                string error = await process.StandardError.ReadToEndAsync();
                return new PdfaResult { Success = false, Error = $"GS Error ({process.ExitCode}): {error}" };
            }
            finally
            {
                if (File.Exists(tempOutputPath)) File.Delete(tempOutputPath);
                if (File.Exists(tempDefFile)) File.Delete(tempDefFile);
            }
        }

        private string GetGsBinaryPath()
        {
            string baseDirectory = AppContext.BaseDirectory;

            string platform = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "windows" :
                             RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "macos" : "linux";

            string binary = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "gswin64c.exe" : "gs";

            return Path.Combine(baseDirectory, "ghostscript", platform, "bin", binary);
        }

        private string GetBundledIccPath()
        {
            string baseDirectory = AppContext.BaseDirectory;

            string platform = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "windows" :
                             RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "macos" : "linux";

            return Path.Combine(baseDirectory, "ghostscript", platform, "iccprofiles", "srgb.icc");
        }

        private void EnsureExecutablePermission(string path)
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                try { Process.Start("chmod", $"+x \"{path}\"")?.WaitForExit(); } catch { /* log fail */ }
            }
        }

        private async Task WritePdfaDefinitionFile(string defFilePath, string iccProfilePath, PdfaOptions options)
        {
            var escapedIcc = iccProfilePath.Replace("\\", "/");
            var content = $@"%!PS-Adobe-3.0
[ /Title (PDF/A Converted Document) /DOCINFO pdfmark
[/_objdef {{icc_PDFA}} /type /stream /OBJ pdfmark
[{{icc_PDFA}} << /N 3 >> /PUT pdfmark
[{{icc_PDFA}} ({escapedIcc}) (r) file /PUT pdfmark
[/_objdef {{OutputIntent_PDFA}} /type /dict /OBJ pdfmark
[{{OutputIntent_PDFA}} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {{icc_PDFA}} /OutputConditionIdentifier (sRGB) >> /PUT pdfmark
[{{Catalog}} << /OutputIntents [{{OutputIntent_PDFA}}] >> /PUT pdfmark";

            await File.WriteAllTextAsync(defFilePath, content);
        }

        private static int GetPdfaVersion(string level) => level.ToLower() switch
        {
            "pdfa1a" or "pdfa1b" => 1,
            "pdfa2a" or "pdfa2b" => 2,
            _ => 3
        };
    }
}