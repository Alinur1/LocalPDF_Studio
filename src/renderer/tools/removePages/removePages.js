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


// src/renderer/tools/removePages/removePages.js

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
    const removeBtn = document.getElementById('remove-btn');
    const previewBtn = document.getElementById('preview-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const selectionInfoEl = document.getElementById('selection-info');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const selectEvenBtn = document.getElementById('select-even-pages');
    const selectOddBtn = document.getElementById('select-odd-pages');
    const invertSelectionBtn = document.getElementById('invert-selection');
    const manualPagesInput = document.getElementById('manual-pages');
    const pageRangesInput = document.getElementById('page-ranges');
    const removeEvenCheckbox = document.getElementById('remove-even-pages');
    const removeOddCheckbox = document.getElementById('remove-odd-pages');
    const everyNthInput = document.getElementById('every-nth-page');
    const startFromInput = document.getElementById('start-from-page');
    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];
    let selectedPages = new Set();
    let totalPages = 0;

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('removePagesJS.selectingPdfs'));
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
        updateButtonStates();
    }

    async function loadPdfPreview(filePath) {
        try {
            loadingUI.show(i18n.t('removePagesJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;
            pageCountEl.textContent = `Total Pages: ${totalPages}`;
            previewGrid.innerHTML = '';
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('removePagesJS.failedToLoadPreview')}</p>`;
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
        pageLabel.textContent = i18n.t('removePagesJS.pageLabel') + pageNum;

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
        updateButtonStates();
    }

    function updateSelectionInfo() {
        const count = selectedPages.size;
        if (count === 0) {
            selectionInfoEl.textContent = i18n.t('removePagesJS.noPagesSelected');
            clearSelectionBtn.style.display = 'none';
        } else {
            const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
            if (count <= 10) {
                selectionInfoEl.textContent = `Selected: ${sortedPages.join(', ')} (${count} page${count > 1 ? 's' : ''})`;
            } else {
                selectionInfoEl.textContent = `${count} pages selected`;
            }
            clearSelectionBtn.style.display = 'block';
        }
    }

    clearSelectionBtn.addEventListener('click', () => {
        selectedPages.clear();
        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            thumb.classList.remove('selected');
        });
        updateSelectionInfo();
        updateButtonStates();
    });

    selectEvenBtn.addEventListener('click', () => {
        for (let i = 2; i <= totalPages; i += 2) {
            selectedPages.add(i);
            const thumb = document.querySelector(`.page-thumbnail[data-page-num="${i}"]`);
            if (thumb) thumb.classList.add('selected');
        }
        updateSelectionInfo();
        updateButtonStates();
    });

    selectOddBtn.addEventListener('click', () => {
        for (let i = 1; i <= totalPages; i += 2) {
            selectedPages.add(i);
            const thumb = document.querySelector(`.page-thumbnail[data-page-num="${i}"]`);
            if (thumb) thumb.classList.add('selected');
        }
        updateSelectionInfo();
        updateButtonStates();
    });

    invertSelectionBtn.addEventListener('click', () => {
        const newSelection = new Set();
        for (let i = 1; i <= totalPages; i++) {
            if (!selectedPages.has(i)) {
                newSelection.add(i);
            }
        }
        selectedPages = newSelection;

        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            const pageNum = parseInt(thumb.dataset.pageNum);
            if (selectedPages.has(pageNum)) {
                thumb.classList.add('selected');
            } else {
                thumb.classList.remove('selected');
            }
        });
        updateSelectionInfo();
        updateButtonStates();
    });

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
        totalPages = 0;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        manualPagesInput.value = '';
        pageRangesInput.value = '';
        removeEvenCheckbox.checked = false;
        removeOddCheckbox.checked = false;
        everyNthInput.value = '';
        startFromInput.value = '';

        updateButtonStates();
        updateSelectionInfo();
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

    function updateButtonStates() {
        const hasFile = selectedFile !== null;
        const hasSelection = selectedPages.size > 0 ||
            manualPagesInput.value.trim() !== '' ||
            pageRangesInput.value.trim() !== '' ||
            removeEvenCheckbox.checked ||
            removeOddCheckbox.checked ||
            everyNthInput.value.trim() !== '';

        removeBtn.disabled = !hasFile || !hasSelection;
        previewBtn.disabled = !hasFile || !hasSelection;
    }

    [manualPagesInput, pageRangesInput, removeEvenCheckbox, removeOddCheckbox, everyNthInput, startFromInput].forEach(input => {
        input.addEventListener('input', updateButtonStates);
        input.addEventListener('change', updateButtonStates);
    });

    previewBtn.addEventListener('click', () => {
        const pagesToRemove = collectPagesToRemove();
        if (pagesToRemove.size === 0) {
            customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.noPagesToRemove'), [i18n.t('common.ok')]);
            return;
        }
        if (pagesToRemove.size >= totalPages) {
            customAlert.alert(i18n.t('alerts.warning'), i18n.t('removePagesJS.cannotRemoveAllPages'), [i18n.t('common.ok')]);
            return;
        }

        const sortedPages = Array.from(pagesToRemove).sort((a, b) => a - b);
        const remaining = totalPages - pagesToRemove.size;
        customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.previewTitle') + '\n\n' + i18n.t('removePagesJS.pagesToRemoveLabel') + sortedPages.join(', ') + '\n' + i18n.t('removePagesJS.totalPagesToRemoveLabel') + pagesToRemove.size + '\n' + i18n.t('removePagesJS.remainingPagesLabel') + remaining, [i18n.t('common.ok')]);
    });

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.dropOnlyOne'), [i18n.t('common.ok')]);
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
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('removePagesJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    removeBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.selectFileFirst'), [i18n.t('common.ok')]);
            return;
        }

        const pagesToRemove = collectPagesToRemove();

        if (pagesToRemove.size === 0) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('removePagesJS.selectAtLeastOne'), [i18n.t('common.ok')]);
            return;
        }

        if (pagesToRemove.size >= totalPages) {
            await customAlert.alert(i18n.t('alerts.warning'), i18n.t('removePagesJS.cannotRemoveAllPages'), [i18n.t('common.ok')]);
            return;
        }

        const options = buildRemoveOptions(pagesToRemove);

        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };

        try {
            loadingUI.show(i18n.t('removePagesJS.removingPages'));
            removeBtn.disabled = true;
            removeBtn.textContent = i18n.t('removePagesJS.removingBtn');

            const removeEndpoint = await API.pdf.removePages;
            const result = await API.request.post(removeEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = `${selectedFile.name.replace('.pdf', '')}_removed_pages.pdf`;
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('removePagesJS.successMsg') + '\n' + i18n.t('removePagesJS.successSavedTo') + savedPath, [i18n.t('common.ok')]);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('removePagesJS.cancelledMsg'), [i18n.t('common.ok')]);
                }
            } else {
                console.error("Remove API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('removePagesJS.errorMsg') + JSON.stringify(result), [i18n.t('common.ok')]);
            }
        } catch (error) {            
            console.error('Error removing pages:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('removePagesJS.errorRemoving') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            removeBtn.disabled = false;
            removeBtn.textContent = i18n.t('removepages.remove-pages');
        }
    });

    function collectPagesToRemove() {
        const pagesToRemove = new Set(selectedPages);
        const manualPages = manualPagesInput.value.trim();
        if (manualPages) {
            const pages = manualPages.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p >= 1 && p <= totalPages);
            pages.forEach(p => pagesToRemove.add(p));
        }
        const ranges = pageRangesInput.value.trim();
        if (ranges) {
            const rangeList = ranges.split(',').map(r => r.trim());
            rangeList.forEach(range => {
                const parts = range.split('-');
                if (parts.length === 2) {
                    const start = parseInt(parts[0].trim());
                    const end = parseInt(parts[1].trim());
                    if (!isNaN(start) && !isNaN(end) && start >= 1 && end <= totalPages && start <= end) {
                        for (let i = start; i <= end; i++) {
                            pagesToRemove.add(i);
                        }
                    }
                }
            });
        }

        if (removeEvenCheckbox.checked) {
            for (let i = 2; i <= totalPages; i += 2) {
                pagesToRemove.add(i);
            }
        }
        if (removeOddCheckbox.checked) {
            for (let i = 1; i <= totalPages; i += 2) {
                pagesToRemove.add(i);
            }
        }
        const everyNth = parseInt(everyNthInput.value);
        if (!isNaN(everyNth) && everyNth > 0) {
            const startFrom = parseInt(startFromInput.value) || everyNth;
            for (let i = startFrom; i <= totalPages; i += everyNth) {
                pagesToRemove.add(i);
            }
        }
        return pagesToRemove;
    }

    function buildRemoveOptions(pagesToRemove) {
        const options = {};
        const pagesArray = Array.from(pagesToRemove).sort((a, b) => a - b);
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
});
