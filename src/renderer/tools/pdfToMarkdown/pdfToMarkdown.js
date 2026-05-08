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


// src/renderer/tools/pdfToMarkdown/pdfToMarkdown.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

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
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const includeImagesChk = document.getElementById('includeImages');
    const stripHeaderChk = document.getElementById('stripHeader');
    const stripFooterChk = document.getElementById('stripFooter');

    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfToMarkdownJS.selectingPdf'));
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            handleFileSelected({ path: filePath, name: fileName, size: fileSize });
        }
        loadingUI.hide();
    });

    removePdfBtn.addEventListener('click', async () => {
        await cleanupDroppedFile();
        clearAll();
    });

    document.querySelector('a[href="../../index.html"]')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await cleanupDroppedFile();
        clearAll();
        window.location.href = '../../index.html';
    });

    async function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        await loadPdfPreview(file.path);
        convertBtn.disabled = false;
    }

    async function loadPdfPreview(filePath) {
        try {
            loadingUI.show(i18n.t('pdfToMarkdownJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';

            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = i18n.t('pdfToMarkdownJS.totalPages') + pdfDoc.numPages;

            const pagesToShow = Math.min(pdfDoc.numPages, 6);
            for (let i = 1; i <= pagesToShow; i++) await renderPageThumbnail(i);

            if (pdfDoc.numPages > 6) {
                const more = document.createElement('div');
                more.className = 'page-thumbnail';
                more.style.cssText = 'display:flex;align-items:center;justify-content:center;';
                more.innerHTML = `<p style="color:#7f8c8d;text-align:center;font-size:0.8rem;">
                    +${pdfDoc.numPages - 6}${i18n.t('pdfToMarkdownJS.morePages')}
                </p>`;
                previewGrid.appendChild(more);
            }
        } catch (error) {
            console.error('Error loading PDF preview:', error);
            previewGrid.innerHTML = `<p style="color:#e74c3c;text-align:center;">
                ${i18n.t('pdfToMarkdownJS.failedToLoad')}
            </p>`;
        } finally {
            loadingUI.hide();
        }
    }

    async function renderPageThumbnail(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const scale = 0.25;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;

        const wrapper = document.createElement('div');
        wrapper.className = 'page-thumbnail';
        const label = document.createElement('div');
        label.className = 'page-label';
        label.textContent = i18n.t('pdfToMarkdownJS.pageLabel') + pageNum;
        wrapper.appendChild(canvas);
        wrapper.appendChild(label);
        previewGrid.appendChild(wrapper);
        renderedPages.push(canvas);
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

    function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        renderedPages.forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        if (!preserveDroppedFilePath) droppedFilePath = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        convertBtn.disabled = true;
    }

    async function getFileSize(filePath) {
        try {
            if (window.electronAPI?.getFileInfo) {
                const info = await window.electronAPI.getFileInfo(filePath);
                return info.size || 0;
            }
            return 0;
        } catch { return 0; }
    }

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(
                i18n.t('alerts.notice'),
                i18n.t('pdfToMarkdownJS.selectFileFirst'),
                [i18n.t('common.ok')]
            );
            return;
        }

        // Ask the user where to save BEFORE starting the conversion
        const outputFolder = await window.electronAPI.selectOutputFolder();
        if (!outputFolder) {
            // User cancelled the folder picker — ignore
            return;
        }

        const requestBody = {
            filePath: selectedFile.path,
            outputFolder: outputFolder,
            includeImages: includeImagesChk.checked,
            stripHeader: stripHeaderChk.checked,
            stripFooter: stripFooterChk.checked,
        };

        try {
            loadingUI.show(i18n.t('pdfToMarkdownJS.converting'));
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('pdfToMarkdownJS.converting');

            const endpoint = await API.pdf.pdfToMarkdown;
            const json = await API.request.post(endpoint, requestBody);

            let successMsg = i18n.t('pdfToMarkdownJS.successMessage');

            if (json.missingDependencies?.length) {
                successMsg += '\n\n' +
                    i18n.t('pdfToMarkdownJS.missingDepsWarning') +
                    json.missingDependencies.join(', ');
            }

            await customAlert.alert(
                i18n.t('alerts.success'),
                successMsg,
                [i18n.t('common.ok')]
            );

        } catch (error) {
            console.error('Conversion error:', error);

            try {
                const errorData = JSON.parse(error.message);

                if (errorData.folderExists) {
                    await customAlert.alert(
                        i18n.t('alerts.notice'),
                        i18n.t('pdfToMarkdownJS.folderExists') + `\n\n${errorData.folderPath}`,
                        [i18n.t('common.ok')]
                    );
                    return;
                }

                let errorMsg = errorData.error || i18n.t('pdfToMarkdownJS.conversionFailed');
                if (errorData.missingDependencies?.length) {
                    errorMsg = i18n.t('pdfToMarkdownJS.missingDeps') +
                        errorData.missingDependencies.join(', ');
                }

                await customAlert.alert(i18n.t('alerts.error'), errorMsg, [i18n.t('common.ok')]);
            } catch (parseError) {
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfToMarkdownJS.errorOccurred') + error.message,
                    [i18n.t('common.ok')]
                );
            }
        } finally {
            loadingUI.hide();
            convertBtn.disabled = false;
            convertBtn.textContent = i18n.t('pdfToMarkdown.convert-btn');
        }
    });

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(
                    i18n.t('alerts.notice'),
                    i18n.t('pdfToMarkdownJS.dropOneFile'),
                    [i18n.t('common.ok')]
                );
                return;
            }

            await cleanupDroppedFile();

            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });

            if (result.success) {
                droppedFilePath = result.filePath;
                handleFileSelected({ path: result.filePath, name: file.name, size: file.size || 0 });
            } else {
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfToMarkdownJS.failedToSave') + result.error,
                    [i18n.t('common.ok')]
                );
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(
                i18n.t('alerts.notice'),
                i18n.t('pdfToMarkdownJS.dropPdfFile'),
                [i18n.t('common.ok')]
            );
        },
    });
});