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


// src/renderer/tools/lockUnlockPdf/lockUnlockPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const processBtn = document.getElementById('process-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const pdfSecurityEl = document.getElementById('pdf-security');
    const operationRadios = document.querySelectorAll('input[name="operation"]');
    const lockOptions = document.getElementById('lock-options');
    const unlockOptions = document.getElementById('unlock-options');
    const openPassword = document.getElementById('open-password');
    const encryptionLevel = document.getElementById('encryption-level');
    const unlockPassword = document.getElementById('unlock-password');
    const togglePasswordBtns = document.querySelectorAll('.toggle-password');
    let selectedFile = null;
    let droppedFilePath = null;

    function initializeEventListeners() {
        selectPdfBtn.addEventListener('click', handleFileSelection);
        removePdfBtn.addEventListener('click', async () => {
            await cleanupDroppedFile();
            clearAll();
        });
        operationRadios.forEach(radio => {
            radio.addEventListener('change', handleOperationChange);
        });
        togglePasswordBtns.forEach(btn => {
            btn.addEventListener('click', handleTogglePassword);
        });
        processBtn.addEventListener('click', handleProcessPdf);
        [openPassword, unlockPassword].forEach(input => {
            input.addEventListener('input', clearInputError);
        });
    }

    async function handleFileSelection() {
        try {
            loadingUI.show(i18n.t('lockUnlockPdfJS.analyzingPdf'));
            const files = await window.electronAPI.selectPdfs();
            if (files && files.length > 0) {
                const filePath = files[0];
                const fileName = filePath.split(/[\\/]/).pop();
                const fileSize = await getFileSize(filePath);
                const securityStatus = await checkPdfSecurity(filePath);

                handleFileSelected({
                    path: filePath,
                    name: fileName,
                    size: fileSize,
                    securityStatus: securityStatus
                });
            }
        } catch (error) {
            console.error("File selection error:", error);
            customAlert.alert(i18n.t('alerts.error'), i18n.t('lockUnlockPdfJS.failedAnalyze'), [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
        }
    }

    async function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        const securityStatus = file.securityStatus;
        if (securityStatus.isEncrypted) {
            pdfSecurityEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-icon lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' + i18n.t('lockUnlockPdfJS.encryptedPdf');
            pdfSecurityEl.className = 'pdf-security security-locked';
            document.querySelector('input[name="operation"][value="unlock"]').checked = true;
        } else {
            pdfSecurityEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-open-icon lucide-lock-open"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>' + i18n.t('lockUnlockPdfJS.unencryptedPdf');
            pdfSecurityEl.className = 'pdf-security security-unlocked';
            document.querySelector('input[name="operation"][value="lock"]').checked = true;
        }

        handleOperationChange();

        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        processBtn.disabled = false;
    }

    function handleOperationChange() {
        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;

        if (selectedOperation === 'lock') {
            lockOptions.style.display = 'block';
            unlockOptions.style.display = 'none';
            processBtn.textContent = i18n.t('lockUnlockPdfJS.lockPdf');
        } else {
            lockOptions.style.display = 'none';
            unlockOptions.style.display = 'block';
            processBtn.textContent = i18n.t('lockUnlockPdfJS.unlockPdf');
        }
    }

    function handleTogglePassword(event) {
        const targetId = event.currentTarget.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        if (!passwordInput) return;

        const isCurrentlyPassword = passwordInput.type === 'password';
        passwordInput.type = isCurrentlyPassword ? 'text' : 'password';

        event.currentTarget.innerHTML = isCurrentlyPassword ?
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-.722-3.25"/><path d="M2 8a10.645 10.645 0 0 0 20 0"/><path d="m20 15-1.726-2.05"/><path d="m4 15 1.726-2.05"/><path d="m9 18 .722-3.25"/></svg>'
            :
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    function clearInputError(event) {
        if (event.target.classList.contains('error')) {
            event.target.classList.remove('error');
        }
    }

    function validateForm() {
        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;
        let isValid = true;
        if (selectedOperation === 'lock') {
            if (!openPassword.value.trim()) {
                openPassword.classList.add('error');
                isValid = false;
            }
            if (openPassword.value.trim().length < 3) {
                openPassword.classList.add('error');
                isValid = false;
                if (isValid) {
                    customAlert.alert('LocalPDF Studio - NOTICE', i18n.t('lockUnlockPdfJS.passwordMinLength'), ['OK']);
                }
            }
        } else {
            if (!unlockPassword.value.trim()) {
                unlockPassword.classList.add('error');
                isValid = false;
            }
        }
        return isValid;
    }

    async function handleProcessPdf() {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('lockUnlockPdfJS.selectPdfFirst'), [i18n.t('common.ok')]);
            return;
        }
        if (!validateForm()) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('lockUnlockPdfJS.fillRequiredFields'), [i18n.t('common.ok')]);
            return;
        }
        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;

        try {
            const loadingMessage = selectedOperation === 'lock' ? i18n.t('lockUnlockPdfJS.lockingPdf') : i18n.t('lockUnlockPdfJS.unlockingPdf');
            loadingUI.show(loadingMessage);
            processBtn.disabled = true;
            processBtn.textContent = selectedOperation === 'lock' ? i18n.t('lockUnlockPdfJS.locking') : i18n.t('lockUnlockPdfJS.unlocking');
            const requestBody = {
                filePath: selectedFile.path,
                operation: selectedOperation
            };
            if (selectedOperation === 'lock') {
                requestBody.lockOptions = {
                    openPassword: openPassword.value,
                    encryptionLevel: parseInt(encryptionLevel.value)
                };
            } else {
                requestBody.unlockOptions = {
                    password: unlockPassword.value
                };
            }

            const endpoint = selectedOperation === 'lock'
                ? await API.pdf.lock
                : await API.pdf.unlock;

            const result = await API.request.post(endpoint, requestBody);
            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedOperation === 'lock'
                    ? selectedFile.name.replace('.pdf', '_locked.pdf')
                    : selectedFile.name.replace('.pdf', '_unlocked.pdf');

                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) {
                    const successMsg = selectedOperation === 'lock' ? i18n.t('lockUnlockPdfJS.successLockedMsg') : i18n.t('lockUnlockPdfJS.successUnlockedMsg');
                    await customAlert.alert(i18n.t('alerts.success'), successMsg + savedPath, [i18n.t('common.ok')]);
                    clearPasswords();
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('lockUnlockPdfJS.warningMsg'), [i18n.t('common.ok')]);
                }
            } else {
                await customAlert.alert(i18n.t('alerts.error'), `Error: ${JSON.stringify(result)}`, [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error(`${selectedOperation === 'lock' ? 'Lock' : 'Unlock'} Error:`, error);
            if (error.message.includes('password') || error.message.includes('Password')) {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('lockUnlockPdfJS.incorrectPassword'), [i18n.t('common.ok')]);
                if (selectedOperation === 'unlock') {
                    unlockPassword.classList.add('error');
                    unlockPassword.focus();
                }
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('lockUnlockPdfJS.errorMsg') + `\n${error.message}`, [i18n.t('common.ok')]);
            }
        } finally {
            loadingUI.hide();
            processBtn.disabled = false;
            processBtn.textContent = selectedOperation === 'lock' ? i18n.t('lockUnlockPdfJS.lockPdf') : i18n.t('lockUnlockPdfJS.unlockPdf');
        }
    }

    function clearAll(preserveDroppedFilePath = false) {
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        processBtn.disabled = true;
        pdfSecurityEl.textContent = '';
        pdfSecurityEl.className = 'pdf-security';
        clearPasswords();
        clearErrors();
        document.querySelector('input[name="operation"][value="lock"]').checked = true;
        handleOperationChange();
    }

    function clearPasswords() {
        openPassword.value = '';
        unlockPassword.value = '';
        document.querySelectorAll('.password-input').forEach(input => {
            input.type = 'password';
        });
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-icon lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
        });
    }

    function clearErrors() {
        document.querySelectorAll('.password-input.error').forEach(input => {
            input.classList.remove('error');
        });
    }

    async function getFileSize(filePath) {
        try {
            if (window.electronAPI?.getFileInfo) {
                const info = await window.electronAPI.getFileInfo(filePath);
                return info.size || 0;
            }
            return 0;
        } catch {
            return 0;
        }
    }

    async function checkPdfSecurity(filePath) {
        try {
            const loadingTask = pdfjsLib.getDocument({url: `file://${filePath}`});
            const pdfDoc = await loadingTask.promise;
            const isEncrypted = pdfDoc.isEncrypted;
            await pdfDoc.cleanup();
            return {
                isEncrypted: isEncrypted,
                canBeProcessed: true
            };
        } catch (error) {
            if (error.name === 'PasswordException' ||
                error.message.includes('password') ||
                error.message.includes('encrypted')) {
                return {
                    isEncrypted: true,
                    canBeProcessed: false
                };
            }
            console.error('Error checking PDF security:', error);
            return {
                isEncrypted: false,
                canBeProcessed: true
            };
        }
    }

    async function cleanupDroppedFile() {
        if (droppedFilePath) {
            try {
                await window.electronAPI.deleteFile(droppedFilePath);
                droppedFilePath = null;
            } catch (error) {
                console.error('Error cleaning up dropped file:', error);
            }
        }
    }
    initializeEventListeners();

    // Back button with cleanup
    const backButton = document.querySelector('a[href="../../index.html"]');
    if (backButton) {
        backButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert('LocalPDF Studio - NOTICE', i18n.t('lockUnlockPdfJS.dropOneFile'), ['OK']);
                return;
            }
            try {
                loadingUI.show(i18n.t('lockUnlockPdfJS.analyzingDropped'));
                await cleanupDroppedFile();
                const file = pdfFiles[0];
                const buffer = await file.arrayBuffer();
                const result = await window.electronAPI.saveDroppedFile({
                    name: file.name,
                    buffer: buffer
                });
                if (result.success) {
                    const fileSize = file.size || 0;
                    const securityStatus = await checkPdfSecurity(result.filePath);
                    droppedFilePath = result.filePath;
                    handleFileSelected({
                        path: result.filePath,
                        name: file.name,
                        size: fileSize,
                        securityStatus: securityStatus
                    });
                } else {
                    await customAlert.alert(i18n.t('alerts.error'), i18n.t('lockUnlockPdfJS.failedSaveDrop') + result.error, [i18n.t('common.ok')]);
                }
            } catch (error) {
                console.error('Error processing dropped file:', error);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('lockUnlockPdfJS.processingDroppedError') + `\n${error.message}`, [i18n.t('common.ok')]);
            } finally {
                loadingUI.hide();
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('lockUnlockPdfJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });
});