// src/renderer/tools/addWatermark/addWatermark.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';

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
    const watermarkType = document.getElementById('watermark-type');
    const textOptions = document.getElementById('text-options');
    const imageOptions = document.getElementById('image-options');
    const watermarkText = document.getElementById('watermark-text');
    const fontSize = document.getElementById('font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    const textColor = document.getElementById('text-color');
    const colorPreview = document.getElementById('color-preview');
    const opacity = document.getElementById('opacity');
    const opacityValue = document.getElementById('opacity-value');
    const imageFile = document.getElementById('image-file');
    const imageScale = document.getElementById('image-scale');
    const imageScaleValue = document.getElementById('image-scale-value');
    const position = document.getElementById('position');
    const rotation = document.getElementById('rotation');
    const rotationValue = document.getElementById('rotation-value');
    const pagesRange = document.getElementById('pages-range');
    const customPagesGroup = document.getElementById('custom-pages-group');
    const customPages = document.getElementById('custom-pages');
    const watermarkPreviewText = document.getElementById('watermark-preview-text');

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
    document.querySelector('a[href="../../index.html"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        clearAll();
        window.location.href = '../../index.html';
    });

    watermarkType.addEventListener('change', () => {
        const type = watermarkType.value;
        textOptions.style.display = type === 'text' ? 'block' : 'none';
        imageOptions.style.display = type === 'image' ? 'block' : 'none';
        updateWatermarkPreview();
    });

    fontSize.addEventListener('input', () => {
        fontSizeValue.textContent = fontSize.value;
        updateWatermarkPreview();
    });

    opacity.addEventListener('input', () => {
        opacityValue.textContent = `${opacity.value}%`;
        updateWatermarkPreview();
    });

    imageScale.addEventListener('input', () => {
        imageScaleValue.textContent = `${imageScale.value}%`;
    });

    rotation.addEventListener('input', () => {
        rotationValue.textContent = `${rotation.value}°`;
        updateWatermarkPreview();
    });

    textColor.addEventListener('input', () => {
        colorPreview.style.backgroundColor = textColor.value;
        updateWatermarkPreview();
    });

    watermarkText.addEventListener('input', updateWatermarkPreview);
    pagesRange.addEventListener('change', () => {
        customPagesGroup.style.display = pagesRange.value === 'custom' ? 'block' : 'none';
    });

    imageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp'];
            if (!validTypes.includes(file.type)) {
                customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a valid image file (PNG, JPG, JPEG, GIF, BMP)', ['OK']);
                e.target.value = '';
                return;
            }
        }
    });

    function updateWatermarkPreview() {
        if (watermarkType.value === 'text') {
            watermarkPreviewText.textContent = watermarkText.value || 'CONFIDENTIAL';
            watermarkPreviewText.style.fontSize = `${fontSize.value}px`;
            watermarkPreviewText.style.color = textColor.value;
            watermarkPreviewText.style.opacity = (opacity.value / 100).toString();
            watermarkPreviewText.style.transform = `rotate(${rotation.value}deg)`;
        } else {
            watermarkPreviewText.textContent = '[Image Watermark]';
            watermarkPreviewText.style.fontSize = '1.5rem';
            watermarkPreviewText.style.color = '#3498db';
            watermarkPreviewText.style.opacity = '0.6';
            watermarkPreviewText.style.transform = `rotate(${rotation.value}deg)`;
        }
    }

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
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '<p style="color: #bdc3c7; text-align: center;">Loading preview...</p>';
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
        imageFile.value = '';
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
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a PDF file first.', ['OK']);
            return;
        }
        if (watermarkType.value === 'image' && !imageFile.files[0]) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select an image file for the watermark.', ['OK']);
            return;
        }

        const positionMap = {
            'Center': 0, 'TopLeft': 1,
            'TopRight': 2, 'BottomLeft': 3, 'BottomRight': 4, 'Tiled': 5
        };

        const requestBody = {
            filePath: selectedFile.path,
            watermarkType: watermarkType.value,
            text: watermarkText.value,
            position: document.getElementById('position').value,
            rotation: parseInt(rotation.value),
            opacity: parseInt(opacity.value),
            fontSize: parseInt(fontSize.value),
            textColor: textColor.value,
            pagesRange: pagesRange.value,
            customPages: customPages.value || '',
            startPage: 1,
            endPage: 0
        };

        if (watermarkType.value === 'text') {
            requestBody.text = watermarkText.value;
            requestBody.fontSize = parseInt(fontSize.value);
            requestBody.textColor = textColor.value;
        } else {
            // For image watermark, we'll need to handle file upload
            // This would require additional backend implementation
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Image watermark feature requires additional backend implementation.\nFeature not available.', ['OK']);
            return;
        }

        try {
            addBtn.disabled = true;
            addBtn.textContent = 'Adding Watermark...';
            const endpoint = await API.pdf.addWatermark;
            const result = await API.request.post(endpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedFile.name.replace('.pdf', '_watermarked.pdf');
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) {
                    await customAlert.alert('LocalPDF Studio - SUCCESS', 'Watermark added successfully!\nSaved to: ' + savedPath, ['OK']);
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
                }
            } else {
                console.error("API returned JSON:", result);
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            console.error('Error:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred:\n${error.message}`, ['OK']);
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Add Watermark';
        }
    });
    updateWatermarkPreview();
});
