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
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class GhostscriptService : IGhostscriptInterface
    {
        public async Task<bool> IsGhostscriptAvailableAsync()
        {
            try
            {
                var version = await GetGhostscriptVersionAsync();
                return !string.IsNullOrEmpty(version);
            }
            catch
            {
                return false;
            }
        }

        public async Task<string> GetGhostscriptVersionAsync()
        {
            var processNames = GetGhostscriptProcessNames();

            foreach (var processName in processNames)
            {
                try
                {
                    Console.WriteLine($"[GS_DEBUG] Attempting to run command: {processName} --version");

                    using var process = new Process();
                    process.StartInfo = new ProcessStartInfo
                    {
                        FileName = processName,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    };
                    // Direct invocation on all OSes — no shell (/bin/bash -c).
                    // ArgumentList passes "--version" as a discrete argument.
                    process.StartInfo.ArgumentList.Add("--version");

                    process.Start();

                    var outputTask = process.StandardOutput.ReadToEndAsync();
                    var errorTask = process.StandardError.ReadToEndAsync();

                    await process.WaitForExitAsync();
                    
                    var output = await outputTask;
                    var error = await errorTask;

                    Console.WriteLine($"[GS_DEBUG] Exit Code: {process.ExitCode}");
                    if (!string.IsNullOrWhiteSpace(error))
                    {
                        Console.WriteLine($"[GS_DEBUG] STDERR: {error.Trim()}");
                    }
                    if (!string.IsNullOrWhiteSpace(output))
                    {
                        Console.WriteLine($"[GS_DEBUG] STDOUT: {output.Trim()}");
                    }

                    if (process.ExitCode == 0 && !string.IsNullOrWhiteSpace(output))
                    {
                        return output.Trim();
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[GS_DEBUG] Exception starting process: {ex.Message}");
                    continue;
                }
            }

            return null;
        }

        private string[] GetGhostscriptProcessNames()
        {
            var list = new List<string>();

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                Console.WriteLine("Searching for Windows ghostscript [GhostscriptService]");
                list.Add("gswin64c.exe");
                list.Add("gswin32c.exe");
                list.Add("gs.exe");
                Console.WriteLine("Searching finished for Windows ghostscript [GhostscriptService]" + list);
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                Console.WriteLine("Searching for Linux/macOS ghostscript [GhostscriptService]");
                list.Add("gs");
                list.Add("ghostscript");
                Console.WriteLine("Searching finished-1 for Linux/macOS ghostscript [GhostscriptService]" + list);
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                Console.WriteLine("Searching for macOS ghostscript [GhostscriptService]");
                list.Add("/opt/homebrew/bin/gs");
                list.Add("/usr/local/bin/gs");
                list.Add("gs");
                Console.WriteLine("Searching finished for macOS ghostscript [GhostscriptService]" + list);
            }
            else
            {
                throw new PlatformNotSupportedException("Unsupported operating system");
            }
            Console.WriteLine("Returning list as array [GhostscriptService]" + list.ToArray());
            return list.ToArray();
        }
    }
}
