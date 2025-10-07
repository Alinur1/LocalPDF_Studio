// src/renderer/tools/pdfToOffice/pdfToOffice.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
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

    const formatRadios = document.querySelectorAll('input[name="outputFormat"]');

    let selectedFile = null;
    let pdfDoc = null;
    let renderedPages = [];

    // --- File Selection ---
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
        updateConvertButtonState();
    }

    async function loadPdfPreview(filePath) {
        try {
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '<p style="color: #bdc3c7; text-align: center;">Loading preview...</p>';
            const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            
            // Show only first 6 pages for preview
            const pagesToShow = Math.min(pdfDoc.numPages, 6);
            for (let pageNum = 1; pageNum <= pagesToShow; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
            
            if (pdfDoc.numPages > 6) {
                const morePages = document.createElement('div');
                morePages.className = 'page-thumbnail';
                morePages.style.display = 'flex';
                morePages.style.alignItems = 'center';
                morePages.style.justifyContent = 'center';
                morePages.innerHTML = `<p style="color: #7f8c8d; text-align: center; font-size: 0.8rem;">+${pdfDoc.numPages - 6} more pages</p>`;
                previewGrid.appendChild(morePages);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = '<p style="color: #e74c3c; text-align: center;">Failed to load PDF preview</p>';
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

    function updateConvertButtonState() {
        convertBtn.disabled = !selectedFile;
        
        if (selectedFile) {
            const selectedFormat = document.querySelector('input[name="outputFormat"]:checked').value;
            convertBtn.textContent = `Convert to ${getFormatName(selectedFormat)}`;
        } else {
            convertBtn.textContent = 'Convert to Office';
        }
    }

    function getFormatName(format) {
        const names = {
            'docx': 'Word',
            'xlsx': 'Excel',
            'pptx': 'PowerPoint'
        };
        return names[format] || 'Office';
    }

    // Update button text when format changes
    formatRadios.forEach(radio => {
        radio.addEventListener('change', updateConvertButtonState);
    });

    // --- API Call for Conversion ---
    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            alert('Please select a file first.');
            return;
        }

        const selectedFormat = document.querySelector('input[name="outputFormat"]:checked').value;
        const formatName = getFormatName(selectedFormat);

        const requestBody = {
            filePath: selectedFile.path,
            outputFormat: selectedFormat
        };

        try {
            convertBtn.disabled = true;
            convertBtn.textContent = `Converting to ${formatName}...`;

            const convertEndpoint = await API.pdf.toOffice;
            const result = await API.request.post(convertEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();

                const baseName = selectedFile.name.replace('.pdf', '');
                const defaultName = `${baseName}.${selectedFormat}`;

                const savedPath = await window.electronAPI.saveFile(defaultName, arrayBuffer);

                if (savedPath) {
                    alert(`PDF converted successfully to ${formatName}!\nSaved to: ${savedPath}`);
                } else {
                    alert('Operation cancelled or failed to save the file.');
                }
            } else {
                console.error("Convert API returned JSON:", result);
                alert(`Error: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            console.error('Error converting PDF:', error);
            
            let errorMessage = error.message;
            if (errorMessage.includes('LibreOffice')) {
                errorMessage = 'LibreOffice conversion engine is not available.\n\nPlease ensure LibreOffice is properly installed with the application.';
            }
            
            alert(`An error occurred while converting the PDF:\n${errorMessage}`);
        } finally {
            convertBtn.disabled = false;
            updateConvertButtonState();
        }
    });
});