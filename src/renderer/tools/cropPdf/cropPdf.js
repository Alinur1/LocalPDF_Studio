// src/renderer/tools/cropPdf/cropPdf.js
import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const cropBtn = document.getElementById('crop-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');

    const topInput = document.getElementById('top');
    const bottomInput = document.getElementById('bottom');
    const leftInput = document.getElementById('left');
    const rightInput = document.getElementById('right');
    const presetButtons = document.querySelectorAll('.preset-btn');

    let selectedFile = null;
    let pdfDoc = null;
    let renderedPages = [];

    let isDragging = false;
    let dragType = null; // 'top', 'bottom', 'left', 'right'
    let startY = 0, startX = 0;
    let startValue = 0;

    initializeDragHandles();
    updateVisualPreview();

    // Update visual preview
    function updateVisualPreview() {
        const scale = 0.5;
        const top = parseFloat(topInput.value) * scale;
        const bottom = parseFloat(bottomInput.value) * scale;
        const left = parseFloat(leftInput.value) * scale;
        const right = parseFloat(rightInput.value) * scale;

        // Update the crop overlays
        document.getElementById('crop-top').style.height = Math.max(4, top) + 'px'; // Minimum 4px for dragging
        document.getElementById('crop-bottom').style.height = Math.max(4, bottom) + 'px';
        document.getElementById('crop-left').style.width = Math.max(4, left) + 'px';
        document.getElementById('crop-right').style.width = Math.max(4, right) + 'px';

        // Make draggable areas more visible when they're small
        ['crop-top', 'crop-bottom', 'crop-left', 'crop-right'].forEach(id => {
            const element = document.getElementById(id);
            const size = id.includes('top') || id.includes('bottom') ?
                parseInt(element.style.height) : parseInt(element.style.width);

            if (size <= 8) {
                element.style.backgroundColor = 'rgba(231, 76, 60, 0.8)';
            } else {
                element.style.backgroundColor = 'rgba(231, 76, 60, 0.3)';
            }
        });
    }

    [topInput, bottomInput, leftInput, rightInput].forEach(input => {
        input.addEventListener('input', updateVisualPreview);
    });

    // Preset buttons
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const preset = btn.dataset.preset;
            switch (preset) {
                case 'remove-margins':
                    topInput.value = 36;
                    bottomInput.value = 36;
                    leftInput.value = 36;
                    rightInput.value = 36;
                    break;
                case 'a4-to-letter':
                    topInput.value = 0;
                    bottomInput.value = 48;
                    leftInput.value = 0;
                    rightInput.value = 0;
                    break;
                case 'letter-to-a4':
                    topInput.value = 48;
                    bottomInput.value = 0;
                    leftInput.value = 0;
                    rightInput.value = 0;
                    break;
                case 'custom':
                    // Do nothing, let user input
                    break;
            }
            updateVisualPreview();
        });
    });

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

    function initializeDragHandles() {
        const cropOverlays = {
            'crop-top': 'top',
            'crop-bottom': 'bottom',
            'crop-left': 'left',
            'crop-right': 'right'
        };

        Object.entries(cropOverlays).forEach(([elementId, cropType]) => {
            const element = document.getElementById(elementId);

            element.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                dragType = cropType;

                if (cropType === 'top' || cropType === 'bottom') {
                    startY = e.clientY;
                } else {
                    startX = e.clientX;
                }

                // Store current value
                startValue = parseFloat(document.getElementById(cropType).value);

                document.body.style.cursor = getDragCursor(cropType);
                document.addEventListener('mousemove', handleDrag);
                document.addEventListener('mouseup', stopDrag);
            });

            // Change cursor on hover
            element.addEventListener('mouseenter', () => {
                element.style.backgroundColor = 'rgba(231, 76, 60, 0.5)';
                document.body.style.cursor = getDragCursor(cropType);
            });

            element.addEventListener('mouseleave', () => {
                if (!isDragging) {
                    element.style.backgroundColor = 'rgba(231, 76, 60, 0.3)';
                    document.body.style.cursor = 'default';
                }
            });
        });
    }

    function getDragCursor(type) {
        const cursors = {
            'top': 'n-resize',
            'bottom': 's-resize',
            'left': 'w-resize',
            'right': 'e-resize'
        };
        return cursors[type] || 'default';
    }

    function handleDrag(e) {
        if (!isDragging) return;

        const scale = 0.5; // Same as visual scale
        const sensitivity = 2; // Adjust this for faster/slower dragging

        if (dragType === 'top' || dragType === 'bottom') {
            const deltaY = (e.clientY - startY) * sensitivity;
            const newValue = Math.max(0, startValue + (dragType === 'top' ? deltaY : -deltaY));
            document.getElementById(dragType).value = Math.round(newValue);
        } else {
            const deltaX = (e.clientX - startX) * sensitivity;
            const newValue = Math.max(0, startValue + (dragType === 'left' ? deltaX : -deltaX));
            document.getElementById(dragType).value = Math.round(newValue);
        }

        updateVisualPreview();
    }

    function stopDrag() {
        isDragging = false;
        dragType = null;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);

        // Reset hover styles
        ['crop-top', 'crop-bottom', 'crop-left', 'crop-right'].forEach(id => {
            document.getElementById(id).style.backgroundColor = 'rgba(231, 76, 60, 0.3)';
        });
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
        cropBtn.disabled = true;
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

    function fixInputFocus() {
        // Force blur and then focus on the first input
        setTimeout(() => {
            const inputs = document.querySelectorAll('input, button, select, textarea');
            inputs.forEach(input => {
                input.blur();
            });
            // Focus on the first input to restore normal behavior
            if (inputs.length > 0) {
                setTimeout(() => {
                    inputs[0].focus();
                    inputs[0].blur();
                }, 100);
            }
        }, 100);
    }

    cropBtn.addEventListener('click', async () => {
        if (!selectedFile) { alert('Please select a file first.'); return; }

        const requestBody = {
            filePath: selectedFile.path,
            top: parseFloat(topInput.value),
            bottom: parseFloat(bottomInput.value),
            left: parseFloat(leftInput.value),
            right: parseFloat(rightInput.value),
            applyToAllPages: document.getElementById('applyToAll').checked
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
                    alert('PDF cropped successfully!\nSaved to: ' + savedPath);
                } else {
                    alert('Operation cancelled or failed to save the file.');
                }
            } else {
                console.error("API returned JSON:", result);
                alert(`Error: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            console.error('Error:', error);
            alert(`An error occurred:\n${error.message}`);
        } finally {
            cropBtn.disabled = false;
            cropBtn.textContent = 'Crop PDF';
            fixInputFocus(); // Add this line to fix focus after error
        }
    });
});
