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


// src/renderer/tools/compressPdf/compressPdf.js

import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from '../../utils/themeManager.js';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const compressBtn = document.getElementById('compress-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const qualityRadios = document.querySelectorAll('input[name="quality"]');
    const customQualitySection = document.getElementById('custom-quality-section');
    const customQualitySlider = document.getElementById('custom-quality-slider');
    const qualityPercentage = document.getElementById('quality-percentage');
    let selectedFile = null;
    let droppedFilePath = null;

    selectPdfBtn.addEventListener('click', async () => {
        // First check if Ghostscript is available
        loadingUI.show(i18n.t('compressPdfJS.checkingGhostscript'));

        try {
            const isGhostscriptAvailable = await checkGhostscriptAvailability();

            if (!isGhostscriptAvailable) {
                loadingUI.hide();
                const result = await customAlert.alert(
                    i18n.t('alerts.requirement'),
                    i18n.t('compressPdfJS.ghostscriptRequired'),
                    [i18n.t('common.ok'), i18n.t('compressPdfJS.tutorial')]
                );
                if (result === 1) {
                    window.electronAPI.openExternal('https://youtu.be/fKrnSytg_z4');
                }
                return;
            }

            // Ghostscript is available, continue with file selection
            loadingUI.updateMessage(i18n.t('compressPdfJS.selectingPdfs'));
            const files = await window.electronAPI.selectPdfs();
            if (files && files.length > 0) {
                const filePath = files[0];
                const fileName = filePath.split(/[\\/]/).pop();
                const fileSize = await getFileSize(filePath);
                handleFileSelected({ path: filePath, name: fileName, size: fileSize });
            }
        } catch (error) {
            console.error('Error during Ghostscript check:', error);
            await customAlert.alert(
                i18n.t('alerts.error'),
                i18n.t('compressPdfJS.errorCheckingGhostscript') + error.message,
                [i18n.t('common.ok')]
            );
        } finally {
            loadingUI.hide();
        }
    });

    removePdfBtn.addEventListener('click', async () =>{
        await cleanupDroppedFile();
        clearAll();
    });

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    async function checkGhostscriptAvailability() {
        try {
            console.log('Checking Ghostscript endpoint...');
            const checkEndpoint = await API.ghostscript.check();
            console.log('Endpoint:', checkEndpoint);
            const response = await fetch(checkEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            console.log('Response status:', response.status);
            if (response.ok) {
                const result = await response.json();
                console.log('Ghostscript check result:', result);
                return result.available === true;
            }
            return false;
        } catch (error) {
            console.error('Error checking Ghostscript:', error);
            return false;
        }
    }

    function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${formatFileSize(file.size)})`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        compressBtn.disabled = false;
    }

    function clearAll(preserveDroppedFilePath = false) {
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        compressBtn.disabled = true;
    }

    qualityRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'custom') {
                customQualitySection.style.display = 'block';
            } else {
                customQualitySection.style.display = 'none';
            }
        });
    });

    customQualitySlider.addEventListener('input', () => {
        qualityPercentage.value = customQualitySlider.value;
    });

    qualityPercentage.addEventListener('input', () => {
        let val = parseInt(qualityPercentage.value, 10);
        if (!isNaN(val) && val >= 1 && val <= 100) {
            customQualitySlider.value = val;
        }
    });

    qualityPercentage.addEventListener('blur', () => {
        let val = parseInt(qualityPercentage.value, 10);
        if (isNaN(val)) val = parseInt(customQualitySlider.value, 10);
        val = Math.min(100, Math.max(1, val));
        qualityPercentage.value = val;
        customQualitySlider.value = val;
    });

    function getSelectedQuality() {
        const selected = document.querySelector('input[name="quality"]:checked');
        if (selected.value === 'custom') {
            return {
                level: 'custom',
                value: parseInt(customQualitySlider.value)
            };
        }
        return { level: selected.value };
    }

    compressBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('compressPdfJS.selectFileFirst'), [i18n.t('common.ok')]);
            return;
        }

        // Double-check Ghostscript availability before compression
        loadingUI.show(i18n.t('compressPdfJS.verifyingGhostscript'));
        try {
            const isGhostscriptAvailable = await checkGhostscriptAvailability();
            if (!isGhostscriptAvailable) {
                loadingUI.hide();
                await customAlert.alert(
                    i18n.t('alerts.requirement'),
                    i18n.t('compressPdfJS.ghostscriptNotAvailable'),
                    [i18n.t('common.ok')]
                );
                return;
            }
        } catch (error) {
            loadingUI.hide();
            await customAlert.alert(
                i18n.t('alerts.error'),
                i18n.t('compressPdfJS.failedToVerifyGhostscript') + error.message,
                [i18n.t('common.ok')]
            );
            return;
        }

        const quality = getSelectedQuality();
        const options = buildCompressOptions(quality);
        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };

        try {
            loadingUI.show(i18n.t('compressPdfJS.compressingPdf'));
            compressBtn.disabled = true;
            compressBtn.textContent = i18n.t('compressPdfJS.compressingBtn');
            const compressEndpoint = await API.pdf.compress;
            const response = await fetch(compressEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `Request failed with status ${response.status}`);
            }

            const originalSize = parseInt(response.headers.get('X-Original-Size') || '0');
            const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0');
            const compressionRatio = parseFloat(response.headers.get('X-Compression-Ratio') || '0');
            const result = await response.blob();
            const arrayBuffer = await result.arrayBuffer();
            const defaultName = `${selectedFile.name.replace('.pdf', '')}_compressed.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

            if (savedPath) {
                const message = originalSize > 0
                    ? i18n.t('compressPdfJS.successMessageDetails') + formatFileSize(originalSize) + '\n' +
                    i18n.t('compressPdfJS.compressedSize') + formatFileSize(compressedSize) + '\n' +
                    i18n.t('compressPdfJS.spaceSaved') + compressionRatio.toFixed(1) + '%\n\n' +
                    'Saved to: ' + savedPath
                    : i18n.t('compressPdfJS.successMessageSimple') + savedPath;
                await customAlert.alert(i18n.t('alerts.success'), message, [i18n.t('common.ok')]);
            } else {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('compressPdfJS.operationCancelledOrFailed'), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error compressing PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('compressPdfJS.errorCompressingPdf') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.forceHide();
            compressBtn.disabled = false;
            compressBtn.textContent = i18n.t('compressPdf.compress-btn');
        }
    });

    function buildCompressOptions(quality) {
        let qualityEnum;
        let customQuality = null;

        switch (quality.level) {
            case 'low':
                qualityEnum = 0;
                break;
            case 'medium':
                qualityEnum = 1;
                break;
            case 'high':
                qualityEnum = 2;
                break;
            case 'custom':
                qualityEnum = 3;
                customQuality = quality.value;
                break;
            default:
                qualityEnum = 1;
        }
        return {
            quality: qualityEnum,
            customQuality: customQuality,
        };
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('compressPdfJS.dropOneFile'), [i18n.t('common.ok')]);
                return;
            }

            // Check if Ghostscript is available
            loadingUI.show(i18n.t('compressPdfJS.checkingGhostscript'));
            try {
                const isGhostscriptAvailable = await checkGhostscriptAvailability();

                if (!isGhostscriptAvailable) {
                    loadingUI.hide();
                    const result = await customAlert.alert(
                        i18n.t('alerts.requirement'),
                        i18n.t('compressPdfJS.ghostscriptRequired'),
                        [i18n.t('common.ok'), i18n.t('compressPdfJS.tutorial')]
                    );
                    if (result === 1) {
                        window.electronAPI.openExternal('https://youtu.be/fKrnSytg_z4');
                    }
                    return;
                }

                // Ghostscript is available, proceed with file processing
                loadingUI.updateMessage(i18n.t('compressPdfJS.processingDroppedFile'));
                await cleanupDroppedFile();
                const file = pdfFiles[0];
                const buffer = await file.arrayBuffer();
                const saveResult = await window.electronAPI.saveDroppedFile({
                    name: file.name,
                    buffer: buffer
                });
                if (saveResult.success) {
                    const fileSize = file.size || 0;
                    droppedFilePath = saveResult.filePath;
                    handleFileSelected({
                        path: saveResult.filePath,
                        name: file.name,
                        size: fileSize
                    });
                } else {
                    await customAlert.alert(i18n.t('alerts.error'), i18n.t('compressPdfJS.failedToSaveDrop') + saveResult.error, [i18n.t('common.ok')]);
                }
            } catch (error) {
                console.error('Error during Ghostscript check:', error);
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('compressPdfJS.errorCheckingGhostscript') + error.message,
                    [i18n.t('common.ok')]
                );
            } finally {
                loadingUI.hide();
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('compressPdfJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });
});
