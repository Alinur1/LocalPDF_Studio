// src/renderer/tools/organizePdf/organizePdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const organizeBtn = document.getElementById('organize-btn');
    const resetOrderBtn = document.getElementById('reset-order-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const organizeContainer = document.getElementById('organize-container');
    const organizeInfo = document.getElementById('organize-info');
    const pagesGrid = document.getElementById('pages-grid');
    const pageCountInfo = document.getElementById('page-count-info');
    const actionButtons = document.getElementById('action-buttons');

    let selectedFile = null;
    let pdfDoc = null;
    let pages = []; // Array of { id, originalPageNum, rotation, canvas }
    let draggedElement = null;
    let nextId = 1;

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
        await loadPdfPages(file.path);
        organizeInfo.style.display = 'block';
        organizeContainer.style.display = 'flex';
        actionButtons.style.display = 'flex';
    }

    async function loadPdfPages(filePath) {
        try {
            showLoading('Loading PDF...');

            // Normalize file path for different platforms
            let pdfPath = filePath;
            if (navigator.platform.indexOf('Win') > -1) {
                // Windows: file:///C:/path/to/file.pdf
                pdfPath = filePath.startsWith('file:///') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
            } else {
                // Unix-like: file:///path/to/file.pdf
                pdfPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
            }

            console.log('Loading PDF from:', pdfPath);
            const loadingTask = pdfjsLib.getDocument(pdfPath);
            pdfDoc = await loadingTask.promise;
            console.log('PDF loaded successfully. Pages:', pdfDoc.numPages);

            pages = [];
            nextId = 1;

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const canvas = await renderPageToCanvas(pageNum);
                pages.push({
                    id: nextId++,
                    originalPageNum: pageNum,
                    rotation: 0,
                    canvas: canvas
                });
            }

            console.log('All pages rendered:', pages.length);
            updatePageCountInfo();
            renderPagesGrid();
            hideLoading();
        } catch (error) {
            hideLoading();
            console.error('Error loading PDF:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `Failed to load PDF: ${error.message}`, ['OK']);
        }
    }

    async function renderPageToCanvas(pageNum) {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const scale = 0.5;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // Set canvas dimensions
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render the page
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            return canvas;
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
            // Return a placeholder canvas on error
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 280;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#34495e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ecf0f1';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Error loading page', canvas.width / 2, canvas.height / 2);
            return canvas;
        }
    }

    function renderPagesGrid() {
        pagesGrid.innerHTML = '';

        pages.forEach((page, index) => {
            const pageItem = createPageItem(page, index);
            pagesGrid.appendChild(pageItem);
        });
    }

    function createPageItem(page, index) {
        const item = document.createElement('div');
        item.className = 'page-item';
        item.draggable = true;
        item.dataset.pageId = page.id;
        item.dataset.rotation = page.rotation;

        // Page preview
        const preview = document.createElement('div');
        preview.className = 'page-preview';

        const badge = document.createElement('div');
        badge.className = 'page-number-badge';
        badge.textContent = `#${index + 1}`;

        // Clone canvas properly
        const canvasClone = document.createElement('canvas');
        canvasClone.width = page.canvas.width;
        canvasClone.height = page.canvas.height;
        const ctx = canvasClone.getContext('2d');
        ctx.drawImage(page.canvas, 0, 0);

        preview.appendChild(badge);
        preview.appendChild(canvasClone);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'page-controls';

        const rotateBtn = document.createElement('button');
        rotateBtn.className = 'control-btn';
        rotateBtn.innerHTML = '↻ 90°';
        rotateBtn.onclick = (e) => {
            e.stopPropagation();
            rotatePage(page.id);
        };

        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'control-btn duplicate-btn';
        duplicateBtn.innerHTML = '+ Copy';
        duplicateBtn.onclick = (e) => {
            e.stopPropagation();
            duplicatePage(page.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'control-btn delete-btn';
        deleteBtn.innerHTML = '✕';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deletePage(page.id);
        };

        controls.appendChild(rotateBtn);
        controls.appendChild(duplicateBtn);
        controls.appendChild(deleteBtn);

        item.appendChild(preview);
        item.appendChild(controls);

        // Drag events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragleave', handleDragLeave);

        return item;
    }

    function handleDragStart(e) {
        draggedElement = e.currentTarget;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        document.querySelectorAll('.page-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const target = e.currentTarget;
        if (target !== draggedElement) {
            target.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget;
        target.classList.remove('drag-over');

        if (draggedElement && target !== draggedElement) {
            const draggedId = parseInt(draggedElement.dataset.pageId);
            const targetId = parseInt(target.dataset.pageId);

            const draggedIndex = pages.findIndex(p => p.id === draggedId);
            const targetIndex = pages.findIndex(p => p.id === targetId);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                // Reorder array
                const [removed] = pages.splice(draggedIndex, 1);
                pages.splice(targetIndex, 0, removed);

                renderPagesGrid();
                updatePageCountInfo();
            }
        }
    }

    function rotatePage(pageId) {
        const page = pages.find(p => p.id === pageId);
        if (page) {
            page.rotation = (page.rotation + 90) % 360;
            renderPagesGrid();
        }
    }

    function duplicatePage(pageId) {
        const pageIndex = pages.findIndex(p => p.id === pageId);
        if (pageIndex !== -1) {
            const originalPage = pages[pageIndex];
            const duplicate = {
                id: nextId++,
                originalPageNum: originalPage.originalPageNum,
                rotation: originalPage.rotation,
                canvas: originalPage.canvas
            };
            pages.splice(pageIndex + 1, 0, duplicate);
            renderPagesGrid();
            updatePageCountInfo();
        }
    }

    function deletePage(pageId) {
        if (pages.length <= 1) {
            customAlert.alert('LocalPDF Studio - NOTICE', 'Cannot delete the last page. PDF must have at least one page.', ['OK']);
            return;
        }

        pages = pages.filter(p => p.id !== pageId);
        renderPagesGrid();
        updatePageCountInfo();
    }

    function updatePageCountInfo() {
        const originalCount = pdfDoc ? pdfDoc.numPages : 0;
        const currentCount = pages.length;
        pageCountInfo.textContent = `Original: ${originalCount} pages | Current: ${currentCount} pages`;
    }

    resetOrderBtn.addEventListener('click', async () => {
        if (selectedFile && pdfDoc) {
            showLoading('Resetting to original order...');
            pages = [];
            nextId = 1;

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const canvas = await renderPageToCanvas(pageNum);
                pages.push({
                    id: nextId++,
                    originalPageNum: pageNum,
                    rotation: 0,
                    canvas: canvas
                });
            }

            renderPagesGrid();
            updatePageCountInfo();
            hideLoading();
        }
    });

    organizeBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a file first.', ['OK']);
            return;
        }

        if (pages.length === 0) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'No pages to organize.', ['OK']);
            return;
        }

        const pageOrder = pages.map(page => ({
            pageNumber: page.originalPageNum,
            rotation: page.rotation
        }));

        const requestBody = {
            filePath: selectedFile.path,
            options: {
                pageOrder: pageOrder
            }
        };

        try {
            organizeBtn.disabled = true;
            organizeBtn.textContent = 'Organizing...';
            showLoading('Organizing PDF...');

            const organizeEndpoint = await API.pdf.organize;
            const result = await API.request.post(organizeEndpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = `${selectedFile.name.replace('.pdf', '')}_organized.pdf`;
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

                hideLoading();
                if (savedPath) {
                    await customAlert.alert('LocalPDF Studio - SUCCESS', `Success! PDF organized successfully!\nSaved to: ${savedPath}`, ['OK']);
                } else {
                    await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
                }
            } else {
                hideLoading();
                console.error("Organize API returned JSON:", result);
                await customAlert.alert('LocalPDF Studio - ERROR', `Error: ${JSON.stringify(result)}`, ['OK']);
            }
        } catch (error) {
            hideLoading();
            console.error('Error organizing PDF:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred while organizing the PDF:\n${error.message}`, ['OK']);
        } finally {
            organizeBtn.disabled = false;
            organizeBtn.textContent = 'Save Organized PDF';
        }
    });

    function clearAll() {
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
        pages = [];
        nextId = 1;
        pagesGrid.innerHTML = '';
        organizeContainer.style.display = 'none';
        organizeInfo.style.display = 'none';
        actionButtons.style.display = 'none';
        selectedFile = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
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

    // Loading overlay functions
    function showLoading(message = 'Loading...') {
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-content">
                    <h3 id="loading-message">${message}</h3>
                    <div class="loading-spinner"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        } else {
            document.getElementById('loading-message').textContent = message;
            overlay.style.display = 'flex';
        }
    }

    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
});