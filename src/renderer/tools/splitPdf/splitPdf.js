// src/renderer/tools/splitPdf/splitPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
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
    let pdfDoc = null;
    let renderedPages = [];

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
        updateSplitButtonState();
    }

    async function loadPdfPreview(filePath) {
        loadingUI.show('Loading PDF preview...');
        try {
            previewContainer.style.display = 'block';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            const thumbnailPromises = [];
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                thumbnailPromises.push(renderPageThumbnail(pageNum));
            }
            await Promise.all(thumbnailPromises);
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
        previewGrid.appendChild(thumbWrapper);
        renderedPages.push(canvas);
    }

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
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a file first.', ['OK']);
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
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Page ranges cannot be empty.', ['OK']);
                } else {
                    options.pageRanges = pageRanges.split(',').map(r => r.trim());
                }
                break;
            case 'AtSpecificPages':
                const splitPages = document.getElementById('splitPages').value.trim();
                if (!splitPages) {
                    isValid = false;
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Specific pages cannot be empty.', ['OK']);
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
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Please enter a valid number of pages.', ['OK']);
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
            loadingUI.show('Splitting PDF...');
            splitBtn.disabled = true;
            splitBtn.textContent = 'Splitting...';

            const splitEndpoint = await API.pdf.split;
            const result = await API.request.post(splitEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();

                const defaultName = `${selectedFile.name.replace('.pdf', '')}_split.zip`;

                const savedPath = await window.electronAPI.saveZipFile(defaultName, arrayBuffer);

                if (savedPath) {
                    await customAlert.alert('LocalPDF Studio - SUCCESS', 'PDF split successfully!\nSaved to: ' + savedPath, ['OK']);
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
                }
            } else {
                console.error("Split API returned JSON:", result);
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            console.error('Error splitting PDF:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred while splitting the PDF:\n${error.message}`, ['OK']);
        } finally {
            loadingUI.hide();
            splitBtn.disabled = false;
            splitBtn.textContent = 'Split PDF';
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
