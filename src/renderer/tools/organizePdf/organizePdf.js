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


// src/renderer/tools/organizePdf/organizePdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    await API.init();
    ThemeManager.init();

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
    let droppedFilePath = null;
    let pdfDoc = null;
    let pages = [];
    let draggedElement = null;
    let nextId = 1;

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('organizePdfJS.selectingPdfs'));
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
        await loadPdfPages(file.path);
        organizeInfo.style.display = 'block';
        organizeContainer.style.display = 'flex';
        actionButtons.style.display = 'flex';
    }

    async function loadPdfPages(filePath) {
        try {
            loadingUI.show(i18n.t('organizePdfJS.loadingPreview'));
            let pdfPath = filePath;
            if (navigator.platform.indexOf('Win') > -1) {
                pdfPath = filePath.startsWith('file:///') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
            } else {
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
            loadingUI.hide();
        } catch (error) {
            loadingUI.hide();
            console.error('Error loading PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('organizePdfJS.failedToLoadPdf') + error.message, [i18n.t('common.ok')]);
        }
    }

    async function renderPageToCanvas(pageNum) {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const scale = 0.5;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;
            return canvas;
        } catch (error) {
            console.error(`Error rendering page ${pageNum}:`, error);
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

        const preview = document.createElement('div');
        preview.className = 'page-preview';

        const badge = document.createElement('div');
        badge.className = 'page-number-badge';
        badge.textContent = `#${index + 1}`;

        const canvasClone = document.createElement('canvas');
        canvasClone.width = page.canvas.width;
        canvasClone.height = page.canvas.height;
        const ctx = canvasClone.getContext('2d');
        ctx.drawImage(page.canvas, 0, 0);

        preview.appendChild(badge);
        preview.appendChild(canvasClone);

        const controls = document.createElement('div');
        controls.className = 'page-controls';

        const rotateBtn = document.createElement('button');
        rotateBtn.className = 'control-btn';
        rotateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw-icon lucide-rotate-cw"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> 90°';
        rotateBtn.onclick = (e) => {
            e.stopPropagation();
            rotatePage(page.id);
        };

        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'control-btn duplicate-btn';
        duplicateBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg> Copy';
        duplicateBtn.onclick = (e) => {
            e.stopPropagation();
            duplicatePage(page.id);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'control-btn delete-btn';
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deletePage(page.id);
        };

        controls.appendChild(rotateBtn);
        controls.appendChild(duplicateBtn);
        controls.appendChild(deleteBtn);

        item.appendChild(preview);
        item.appendChild(controls);

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
        // Set a specific data type for internal page dragging
        e.dataTransfer.setData('application/x-page-item', e.currentTarget.dataset.pageId);
    }

    function handleDragEnd(e) {
        const element = e.currentTarget;
        element.classList.remove('dragging');
        document.querySelectorAll('.page-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    }

    function handleDragOver(e) {
        // Check if this is an internal page drag (not a file drop)
        const isPageDrag = e.dataTransfer.types.includes('application/x-page-item');

        if (isPageDrag && draggedElement) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';

            const target = e.currentTarget;
            if (target !== draggedElement) {
                target.classList.add('drag-over');
            }
        }
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e) {
        // Check if this is an internal page drag (not a file drop)
        const isPageDrag = e.dataTransfer.types.includes('application/x-page-item');

        if (isPageDrag && draggedElement) {
            e.preventDefault();
            e.stopPropagation();

            const target = e.currentTarget;
            target.classList.remove('drag-over');

            if (target !== draggedElement && draggedElement.classList.contains('page-item')) {
                const draggedId = parseInt(draggedElement.dataset.pageId);
                const targetId = parseInt(target.dataset.pageId);

                const draggedIndex = pages.findIndex(p => p.id === draggedId);
                const targetIndex = pages.findIndex(p => p.id === targetId);

                if (draggedIndex !== -1 && targetIndex !== -1) {
                    const [removed] = pages.splice(draggedIndex, 1);
                    pages.splice(targetIndex, 0, removed);

                    renderPagesGrid();
                    updatePageCountInfo();
                }
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
            customAlert.alert(i18n.t('alerts.notice'), i18n.t('organizePdfJS.cannotDeleteLastPage'), [i18n.t('common.ok')]);
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
            loadingUI.show(i18n.t('organizePdfJS.resettingOrder'));
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
            loadingUI.hide();
        }
    });

    organizeBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('organizePdfJS.selectFileFirst'), [i18n.t('common.ok')]);
            return;
        }

        if (pages.length === 0) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('organizePdfJS.noPagesToOrganize'), [i18n.t('common.ok')]);
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
            loadingUI.show(i18n.t('organizePdfJS.organizingPdf'));
            organizeBtn.disabled = true;
            organizeBtn.textContent = i18n.t('organizePdfJS.organizingPdf');
            const organizeEndpoint = await API.pdf.organize;
            const result = await API.request.post(organizeEndpoint, requestBody);
            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = `${selectedFile.name.replace('.pdf', '')}_organized.pdf`;
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('organizePdfJS.successMsg') + '\n' + i18n.t('organizePdfJS.successSavedTo') + savedPath, [i18n.t('common.ok')]);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('organizePdfJS.cancelledMsg'), [i18n.t('common.ok')]);
                }
            } else {
                console.error("Organize API returned JSON:", result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('organizePdfJS.errorMsg') + JSON.stringify(result), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error organizing PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('organizePdfJS.errorOrganizing') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            organizeBtn.disabled = false;
            organizeBtn.textContent = i18n.t('organizePDF.save-organized-pdf');
        }
    });

    function clearAll(preserveDroppedFilePath = false) {
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
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
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
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('organizePdfJS.dropOnlyOne'), [i18n.t('common.ok')]);
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
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('organizePdfJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('organizePdfJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });
});
