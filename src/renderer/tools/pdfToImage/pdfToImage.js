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


// src/renderer/tools/pdfToImage/pdfToImage.js

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
    const convertBtn = document.getElementById('convert-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const imageQualitySelect = document.getElementById('imageQuality');
    const imageFormatSelect = document.getElementById('imageFormat');
    const includePageNumbersCheckbox = document.getElementById('includePageNumbers');
    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfToImageJS.selectingPdfs'));
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
        updateConvertButtonState();
    }

    async function loadPdfPreview(filePath) {
        try {
            loadingUI.show(i18n.t('pdfToImageJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('pdfToImageJS.failedToLoadPreview')}</p>`;
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
        pageLabel.textContent = `Page ${pageNum}`;
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
        updateConvertButtonState();
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

    function updateConvertButtonState() {
        convertBtn.disabled = !selectedFile;
    }

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToImageJS.dropOnlyOne'), [i18n.t('common.ok')]);
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
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToImageJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToImageJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToImageJS.selectFileFirst'), [i18n.t('common.ok')]);
            return;
        }

        const dpi = parseInt(imageQualitySelect.value);
        const format = imageFormatSelect.value;
        const includePageNumbers = includePageNumbersCheckbox.checked;

        const requestBody = {
            filePath: selectedFile.path,
            dpi: dpi,
            format: format,
            includePageNumbers: includePageNumbers
        };

        try {
            loadingUI.show(i18n.t('pdfToImageJS.convertingPdf'));
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('pdfToImageJS.convertingPdf');
            const convertEndpoint = await API.pdf.toJpg;
            const result = await API.request.post(convertEndpoint, requestBody);            
            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();

                const baseName = selectedFile.name.replace('.pdf', '');
                const defaultName = `${baseName}_images.zip`;

                const savedPath = await window.electronAPI.saveZipFile(defaultName, arrayBuffer);

                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('pdfToImageJS.successMsg') + '\n' + i18n.t('pdfToImageJS.successSavedTo') + savedPath, [i18n.t('common.ok')]);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('pdfToImageJS.cancelledMsg'), [i18n.t('common.ok')]);
                }
            } else {
                console.error("Convert API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToImageJS.errorMsg') + JSON.stringify(result), [i18n.t('common.ok')]);
            }
        } catch (error) {            
            console.error('Error converting PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToImageJS.errorConverting') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            convertBtn.disabled = false;
            convertBtn.textContent = i18n.t('pdftoImg.convert-to-image');
        }
    });
});
