// src/renderer/tools/cropPdf/cropPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const cropBtn = document.getElementById('crop-btn');
    const resetBtn = document.getElementById('reset-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const pagesRangeRadios = document.querySelectorAll('input[name="pages-range"]');
    const customPagesGroup = document.getElementById('custom-pages-group');
    const customPages = document.getElementById('custom-pages');
    const margins = {
        top: document.getElementById('margin-top'),
        right: document.getElementById('margin-right'),
        bottom: document.getElementById('margin-bottom'),
        left: document.getElementById('margin-left'),
    };

    let selectedFile = null;
    let pdfDoc = null;
    let renderedPages = [];

    // File selection
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

    pagesRangeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            customPagesGroup.style.display = document.querySelector('input[name="pages-range"]:checked').value === 'custom' ? 'block' : 'none';
        });
    });

    resetBtn.addEventListener('click', () => {
        Object.values(margins).forEach(m => (m.value = 0));
    });

    // Add input event listeners to margin inputs to clear validation state
    Object.values(margins).forEach(input => {
        input.addEventListener('input', () => {
            // Remove error styling when user starts typing
            if (input.classList.contains('error')) {
                input.classList.remove('error');
            }
        });
    });

    async function handleFileSelected(file) {
        clearAll();
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        await loadPdfPreview(file.path);
        cropBtn.disabled = false;
    }

    async function loadPdfPreview(filePath) {
        try {
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '<p style="color:#bdc3c7;text-align:center;">Loading preview...</p>';
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
            previewGrid.innerHTML = '<p style="color:#e74c3c;text-align:center;">Failed to load PDF preview</p>';
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
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
        renderedPages.forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        cropBtn.disabled = true;

        // Clear any error styling
        Object.values(margins).forEach(input => {
            input.classList.remove('error');
        });
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

    function validateMargins() {
        let isValid = true;
        const emptyFields = [];

        // Check each margin input
        Object.entries(margins).forEach(([position, input]) => {
            if (input.value === '' || isNaN(parseInt(input.value))) {
                isValid = false;
                emptyFields.push(position);
                input.classList.add('error');
            } else {
                input.classList.remove('error');
            }
        });

        return { isValid, emptyFields };
    }

    cropBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a PDF file first.', ['OK']);
            return;
        }

        // Validate margin inputs
        const validation = validateMargins();
        if (!validation.isValid) {
            const fieldNames = validation.emptyFields.map(field =>
                field.charAt(0).toUpperCase() + field.slice(1)
            ).join(', ');

            await customAlert.alert('LocalPDF Studio - NOTICE', `Please enter valid margin values for: ${fieldNames}\n\nAll margin values must be numbers (0 or greater).`, ['OK']);
            return;
        }

        const selectedRange = document.querySelector('input[name="pages-range"]:checked').value;

        // Additional validation for custom pages
        if (selectedRange === 'custom' && (!customPages.value || customPages.value.trim() === '')) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please enter a custom page range or select "All Pages".', ['OK']);
            customPages.focus();
            return;
        }

        const requestBody = {
            filePath: selectedFile.path,
            pagesRange: selectedRange,
            customPages: customPages.value || '',
            margins: {
                top: parseInt(margins.top.value),
                right: parseInt(margins.right.value),
                bottom: parseInt(margins.bottom.value),
                left: parseInt(margins.left.value),
            },
        };

        try {
            cropBtn.disabled = true;
            cropBtn.textContent = 'Cropping...';

            const endpoint = await API.pdf.crop;
            const result = await API.request.post(endpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedFile.name.replace('.pdf', '_cropped.pdf');
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) {
                    await customAlert.alert('LocalPDF Studio - SUCCESS', 'PDF cropped successfully!\nSaved to: ' + savedPath, ['OK']);
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save.', ['OK']);
                }
            } else {
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            console.error('Crop Error:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred:\n${error.message}`, ['OK']);
        } finally {
            cropBtn.disabled = false;
            cropBtn.textContent = 'Crop PDF';
        }
    });
});
