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


// src/renderer/tools/addPageNumbers/addPageNumbers.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const addBtn = document.getElementById('add-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');

    let selectedFile = null;
    let droppedFilePath = null; // Track dropped file path for cleanup
    let pdfDoc = null;
    let renderedPages = [];

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('addPageNumbersJS.selectingPdfs'));
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
        clearAll(true); // true = preserve droppedFilePath
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        await loadPdfPreview(file.path);
        addBtn.disabled = false;
    }

    async function loadPdfPreview(filePath) {
        try {
            loadingUI.show(i18n.t('addPageNumbersJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = i18n.t('addPageNumbersJS.totalPages') + pdfDoc.numPages;
            previewGrid.innerHTML = '';
            const pagesToShow = Math.min(pdfDoc.numPages, 6);
            for (let i = 1; i <= pagesToShow; i++) await renderPageThumbnail(i);
            if (pdfDoc.numPages > 6) {
                const more = document.createElement('div');
                more.className = 'page-thumbnail';
                more.style.cssText = 'display:flex;align-items:center;justify-content:center;';
                more.innerHTML = `<p style="color:#7f8c8d;text-align:center;font-size:0.8rem;">+${pdfDoc.numPages - 6}${i18n.t('addPageNumbersJS.morePages')}</p>`;
                previewGrid.appendChild(more);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('addPageNumbersJS.failedToLoad')}</p>`;
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
        label.textContent = i18n.t('addPageNumbersJS.pageLabel') + pageNum;
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
        addBtn.disabled = true;
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

    addBtn.addEventListener('click', async () => {
        if (!selectedFile) { await customAlert.alert(i18n.t('alerts.notice'), i18n.t('addPageNumbersJS.selectFileFirst'), [i18n.t('common.ok')]); return; }

        const positionMap = {
            'TopLeft': 0, 'TopCenter': 1, 'TopRight': 2,
            'BottomLeft': 3, 'BottomCenter': 4, 'BottomRight': 5
        };
        const formatMap = {
            'Number': 0, 'PageOfTotal': 1, 'NumberWithDash': 2,
            'RomanLower': 3, 'RomanUpper': 4
        };

        const requestBody = {
            filePath: selectedFile.path,
            position: positionMap[document.getElementById('position').value],
            format: formatMap[document.getElementById('format').value],
            fontSize: parseInt(document.getElementById('fontSize').value),
            startPage: parseInt(document.getElementById('startPage').value),
            startNumber: parseInt(document.getElementById('startNumber').value)
        };

        try {
            loadingUI.show(i18n.t('addPageNumbersJS.addingPageNumbers'));
            addBtn.disabled = true;
            addBtn.textContent = i18n.t('addPageNumbersJS.addingPageNumbers');
            const endpoint = await API.pdf.addPageNumbers;
            const result = await API.request.post(endpoint, requestBody);
            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedFile.name.replace('.pdf', '_numbered.pdf');
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) await customAlert.alert(i18n.t('alerts.success'), i18n.t('addPageNumbersJS.successMessage') + savedPath, [i18n.t('common.ok')]);
                else await customAlert.alert(i18n.t('alerts.warning'), i18n.t('addPageNumbersJS.cancelOrFailed'), [i18n.t('common.ok')]);
            } else {
                console.error("API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('addPageNumbersJS.error') + JSON.stringify(result), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('addPageNumbersJS.errorOccurred') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            addBtn.disabled = false;
            addBtn.textContent = i18n.t('addPageNumbers.addPageNumberBtn');
        }
    });

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            console.log(`Files dropped: ${pdfFiles.length} file(s), current droppedFilePath: ${droppedFilePath}`);

            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('addPageNumbersJS.dropOneFile'), [i18n.t('common.ok')]);
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
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('addPageNumbersJS.failedToSave') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('addPageNumbersJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });
});
