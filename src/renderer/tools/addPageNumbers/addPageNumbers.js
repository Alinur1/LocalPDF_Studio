// src/renderer/tools/addPageNumbers/addPageNumbers.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

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
    let pdfDoc = null;
    let renderedPages = [];

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show("Selecting PDF files...");
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            handleFileSelected({ path: filePath, name: fileName, size: fileSize });
        }
        loadingUI.hide();
    });

    removePdfBtn.addEventListener('click', () => clearAll());

    document.querySelector('a[href="../../index.html"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        clearAll();
        window.location.href = '../../index.html';
    });

    async function handleFileSelected(file) {
        clearAll();
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
            loadingUI.show('Loading PDF preview...');
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            const pagesToShow = Math.min(pdfDoc.numPages, 6);
            for (let i = 1; i <= pagesToShow; i++) await renderPageThumbnail(i);
            if (pdfDoc.numPages > 6) {
                const more = document.createElement('div');
                more.className = 'page-thumbnail';
                more.style.cssText = 'display:flex;align-items:center;justify-content:center;';
                more.innerHTML = `<p style="color:#7f8c8d;text-align:center;font-size:0.8rem;">+${pdfDoc.numPages - 6} more</p>`;
                previewGrid.appendChild(more);
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
        label.textContent = `Page ${pageNum}`;
        wrapper.appendChild(canvas);
        wrapper.appendChild(label);
        previewGrid.appendChild(wrapper);
        renderedPages.push(canvas);
    }

    function clearAll() {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        renderedPages.forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
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
        if (!selectedFile) { await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a file first.', ['OK']); return; }

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
            loadingUI.show('Adding page numbers...');
            addBtn.disabled = true;
            addBtn.textContent = 'Adding Page Numbers...';
            const endpoint = await API.pdf.addPageNumbers;
            const result = await API.request.post(endpoint, requestBody);
            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedFile.name.replace('.pdf', '_numbered.pdf');
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) await customAlert.alert('LocalPDF Studio - SUCCESS', 'Page numbers added successfully!\nSaved to: ' + savedPath, ['OK']);
                else await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
            } else {
                console.error("API returned JSON:", result);
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }            
        } catch (error) {            
            console.error('Error:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred:\n${error.message}`, ['OK']);
        } finally {
            loadingUI.hide();
            addBtn.disabled = false;
            addBtn.textContent = 'Add Page Numbers';
        }
    });
});
