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


// src/renderer/tools/pdfGrayscale/pdfGrayscale.js

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
    const pageRangeRadios = document.querySelectorAll('input[name="pageRange"]');
    const pageRangeInputs = document.getElementById('page-range-inputs');
    const startPageInput = document.getElementById('startPage');
    const endPageInput = document.getElementById('endPage');

    let selectedFile = null;
    let droppedFilePath = null; // Track dropped file path for cleanup
    let pdfDoc = null;
    let renderedPages = [];

    // Initialize drag and drop
    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            console.log(`Files dropped: ${pdfFiles.length} file(s), current droppedFilePath: ${droppedFilePath}`);

            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfGrayscaleJS.dropOneFile'), [i18n.t('common.ok')]);
                return;
            }

            // Clean up previous dropped file before saving new one
            console.log('Calling cleanupDroppedFile before processing new drop');
            await cleanupDroppedFile();

            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({
                name: file.name,
                buffer: buffer
            });

            if (result.success) {
                const fileSize = file.size || 0;
                droppedFilePath = result.filePath; // Track the dropped file for cleanup
                console.log(`New file dropped and saved: ${droppedFilePath}`);
                handleFileSelected({
                    path: result.filePath,
                    name: file.name,
                    size: fileSize
                });
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfGrayscaleJS.failedToSave') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfGrayscaleJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfGrayscaleJS.selectingPdfs'));
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

    pageRangeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            pageRangeInputs.style.display = e.target.value === 'range' ? 'block' : 'none';
        });
    });

    startPageInput.addEventListener('change', () => {
        let value = parseInt(startPageInput.value);
        if (value < 1) startPageInput.value = 1;
        if (value > pdfDoc?.numPages) startPageInput.value = pdfDoc.numPages;

        // Ensure endPage is not less than startPage
        if (parseInt(endPageInput.value) < parseInt(startPageInput.value)) {
            endPageInput.value = startPageInput.value;
        }
    });

    endPageInput.addEventListener('change', () => {
        let value = parseInt(endPageInput.value);
        if (value < 1) endPageInput.value = 1;
        if (value > pdfDoc?.numPages) endPageInput.value = pdfDoc.numPages;
        if (value < parseInt(startPageInput.value)) {
            endPageInput.value = startPageInput.value;
        }
    });

    async function handleFileSelected(file) {
        clearAll(true); // true = preserve droppedFilePath
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
            loadingUI.show(i18n.t('pdfGrayscaleJS.loadingPreview') || 'Loading preview...');
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = (i18n.t('pdfGrayscaleJS.totalPages') || 'Total Pages: ') + pdfDoc.numPages;

            // Update range inputs with max values
            startPageInput.max = pdfDoc.numPages;
            endPageInput.max = pdfDoc.numPages;
            endPageInput.value = pdfDoc.numPages;

            previewGrid.innerHTML = '';
            const pagesToShow = Math.min(pdfDoc.numPages, 6);
            for (let i = 1; i <= pagesToShow; i++) await renderPageThumbnail(i);

            if (pdfDoc.numPages > 6) {
                const more = document.createElement('div');
                more.className = 'page-thumbnail';
                more.style.cssText = 'display:flex;align-items:center;justify-content:center;';
                more.innerHTML = `<p style="color:#7f8c8d;text-align:center;font-size:0.8rem;">+${pdfDoc.numPages - 6}${i18n.t('pdfGrayscaleJS.morePages') || ' more pages'}</p>`;
                previewGrid.appendChild(more);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('pdfGrayscaleJS.failedToLoad') || 'Failed to load PDF preview'}</p>`;
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
        label.textContent = (i18n.t('pdfGrayscaleJS.pageLabel') || 'Page ') + pageNum;
        wrapper.appendChild(canvas);
        wrapper.appendChild(label);
        previewGrid.appendChild(wrapper);
        renderedPages.push(canvas);
    }

    async function cleanupDroppedFile() {
        if (droppedFilePath) {
            try {
                console.log(`Attempting to cleanup file: ${droppedFilePath}`);
                const result = await window.electronAPI.deleteFile(droppedFilePath);
                console.log(`Cleanup result:`, result);
                droppedFilePath = null;
            } catch (error) {
                console.error('Error cleaning up dropped file:', error);
            }
        } else {
            console.log('No dropped file to cleanup (droppedFilePath is null)');
        }
    }

    function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        renderedPages.forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
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
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfGrayscaleJS.selectFileFirst') || 'Please select a PDF file first', [i18n.t('common.ok')]);
            return;
        }

        // Get page range from radio buttons
        const pageRange = document.querySelector('input[name="pageRange"]:checked').value;
        let startPage = 1;
        let endPage = pdfDoc.numPages;

        if (pageRange === 'range') {
            startPage = parseInt(document.getElementById('startPage').value);
            endPage = parseInt(document.getElementById('endPage').value);

            // Validation
            if (startPage < 1 || endPage < startPage) {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfGrayscaleJS.invalidPageRange') || 'Invalid page range', [i18n.t('common.ok')]);
                return;
            }

            if (endPage > pdfDoc.numPages) {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfGrayscaleJS.pageRangeExceedsTotal') || `End page cannot exceed total pages (${pdfDoc.numPages})`, [i18n.t('common.ok')]);
                return;
            }
        }

        // Simple request body matching the backend model
        const requestBody = {
            filePath: selectedFile.path,
            // PyMuPDF handles the conversion automatically, so we just need basic options
            preserveImages: document.getElementById('preserveImages').checked,
            pagesRange: pageRange === 'all' ? 'all' : 'range',
            startPage: startPage,
            endPage: endPage
        };

        try {
            loadingUI.show(i18n.t('pdfGrayscaleJS.convertingPdf') || 'Converting PDF to grayscale...');
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('pdfGrayscaleJS.convertingPdf') || 'Converting...';

            // Get the endpoint
            const endpoint = await API.pdf.grayscale;

            // Make the request
            const result = await API.request.post(endpoint, requestBody);

            if (result instanceof Blob) {
                // Download the result
                const url = window.URL.createObjectURL(result);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedFile.name.replace('.pdf', '_grayscale.pdf');
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                await customAlert.alert(
                    i18n.t('alerts.success'),
                    i18n.t('pdfGrayscaleJS.conversionSuccess') || 'PDF converted to grayscale successfully!',
                    [i18n.t('common.ok')]
                );

                // Clean up and reset
                await cleanupDroppedFile();
                clearAll();
            } else if (result && result.success === false) {
                const errorMsg = result.message || result.error || i18n.t('pdfGrayscaleJS.conversionFailed') || 'Failed to convert PDF';
                await customAlert.alert(i18n.t('alerts.error'), errorMsg, [i18n.t('common.ok')]);
            } else {
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfGrayscaleJS.unexpectedResponse') || 'Unexpected response from server',
                    [i18n.t('common.ok')]
                );
            }
        } catch (error) {
            console.error('Conversion error:', error);
            const errorMsg = error.message || i18n.t('pdfGrayscaleJS.conversionError') || 'An error occurred during conversion';
            await customAlert.alert(i18n.t('alerts.error'), errorMsg, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            convertBtn.disabled = false;
            convertBtn.textContent = i18n.t('pdfGrayscale.convert-btn') || 'Convert to Grayscale';
        }
    });
});