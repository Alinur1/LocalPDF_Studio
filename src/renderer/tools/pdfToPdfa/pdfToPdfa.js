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


// src/renderer/tools/pdfToPdfa/pdfToPdfa.js

import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import { ThemeManager } from '../../utils/themeManager.js';
import i18n from '../../utils/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const convertBtn = document.getElementById('convert-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');

    let selectedFile = null;
    let droppedFilePath = null;

    // ─── Ghostscript check ───────────────────────────────────────────────────

    async function checkGhostscriptAvailability() {
        try {
            const checkEndpoint = await API.ghostscript.check();
            const response = await fetch(checkEndpoint, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                const result = await response.json();
                return result.available === true;
            }
            return false;
        } catch (error) {
            console.error('Error checking Ghostscript:', error);
            return false;
        }
    }

    // ─── File handling ───────────────────────────────────────────────────────

    function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${formatFileSize(file.size)})`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        convertBtn.disabled = false;
    }

    function clearAll(preserveDroppedFilePath = false) {
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        convertBtn.disabled = true;
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

    // ─── Select PDF button ───────────────────────────────────────────────────

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfToPdfAJS.checking-gs'));
        try {
            const isGhostscriptAvailable = await checkGhostscriptAvailability();
            if (!isGhostscriptAvailable) {
                loadingUI.hide();
                const result = await customAlert.alert(
                    i18n.t('alerts.requirement'),
                    i18n.t('pdfToPdfAJS.gs-required-msg'),
                    [i18n.t('common.ok'), i18n.t('pdfToPdfAJS.tutorial')]
                );
                if (result === 1) {
                    window.electronAPI.openExternal('https://youtu.be/fKrnSytg_z4');
                }
                return;
            }

            loadingUI.updateMessage(i18n.t('pdfToPdfAJS.selecting-pdf'));
            const files = await window.electronAPI.selectPdfs();
            if (files && files.length > 0) {
                const filePath = files[0];
                const fileName = filePath.split(/[\\/]/).pop();
                const fileSize = await getFileSize(filePath);
                handleFileSelected({ path: filePath, name: fileName, size: fileSize });
            }
        } catch (error) {
            console.error('Error during file selection:', error);
            await customAlert.alert(
                i18n.t('alerts.error'),
                i18n.t('pdfToPdfAJS.file-selection-error'),
                [i18n.t('common.ok')]
            );
        } finally {
            loadingUI.hide();
        }
    });

    // ─── Remove button ───────────────────────────────────────────────────────

    removePdfBtn.addEventListener('click', async () => {
        await cleanupDroppedFile();
        clearAll();
    });

    // ─── Back button ─────────────────────────────────────────────────────────

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    // ─── Options ─────────────────────────────────────────────────────────────

    function getSelectedOptions() {
        const conformance = document.querySelector('input[name="conformance"]:checked').value;
        const fontEmbed = document.querySelector('input[name="fontEmbed"]:checked').value;
        return { conformance, fontEmbed };
    }

    // ─── Convert button ───────────────────────────────────────────────────────

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToPdfAJS.select-pdf'), [i18n.t('common.ok')]);
            return;
        }

        // Re-verify Ghostscript before converting
        loadingUI.show(i18n.t('pdfToPdfAJS.verifying-gs'));
        try {
            const isGhostscriptAvailable = await checkGhostscriptAvailability();
            if (!isGhostscriptAvailable) {
                loadingUI.hide();
                await customAlert.alert(
                    i18n.t('alerts.requirement'),
                    i18n.t('pdfToPdfAJS.gs-na'),
                    [i18n.t('common.ok')]
                );
                return;
            }
        } catch (error) {
            loadingUI.hide();
            console.log("Failed to verify Ghostscript: ", error);
            await customAlert.alert(
                i18n.t('alerts.error'),
                i18n.t('pdfToPdfAJS.gs-verify-failed'),
                [i18n.t('common.ok')]
            );
            return;
        }

        const { conformance, fontEmbed } = getSelectedOptions();
        const requestBody = {
            filePath: selectedFile.path,
            options: {
                conformanceLevel: conformance,
                embedAllFonts: fontEmbed === 'embed',
                subsetFonts: fontEmbed === 'subset'
            }
        };

        try {
            loadingUI.show(i18n.t('pdfToPdfAJS.converting-pdfa'));
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('pdfToPdfAJS.converting');

            const convertEndpoint = await API.pdf.pdfToPdfa;
            const response = await fetch(convertEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `Request failed with status ${response.status}`);
            }

            const result = await response.blob();
            const arrayBuffer = await result.arrayBuffer();
            const baseName = selectedFile.name.replace(/\.pdf$/i, '');
            const defaultName = `${baseName}_pdfa.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

            if (savedPath) {
                await customAlert.alert(
                    i18n.t('alerts.success'),
                    i18n.t('pdfToPdfAJS.conversion-success'),
                    [i18n.t('common.ok')]
                );
            } else {
                await customAlert.alert(i18n.t('common.warning'), i18n.t('pdfToPdfAJS.conversion-cancalled'), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error converting PDF:', error);
            await customAlert.alert(
                i18n.t('alerts.error'),
                i18n.t('pdfToPdfAJS.conversion-error'),
                [i18n.t('common.ok')]
            );
        } finally {
            loadingUI.forceHide();
            convertBtn.disabled = false;
            convertBtn.textContent = i18n.t('pdfToPdfAJS.convert-btn');
        }
    });

    // ─── Drag & Drop ─────────────────────────────────────────────────────────

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToPdfAJS.drop-one-file'), [i18n.t('common.ok')]);
                return;
            }

            loadingUI.show(i18n.t('pdfToPdfAJS.checking-gs'));
            try {
                const isGhostscriptAvailable = await checkGhostscriptAvailability();
                if (!isGhostscriptAvailable) {
                    loadingUI.hide();
                    const result = await customAlert.alert(
                        i18n.t('alerts.requirement'),
                        i18n.t('pdfToPdfAJS.gs-required-msg'),
                        [i18n.t('common.ok'), i18n.t('pdfToPdfAJS.tutorial')]
                    );
                    if (result === 1) {
                        window.electronAPI.openExternal('https://youtu.be/fKrnSytg_z4');
                    }
                    return;
                }

                loadingUI.updateMessage(i18n.t('pdfToPdfAJS.processing-droppped-file'));
                await cleanupDroppedFile();
                const file = pdfFiles[0];
                const buffer = await file.arrayBuffer();
                const saveResult = await window.electronAPI.saveDroppedFile({
                    name: file.name,
                    buffer: buffer
                });

                if (saveResult.success) {
                    droppedFilePath = saveResult.filePath;
                    handleFileSelected({
                        path: saveResult.filePath,
                        name: file.name,
                        size: file.size || 0
                    });
                } else {
                    console.error('Failed to save dropped file: ', error);
                    await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToPdfAJS.dropped-error'), [i18n.t('common.ok')]);
                }
            } catch (error) {
                console.error('Error processing dropped file:', error);
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfToPdfAJS.dropped-error2'),
                    [i18n.t('common.ok')]
                );
            } finally {
                loadingUI.hide();
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToPdfAJS.drop-valid-pdf'), [i18n.t('common.ok')]);
        }
    });

    // ─── Helpers ─────────────────────────────────────────────────────────────

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
});