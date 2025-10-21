// src/renderer/tools/removePages/removePages.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
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
    let pdfDoc = null;
    let renderedPages = [];
    let selectedPages = new Set();
    let totalPages = 0;

    selectPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            handleFileSelected({ path: filePath, name: fileName, size: fileSize });
        }
    });

    removePdfBtn.addEventListener('click', () => clearAll());

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    async function handleFileSelected(file) {
        clearAll();
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
            loadingUI.show('Loading PDF preview...');
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
            previewGrid.innerHTML = '<p style="color: #e74c3c; text-align: center;">Failed to load PDF preview</p>';
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
            selectionInfoEl.textContent = 'No pages selected';
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

    function clearAll() {
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
        selectedPages.clear();
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
            customAlert.alert('LocalPDF Studio - NOTICE', 'No pages selected for removal.', ['OK']);
            return;
        }
        if (pagesToRemove.size >= totalPages) {
            customAlert.alert('LocalPDF Studio - WARNING', 'Cannot remove all pages from the PDF.', ['OK']);
            return;
        }

        const sortedPages = Array.from(pagesToRemove).sort((a, b) => a - b);
        const remaining = totalPages - pagesToRemove.size;
        customAlert.alert('LocalPDF Studio - NOTICE', `Preview:\n\nPages to remove: ${sortedPages.join(', ')}\nTotal pages to remove: ${pagesToRemove.size}\nRemaining pages: ${remaining}`, ['OK']);
    });

    removeBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a file first.', ['OK']);
            return;
        }

        const pagesToRemove = collectPagesToRemove();

        if (pagesToRemove.size === 0) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select at least one page to remove.', ['OK']);
            return;
        }

        if (pagesToRemove.size >= totalPages) {
            await customAlert.alert('LocalPDF Studio - WARNING', 'Cannot remove all pages from the PDF.', ['OK']);
            return;
        }

        const options = buildRemoveOptions(pagesToRemove);

        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };

        try {
            loadingUI.show('Removing pages...');
            removeBtn.disabled = true;
            removeBtn.textContent = 'Removing...';

            const removeEndpoint = await API.pdf.removePages;
            const result = await API.request.post(removeEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = `${selectedFile.name.replace('.pdf', '')}_removed_pages.pdf`;
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

                loadingUI.hide();
                if (savedPath) {
                    await customAlert.alert('LocalPDF Studio - SUCCESS', `Success! Pages removed successfully!\nSaved to: ${savedPath}`, ['OK']);
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
                }
            } else {
                loadingUI.hide();
                console.error("Remove API returned JSON:", result);
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            loadingUI.hide();
            console.error('Error removing pages:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred while removing pages:\n${error.message}`, ['OK']);
        } finally {
            removeBtn.disabled = false;
            removeBtn.textContent = 'Remove Pages';
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
