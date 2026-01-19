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


// src/renderer/tools/splitPdf/splitPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    await API.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const splitBtn = document.getElementById('split-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const splitMethodRadios = document.querySelectorAll('input[name="splitMethod"]');

    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('splitPdfJS.selectingPdfs'));
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

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    async function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        await loadPdfPreview(file.path);
        updateSplitButtonState();
    }

    async function loadPdfPreview(filePath) {
        loadingUI.show(i18n.t('splitPdfJS.loadingPreview'));
        try {
            previewContainer.style.display = 'block';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('splitPdfJS.failedToLoadPreview')}</p>`;
        } finally {
            loadingUI.hide();
        }
    }

    async function renderPageThumbnail(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const scale = 0.3;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'page-thumbnail';
        thumbWrapper.dataset.pageNum = pageNum;
        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = i18n.t('splitPdfJS.pageLabel') + pageNum;
        thumbWrapper.appendChild(canvas);
        thumbWrapper.appendChild(pageLabel);
        previewGrid.appendChild(thumbWrapper);
        renderedPages.push(canvas);
    }

    function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
        renderedPages.forEach(c => {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        });
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        updateSplitButtonState();
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
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfJS.dropOnlyOne'), ['OK']);
                return;
            }

            await cleanupDroppedFile();

            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({
                name: file.name,
                buffer: buffer
            });

            if (result.success) {
                const fileSize = file.size || 0;
                droppedFilePath = result.filePath;
                handleFileSelected({
                    path: result.filePath,
                    name: file.name,
                    size: fileSize
                });
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfJS.failedToSaveDrop') + result.error, ['OK']);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfJS.dropPdfFile'), ['OK']);
        }
    });

    splitMethodRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.options-panel').forEach(p => p.style.display = 'none');
            const panel = document.getElementById(`options${radio.value}`);
            if (panel) panel.style.display = 'block';
        });
    });

    function updateSplitButtonState() {
        splitBtn.disabled = !selectedFile;
    }

    splitBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfJS.selectFileFirst'), ['OK']);
            return;
        }

        const selectedMethod = document.querySelector('input[name="splitMethod"]:checked').value;
        let options = {};
        let isValid = true;

        switch (selectedMethod) {
            case 'ByPageRanges':
                const pageRanges = document.getElementById('pageRanges').value.trim();
                if (!pageRanges) {
                    isValid = false;
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfJS.pageRangesEmpty'), ['OK']);
                } else {
                    options.pageRanges = pageRanges.split(',').map(r => r.trim());
                }
                break;
            case 'AtSpecificPages':
                const splitPages = document.getElementById('splitPages').value.trim();
                if (!splitPages) {
                    isValid = false;
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfJS.specificPagesEmpty'), ['OK']);
                } else {
                    options.splitPages = splitPages.split(',')
                        .map(p => parseInt(p.trim()))
                        .filter(p => !isNaN(p));
                }
                break;
            case 'EveryNPages':
                const pageInterval = document.getElementById('pageInterval').value;
                if (!pageInterval || parseInt(pageInterval) <= 0) {
                    isValid = false;
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfJS.invalidPageInterval'), ['OK']);
                } else {
                    options.pageInterval = parseInt(pageInterval);
                }
                break;
        }

        if (!isValid) return;

        const requestBody = {
            filePath: selectedFile.path,
            method: getSplitMethodEnumValue(selectedMethod),
            options: options,
            outputFormat: 0
        };

        try {
            loadingUI.show(i18n.t('splitPdfJS.splittingPdf'));
            splitBtn.disabled = true;
            splitBtn.textContent = i18n.t('splitPdfJS.splittingBtn');

            const splitEndpoint = await API.pdf.split;
            const result = await API.request.post(splitEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();

                const defaultName = `${selectedFile.name.replace('.pdf', '')}_split.zip`;

                const savedPath = await window.electronAPI.saveZipFile(defaultName, arrayBuffer);

                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('splitPdfJS.successMsg') + '\n' + i18n.t('splitPdfJS.successSavedTo') + savedPath, ['OK']);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfJS.cancelledMsg'), ['OK']);
                }
            } else {
                console.error("Split API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfJS.errorMsg') + JSON.stringify(result), ['OK']);
            }
        } catch (error) {
            console.error('Error splitting PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfJS.errorSplitting') + error.message, ['OK']);
        } finally {
            loadingUI.hide();
            splitBtn.disabled = false;
            splitBtn.textContent = i18n.t('splitPdfJS.splitPdfBtn');
        }
    });

    function getSplitMethodEnumValue(methodName) {
        const methods = {
            'ByPageRanges': 0,
            'AtSpecificPages': 1,
            'EveryNPages': 2,
            'ExtractAllPages': 3,
        };
        return methods[methodName];
    }
});
