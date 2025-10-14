// src/renderer/tools/lockUnlockPdf/lockUnlockPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    // DOM Elements
    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const processBtn = document.getElementById('process-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const pdfSecurityEl = document.getElementById('pdf-security');

    // Operation Elements
    const operationRadios = document.querySelectorAll('input[name="operation"]');
    const lockOptions = document.getElementById('lock-options');
    const unlockOptions = document.getElementById('unlock-options');

    // Lock Options Elements
    const openPassword = document.getElementById('open-password');
    const permissionsPassword = document.getElementById('permissions-password');
    const allowPrinting = document.getElementById('allow-printing');
    const allowCopying = document.getElementById('allow-copying');
    const allowModification = document.getElementById('allow-modification');
    const allowAnnotations = document.getElementById('allow-annotations');
    const encryptionLevel = document.getElementById('encryption-level');

    // Unlock Options Elements
    const unlockPassword = document.getElementById('unlock-password');

    // Toggle Password Buttons
    const togglePasswordBtns = document.querySelectorAll('.toggle-password');

    let selectedFile = null;

    // Initialize Event Listeners
    function initializeEventListeners() {
        // File selection
        selectPdfBtn.addEventListener('click', handleFileSelection);
        removePdfBtn.addEventListener('click', clearAll);

        // Operation toggle
        operationRadios.forEach(radio => {
            radio.addEventListener('change', handleOperationChange);
        });

        // Password visibility toggles
        togglePasswordBtns.forEach(btn => {
            btn.addEventListener('click', handleTogglePassword);
        });

        // Process button
        processBtn.addEventListener('click', handleProcessPdf);

        // Input validation
        [openPassword, permissionsPassword, unlockPassword].forEach(input => {
            input.addEventListener('input', clearInputError);
        });
    }

    // File Selection Handler
    async function handleFileSelection() {
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
    }

    // Handle File Selected
    async function handleFileSelected(file) {
        clearAll();
        selectedFile = file;

        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;

        // Get security status
        const securityStatus = await checkPdfSecurity(file.path);

        // Display security status with better logic
        if (securityStatus.isEncrypted) {
            pdfSecurityEl.textContent = '🔒 Encrypted PDF';
            pdfSecurityEl.className = 'pdf-security security-locked';

            // Auto-select unlock operation for encrypted PDFs
            document.querySelector('input[name="operation"][value="unlock"]').checked = true;
        } else {
            pdfSecurityEl.textContent = '🔓 Unencrypted PDF';
            pdfSecurityEl.className = 'pdf-security security-unlocked';

            // Auto-select lock operation for unencrypted PDFs
            document.querySelector('input[name="operation"][value="lock"]').checked = true;
        }

        // Update UI based on selection
        handleOperationChange();

        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        processBtn.disabled = false;
    }

    // Operation Change Handler
    function handleOperationChange() {
        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;

        if (selectedOperation === 'lock') {
            lockOptions.style.display = 'block';
            unlockOptions.style.display = 'none';
            processBtn.textContent = 'Lock PDF';
        } else {
            lockOptions.style.display = 'none';
            unlockOptions.style.display = 'block';
            processBtn.textContent = 'Unlock PDF';
        }
    }

    // Toggle Password Visibility
    function handleTogglePassword(event) {
        const targetId = event.target.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const isCurrentlyPassword = passwordInput.type === 'password';

        passwordInput.type = isCurrentlyPassword ? 'text' : 'password';
        event.target.textContent = isCurrentlyPassword ? '🙈' : '👁️';
    }

    // Clear Input Error State
    function clearInputError(event) {
        if (event.target.classList.contains('error')) {
            event.target.classList.remove('error');
        }
    }

    // Validate Form
    function validateForm() {
        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;
        let isValid = true;

        if (selectedOperation === 'lock') {
            // Validate open password
            if (!openPassword.value.trim()) {
                openPassword.classList.add('error');
                isValid = false;
            }

            // Validate password strength (optional enhancement)
            if (openPassword.value.trim().length < 3) {
                openPassword.classList.add('error');
                isValid = false;
                if (isValid) {
                    customAlert.alert('LocalPDF Studio - NOTICE', 'Open password should be at least 3 characters long.', ['OK']);
                }
            }

        } else { // unlock operation
            // Validate unlock password
            if (!unlockPassword.value.trim()) {
                unlockPassword.classList.add('error');
                isValid = false;
            }
        }

        return isValid;
    }

    // Process PDF Handler
    async function handleProcessPdf() {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a PDF file first.', ['OK']);
            return;
        }

        if (!validateForm()) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please fill in all required fields correctly.', ['OK']);
            return;
        }

        const selectedOperation = document.querySelector('input[name="operation"]:checked').value;

        try {
            processBtn.disabled = true;
            processBtn.textContent = selectedOperation === 'lock' ? 'Locking...' : 'Unlocking...';

            const requestBody = {
                filePath: selectedFile.path,
                operation: selectedOperation
            };

            // Add operation-specific data
            if (selectedOperation === 'lock') {
                requestBody.lockOptions = {
                    openPassword: openPassword.value,
                    permissionsPassword: permissionsPassword.value || null,
                    permissions: {
                        allowPrinting: allowPrinting.checked,
                        allowCopying: allowCopying.checked,
                        allowModification: allowModification.checked,
                        allowAnnotations: allowAnnotations.checked
                    },
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
                    const operationText = selectedOperation === 'lock' ? 'locked' : 'unlocked';
                    await customAlert.alert('LocalPDF Studio - SUCCESS', `PDF ${operationText} successfully!\nSaved to: ${savedPath}`, ['OK']);

                    // Clear passwords after successful operation
                    clearPasswords();
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save.', ['OK']);
                }
            } else {
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            console.error(`${selectedOperation === 'lock' ? 'Lock' : 'Unlock'} Error:`, error);

            // Handle wrong password specifically
            if (error.message.includes('password') || error.message.includes('Password')) {
                await customAlert.alert('LocalPDF Studio - WARNING', 'Incorrect password. Please check the password and try again.', ['OK']);
                if (selectedOperation === 'unlock') {
                    unlockPassword.classList.add('error');
                    unlockPassword.focus();
                }
            } else {
                await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred:\n${error.message}`, ['OK']);
            }
        } finally {
            processBtn.disabled = false;
            processBtn.textContent = selectedOperation === 'lock' ? 'Lock PDF' : 'Unlock PDF';
        }
    }

    // Clear All Data
    function clearAll() {
        selectedFile = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        processBtn.disabled = true;
        pdfSecurityEl.textContent = '';
        pdfSecurityEl.className = 'pdf-security';

        clearPasswords();
        clearErrors();

        // Reset to default operation
        document.querySelector('input[name="operation"][value="lock"]').checked = true;
        handleOperationChange();
    }

    // Clear Passwords
    function clearPasswords() {
        openPassword.value = '';
        permissionsPassword.value = '';
        unlockPassword.value = '';

        // Reset password visibility
        document.querySelectorAll('.password-input').forEach(input => {
            input.type = 'password';
        });
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.textContent = '👁️';
        });
    }

    // Clear Error States
    function clearErrors() {
        document.querySelectorAll('.password-input.error').forEach(input => {
            input.classList.remove('error');
        });
    }

    // Get File Size
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

    // Check PDF Security Status (Basic implementation)
    // Best approach - Use PDF.js to detect encryption properly
    async function checkPdfSecurity(filePath) {
        try {
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);

            // Try to get document info without password
            const pdfDoc = await loadingTask.promise;
            const isEncrypted = pdfDoc.isEncrypted;

            pdfDoc.destroy(); // Clean up

            return {
                isEncrypted: isEncrypted,
                canBeProcessed: true
            };
        } catch (error) {
            // If PDF.js fails with "Password required" error, it's encrypted
            if (error.name === 'PasswordException' ||
                error.message.includes('password') ||
                error.message.includes('encrypted')) {
                return {
                    isEncrypted: true,
                    canBeProcessed: false // Needs password to even check
                };
            }

            console.error('Error checking PDF security:', error);
            return {
                isEncrypted: false,
                canBeProcessed: true
            };
        }
    }

    // Initialize the application
    initializeEventListeners();
});