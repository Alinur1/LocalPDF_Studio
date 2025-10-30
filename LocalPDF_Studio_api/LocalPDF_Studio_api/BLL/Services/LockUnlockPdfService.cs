/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


using PdfSharpCore.Pdf;
using PdfSharpCore.Pdf.IO;
using PdfSharpCore.Pdf.Security;
using LocalPDF_Studio_api.BLL.Interfaces;
using LocalPDF_Studio_api.DAL.Models.LockUnlockPdfModel;

namespace LocalPDF_Studio_api.BLL.Services
{
    public class LockUnlockPdfService : ILockUnlockPdfInterface
    {
        private readonly ILogger<LockUnlockPdfService> _logger;

        public LockUnlockPdfService(ILogger<LockUnlockPdfService> logger)
        {
            _logger = logger;
        }

        public async Task<byte[]> ProcessPdfAsync(LockUnlockRequest request)
        {
            return await Task.Run(() => ProcessPdfSync(request));
        }

        private byte[] ProcessPdfSync(LockUnlockRequest request)
        {
            try
            {
                if (!File.Exists(request.FilePath))
                    throw new FileNotFoundException($"File not found: {request.FilePath}");

                _logger.LogInformation("Processing PDF {Operation}: {FilePath}", request.Operation, request.FilePath);

                return request.Operation.ToLower() switch
                {
                    "lock" => LockPdf(request),
                    "unlock" => UnlockPdf(request),
                    _ => throw new ArgumentException($"Invalid operation: {request.Operation}")
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing PDF {Operation}: {FilePath}", request.Operation, request.FilePath);
                throw;
            }
        }

        private byte[] LockPdf(LockUnlockRequest request)
        {
            if (request.LockOptions == null)
                throw new ArgumentNullException(nameof(request.LockOptions), "Lock options are required for locking operation");

            var lockOptions = request.LockOptions;

            if (string.IsNullOrWhiteSpace(lockOptions.OpenPassword))
                throw new ArgumentException("Open password is required for locking PDF");

            if (lockOptions.OpenPassword.Length < 3)
                throw new ArgumentException("Open password must be at least 3 characters long");

            var document = PdfReader.Open(request.FilePath, PdfDocumentOpenMode.Modify);

            document.SecuritySettings.UserPassword = lockOptions.OpenPassword;
            document.SecuritySettings.OwnerPassword = lockOptions.OpenPassword;

            document.SecuritySettings.DocumentSecurityLevel = lockOptions.EncryptionLevel == 40
                ? PdfDocumentSecurityLevel.Encrypted40Bit
                : PdfDocumentSecurityLevel.Encrypted128Bit;

            using var memoryStream = new MemoryStream();
            document.Save(memoryStream, false);
            document.Close();

            _logger.LogInformation("PDF locked successfully with {EncryptionLevel}-bit encryption: {FilePath}",
                lockOptions.EncryptionLevel, request.FilePath);
            return memoryStream.ToArray();
        }

        private byte[] UnlockPdf(LockUnlockRequest request)
        {
            if (request.UnlockOptions == null)
                throw new ArgumentNullException(nameof(request.UnlockOptions), "Unlock options are required for unlocking operation");

            var unlockOptions = request.UnlockOptions;

            if (string.IsNullOrWhiteSpace(unlockOptions.Password))
                throw new ArgumentException("Password is required for unlocking PDF");

            try
            {
                _logger.LogInformation("Unlocking PDF with password length: {PasswordLength}", unlockOptions.Password.Length);

                var sourceDoc = PdfReader.Open(request.FilePath, unlockOptions.Password, PdfDocumentOpenMode.Import);
                var newDoc = new PdfDocument();

                foreach (PdfPage page in sourceDoc.Pages)
                {
                    newDoc.AddPage(page);
                }

                using var memoryStream = new MemoryStream();
                newDoc.Save(memoryStream, false);

                sourceDoc.Close();
                newDoc.Close();
                _logger.LogInformation("PDF unlocked successfully. Original size: {OriginalSize}, Unlocked size: {UnlockedSize}",
                    new FileInfo(request.FilePath).Length, memoryStream.Length);

                return memoryStream.ToArray();
            }
            catch (PdfSharpCore.Pdf.IO.PdfReaderException ex) when (ex.Message.Contains("password"))
            {
                _logger.LogWarning("Wrong password provided for PDF: {FilePath}", request.FilePath);
                throw new UnauthorizedAccessException("Incorrect password. Please check the password and try again.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error unlocking PDF: {FilePath}", request.FilePath);
                throw new InvalidOperationException($"Failed to unlock PDF: {ex.Message}");
            }
        }
    }
}
