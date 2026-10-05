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


// src/renderer/tools/pdfToExcel/pdfToExcel.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';
import { ThemeManager } from '../../utils/themeManager.js';
import { pathToFileURL } from '../../utils/fileUrl.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    await API.init();
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
    const selectionInfoEl = document.getElementById('selection-info');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const flavorSelect = document.getElementById('tableFlavor');
    const formatRadios = document.querySelectorAll('input[name="output-format"]');
    const pagesInput = document.getElementById('pages-input');
    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];
    let selectedPages = new Set();
    let totalPages = 0;

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfToExcelJS.selectingPdfs'));
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            await handleFileSelected({ path: filePath, name: fileName, size: fileSize });
        }
        loadingUI.hide();
    });

    removePdfBtn.addEventListener('click', async () => {
        await cleanupDroppedFile();
        await clearAll();
    });

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            await clearAll();
            window.location.href = '../../index.html';
        });
    }

    async function handleFileSelected(file) {
        await clearAll(true);
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
            loadingUI.show(i18n.t('pdfToExcelJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const fileUrl = pathToFileURL(filePath);
            const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;
            pageCountEl.textContent = `Total Pages: ${totalPages}`;
            previewGrid.innerHTML = '';
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('pdfToExcelJS.failedToLoadPreview')}</p>`;
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
        pageLabel.textContent = i18n.t('pdfToExcelJS.pageLabel') + pageNum;

        thumbWrapper.appendChild(canvas);
        thumbWrapper.appendChild(pageLabel);

        thumbWrapper.addEventListener('click', () => {
            togglePageSelection(pageNum, thumbWrapper);
        });

        previewGrid.appendChild(thumbWrapper);
        renderedPages.push(canvas);
    }

    function togglePageSelection(pageNum, element) {
        if (selectedPages.has(pageNum)) {
            selectedPages.delete(pageNum);
            element.classList.remove('selected');
        } else {
            selectedPages.add(pageNum);
            element.classList.add('selected');
        }
        updateSelectionInfo();
    }

    function updateSelectionInfo() {
        const count = selectedPages.size;
        if (count === 0) {
            selectionInfoEl.textContent = i18n.t('pdftoExcel.no-pages-selected');
            clearSelectionBtn.style.display = 'none';
        } else {
            const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
            selectionInfoEl.textContent = `${i18n.t('pdfToExcelJS.pagesSelected')}: ${sortedPages.join(', ')}`;
            clearSelectionBtn.style.display = 'block';
        }
    }

    clearSelectionBtn.addEventListener('click', () => {
        selectedPages.clear();
        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            thumb.classList.remove('selected');
        });
        updateSelectionInfo();
    });

    function getSelectedFormat() {
        const checked = document.querySelector('input[name="output-format"]:checked');
        return checked ? checked.value : 'xlsx';
    }

    function collectPagesToConvert() {
        const pagesToConvert = new Set(selectedPages);
        const input = pagesInput.value.trim();
        if (input) {
            const parts = input.split(',').map(p => p.trim()).filter(p => p.length > 0);
            parts.forEach(part => {
                if (part.includes('-')) {
                    const rangeParts = part.split('-').map(p => p.trim());
                    if (rangeParts.length === 2) {
                        const start = parseInt(rangeParts[0]);
                        const end = parseInt(rangeParts[1]);
                        if (!isNaN(start) && !isNaN(end)) {
                            const s = Math.min(start, end);
                            const e = Math.max(start, end);
                            for (let i = s; i <= e; i++) {
                                if (i >= 1 && i <= totalPages) pagesToConvert.add(i);
                            }
                        }
                    }
                } else {
                    const page = parseInt(part);
                    if (!isNaN(page) && page >= 1 && page <= totalPages) {
                        pagesToConvert.add(page);
                    }
                }
            });
        }
        return pagesToConvert;
    }

    function buildConvertOptions(pagesToConvert) {
        const options = {
            flavor: flavorSelect ? flavorSelect.value : 'auto',
            format: getSelectedFormat()
        };
        const pagesArray = Array.from(pagesToConvert).sort((a, b) => a - b);
        const ranges = [];
        const individualPages = [];

        let rangeStart = null;
        let rangeEnd = null;

        for (let i = 0; i < pagesArray.length; i++) {
            const currentPage = pagesArray[i];

            if (rangeStart === null) {
                rangeStart = currentPage;
                rangeEnd = currentPage;
            } else if (currentPage === rangeEnd + 1) {
                rangeEnd = currentPage;
            } else {
                if (rangeEnd - rangeStart >= 2) {
                    ranges.push(`${rangeStart}-${rangeEnd}`);
                } else {
                    for (let j = rangeStart; j <= rangeEnd; j++) {
                        individualPages.push(j);
                    }
                }
                rangeStart = currentPage;
                rangeEnd = currentPage;
            }
        }
        if (rangeStart !== null) {
            if (rangeEnd - rangeStart >= 2) {
                ranges.push(`${rangeStart}-${rangeEnd}`);
            } else {
                for (let j = rangeStart; j <= rangeEnd; j++) {
                    individualPages.push(j);
                }
            }
        }
        if (individualPages.length > 0) {
            options.pages = individualPages;
        }
        if (ranges.length > 0) {
            options.pageRanges = ranges;
        }
        return options;
    }

    function updateConvertButtonState() {
        convertBtn.disabled = !selectedFile;
    }

    async function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) {
            try {
                await pdfDoc.cleanup();
            } catch (e) {
                console.warn('Error cleaning up PDF doc:', e);
            }
            pdfDoc = null;
        }
        renderedPages.forEach(c => {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        });
        renderedPages = [];
        selectedPages.clear();
        totalPages = 0;
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        pagesInput.value = '';
        updateSelectionInfo();
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

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToExcelJS.dropOnlyOne'), [i18n.t('common.ok')]);
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
                await handleFileSelected({
                    path: result.filePath,
                    name: file.name,
                    size: fileSize
                });
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToExcelJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToExcelJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('pdfToExcelJS.selectFileFirst'), [i18n.t('common.ok')]);
            return;
        }

        const pagesToConvert = collectPagesToConvert();
        const options = buildConvertOptions(pagesToConvert);
        const format = options.format;

        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };

        const originalText = convertBtn.textContent;
        try {
            loadingUI.show(i18n.t('pdfToExcelJS.convertingFile'));
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('pdfToExcelJS.convertingBtn');

            const convertEndpoint = await API.pdf.pdfToExcel;
            const result = await API.request.post(convertEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const baseName = selectedFile.name.replace(/\.pdf$/i, '');

                let savedPath = null;
                if (format === 'csv') {
                    savedPath = await window.electronAPI.saveZipFile(`${baseName}_tables_csv.zip`, arrayBuffer);
                } else {
                    savedPath = await window.electronAPI.saveExcelFile(`${baseName}_tables.xlsx`, arrayBuffer);
                }

                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('pdfToExcelJS.successMsg') + '\n' + i18n.t('pdfToExcelJS.successSavedTo') + savedPath, [i18n.t('common.ok')]);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('pdfToExcelJS.cancelledMsg'), [i18n.t('common.ok')]);
                }
            } else {
                console.error("Convert API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToExcelJS.errorConverting') + JSON.stringify(result), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error converting PDF to Excel:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('pdfToExcelJS.errorConverting') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            convertBtn.disabled = false;
            convertBtn.textContent = originalText;
        }
    });
});
