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


// src/renderer/tools/redactPdf/redactPdf.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';
import { ThemeManager } from '../../utils/themeManager.js';
import { pathToFileURL } from '../../utils/fileUrl.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectBtn = document.getElementById('select-pdf-btn');
    const applyBtn = document.getElementById('apply-redactions-btn');
    const clearBtn = document.getElementById('clear-redactions-btn');
    const pageInput = document.getElementById('page-input');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const thumbnailList = document.getElementById('thumbnail-list');

    let pdfDocument = null;
    let currentPage = 1;
    let totalPages = 0;
    let currentFilePath = null;
    let zoomLevel = 1.0;
    let redactionColor = '#000000';
    let redactions = {}; // { pageNum: [{x, y, width, height, color}] }
    let droppedFilePath = null;

    // Continuous rendering system with caching
    let pageContainers = {}; // { pageNum: domElement }
    let renderingPages = new Set(); // Pages currently being rendered
    let visiblePages = new Set(); // Pages currently visible
    let renderedPages = new Set(); // Pages that have been rendered (cached)
    let renderQueue = []; // Queue of pages waiting to render
    let isProcessingQueue = false;
    let scrollAnimationId = null;
    const PAGE_PADDING = 20;

    // Color button initialization
    const colorButtons = document.querySelectorAll('.color-btn');
    colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            redactionColor = btn.dataset.color;
        });
    });

    // Select PDF
    selectBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('redactPdfJS.selectingPdf'));
        const selected = await window.electronAPI.selectPdfs();
        if (droppedFilePath) {
            await window.electronAPI.deleteFile(droppedFilePath);
        }
        if (selected?.length) {
            await loadPdf(selected[0]);
        }
        loadingUI.hide();
    });

    // Clear all redactions
    clearBtn.addEventListener('click', async () => {
        const result = await customAlert.alert(i18n.t('alerts.notice'), i18n.t('redactPdfJS.clearAllConfirm'), [i18n.t('redactPdfJS.cancel'), i18n.t('redactPdfJS.clearAll')]);
        if (result === 1) {
            redactions = {};
            // Clear rendered pages cache so they re-render without redactions
            renderedPages.clear();
            // Redraw all visible pages
            for (let pageNum of visiblePages) {
                redrawPageRedactions(pageNum);
            }
            updateUI();
        }
    });

    // Apply redactions
    applyBtn.addEventListener('click', async () => {
        if (!currentFilePath || Object.keys(redactions).length === 0) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('redactPdfJS.addRedactionFirst'), [i18n.t('common.ok')]);
            return;
        }

        try {
            loadingUI.show(i18n.t('redactPdfJS.applyingRedactions'));

            // Prepare redaction data for API
            const redactionData = {
                file: currentFilePath,
                redactions: Object.entries(redactions).flatMap(([page, rects]) =>
                    rects.map(rect => ({
                        page: parseInt(page),
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                        color: rect.color
                    }))
                )
            };

            const redactEndpoint = await API.pdf.redact;
            const blob = await API.request.post(redactEndpoint, redactionData);
            const arrayBuffer = await blob.arrayBuffer();
            const fileName = currentFilePath.split(/[\\/]/).pop();
            const defaultName = `${fileName.replace('.pdf', '')}_redacted.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

            if (savedPath) {
                await customAlert.alert(i18n.t('alerts.success'), i18n.t('redactPdfJS.pdfRedactedSuccess'), [i18n.t('common.ok')]);
                // redactions = {};
                // Object.values(pageContainers).forEach((_, pageNum) => {
                //     redrawPageRedactions(pageNum);
                // });
                // updateUI();
            } else {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('redactPdfJS.saveCanceled'), [i18n.t('common.ok')]);
            }
        } catch (err) {
            console.error(err);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('redactPdfJS.errorApplyingRedactions') + err.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
        }
    });

    pageInput.addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= totalPages) {
            const pageEl = pageContainers[page];
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            e.target.value = currentPage;
        }
    });

    // Zoom controls - preserve scroll position
    zoomInBtn.addEventListener('click', () => {
        zoomLevel = Math.min(zoomLevel + 0.25, 3.0);
        performZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        zoomLevel = Math.max(zoomLevel - 0.25, 0.5);
        performZoom();
    });

    zoomFitBtn.addEventListener('click', () => {
        zoomLevel = 1.0;
        performZoom();
    });

    // Perform zoom with instant scroll restoration
    function performZoom() {
        const scrollTop = canvasWrapper.scrollTop;

        // Clear cached pages and queues for re-rendering
        renderingPages.clear();
        renderedPages.clear();
        renderQueue = [];
        isProcessingQueue = false;

        // Clear canvas content (NOT dimensions - keep layout intact)
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageEl = pageContainers[pageNum];
            if (pageEl && pageEl.pdfCanvas.width > 0) {
                const ctx = pageEl.pdfCanvas.getContext('2d');
                ctx.clearRect(0, 0, pageEl.pdfCanvas.width, pageEl.pdfCanvas.height);

                const redactionCtx = pageEl.redactionCanvas.getContext('2d');
                redactionCtx.clearRect(0, 0, pageEl.redactionCanvas.width, pageEl.redactionCanvas.height);
            }
        }

        // Restore scroll position (layout is intact, so this works correctly)
        canvasWrapper.scrollTop = scrollTop;

        // Queue pages for re-rendering
        updateVisiblePages();
        updateUI();
    }

    // Keyboard and mouse wheel zoom (Ctrl/Cmd + Wheel)
    canvasWrapper.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();

            if (e.deltaY < 0) {
                // Zoom in
                zoomLevel = Math.min(zoomLevel + 0.1, 3.0);
            } else {
                // Zoom out
                zoomLevel = Math.max(zoomLevel - 0.1, 0.5);
            }

            performZoom();
        }
    }, { passive: false });

    // Keyboard zoom shortcuts (Ctrl/Cmd + Plus/Minus)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === 'ArrowUp')) {
            if (pdfDocument) {
                e.preventDefault();
                zoomLevel = Math.min(zoomLevel + 0.1, 3.0);
                performZoom();
            }
        } else if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_' || e.key === 'ArrowDown')) {
            if (pdfDocument) {
                e.preventDefault();
                zoomLevel = Math.max(zoomLevel - 0.1, 0.5);
                performZoom();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            if (pdfDocument) {
                e.preventDefault();
                zoomLevel = 1.0;
                performZoom();
            }
        }
    });

    // Efficient scroll handling with requestAnimationFrame (like PDF.js)
    canvasWrapper.addEventListener('scroll', () => {
        if (scrollAnimationId) {
            cancelAnimationFrame(scrollAnimationId);
        }
        scrollAnimationId = requestAnimationFrame(updateVisiblePages);
    }, { passive: true });

    // Drag and drop
    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('redactPdfJS.dropOneFile'), [i18n.t('common.ok')]);
                return;
            }

            if (droppedFilePath) {
                await window.electronAPI.deleteFile(droppedFilePath);
            }

            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({
                name: file.name,
                buffer: buffer
            });

            if (result.success) {
                droppedFilePath = result.filePath;
                await loadPdf(result.filePath);
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('redactPdfJS.failedToSave') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('redactPdfJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    // Load PDF and initialize continuous rendering
    async function loadPdf(filePath) {
        try {
            loadingUI.show(i18n.t('redactPdfJS.loadingPdf'));

            if (pdfDocument) {
                await pdfDocument.destroy();
            }

            const fileUrl = pathToFileURL(filePath);
            pdfDocument = await pdfjsLib.getDocument(fileUrl).promise;
            totalPages = pdfDocument.numPages;
            currentFilePath = filePath;
            currentPage = 1;
            redactions = {};
            zoomLevel = 1.0;
            pageContainers = {};
            renderingPages.clear();
            visiblePages.clear();
            renderedPages.clear();
            renderQueue = [];

            // Clear canvas
            canvasWrapper.innerHTML = '';
            canvasWrapper.classList.add('has-pdf');

            // Create page containers upfront
            for (let i = 1; i <= totalPages; i++) {
                const pageContainer = createPageContainer(i);
                canvasWrapper.appendChild(pageContainer);
                pageContainers[i] = pageContainer;
            }

            // Update UI
            document.getElementById('page-count').textContent = totalPages + i18n.t('redactPdfJS.pagesText');
            document.getElementById('total-pages').textContent = totalPages;
            pageInput.max = totalPages;
            pageInput.disabled = false;

            // Generate thumbnails
            await generateThumbnails();

            // Initial render of visible pages
            updateVisiblePages();

            // Enable controls
            applyBtn.disabled = true;
            clearBtn.disabled = false;
            zoomInBtn.disabled = false;
            zoomOutBtn.disabled = false;
            zoomFitBtn.disabled = false;

            loadingUI.hide();
        } catch (err) {
            console.error(err);
            loadingUI.hide();
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('redactPdfJS.errorLoadingPdf') + err.message, [i18n.t('common.ok')]);
        }
    }

    // Create a container for a single page
    function createPageContainer(pageNum) {
        const container = document.createElement('div');
        container.className = 'page-container';
        container.dataset.pageNum = pageNum;
        container.style.padding = PAGE_PADDING + 'px';
        container.style.display = 'flex';
        container.style.justifyContent = 'center';

        const canvasContainer = document.createElement('div');
        canvasContainer.style.position = 'relative';
        canvasContainer.style.display = 'inline-block';
        canvasContainer.style.width = 'fit-content';
        canvasContainer.style.height = 'fit-content';

        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'page-pdf-canvas';
        pdfCanvas.dataset.pageNum = pageNum;
        pdfCanvas.style.position = 'relative';
        pdfCanvas.style.zIndex = '1';

        const redactionCanvas = document.createElement('canvas');
        redactionCanvas.className = 'page-redaction-canvas';
        redactionCanvas.dataset.pageNum = pageNum;
        redactionCanvas.style.cursor = 'crosshair';
        redactionCanvas.style.position = 'absolute';
        redactionCanvas.style.top = '0';
        redactionCanvas.style.left = '0';
        redactionCanvas.style.zIndex = '2';

        // Store references for later
        container.pdfCanvas = pdfCanvas;
        container.redactionCanvas = redactionCanvas;
        container.pageNum = pageNum;

        canvasContainer.appendChild(pdfCanvas);
        canvasContainer.appendChild(redactionCanvas);
        container.appendChild(canvasContainer);

        // Redaction event listeners
        attachRedactionListeners(pageNum, redactionCanvas, pdfCanvas);

        return container;
    }

    // Attach redaction drawing and interaction listeners
    function attachRedactionListeners(pageNum, redactionCanvas, pdfCanvas) {
        let isDrawing = false;
        let startX, startY;

        redactionCanvas.addEventListener('mousedown', (e) => {
            if (!pdfDocument) return;

            const rect = redactionCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const pageRedactions = redactions[pageNum] || [];
            let clickedIndex = -1;

            // Check if clicking on existing redaction
            for (let i = pageRedactions.length - 1; i >= 0; i--) {
                const redact = pageRedactions[i];
                const x = redact.x * redactionCanvas.width;
                const y = redact.y * redactionCanvas.height;
                const w = redact.width * redactionCanvas.width;
                const h = redact.height * redactionCanvas.height;

                if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) {
                    clickedIndex = i;
                    break;
                }
            }

            if (clickedIndex !== -1) {
                pageRedactions.splice(clickedIndex, 1);
                if (pageRedactions.length === 0) {
                    delete redactions[pageNum];
                }
                redrawPageRedactions(pageNum);
                updateUI();
            } else {
                isDrawing = true;
                startX = mouseX;
                startY = mouseY;
            }
        });

        redactionCanvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;

            const rect = redactionCanvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            redrawPageRedactions(pageNum);

            const ctx = redactionCanvas.getContext('2d');
            ctx.fillStyle = redactionColor;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(startX, startY, currentX - startX, currentY - startY);
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        });

        redactionCanvas.addEventListener('mouseup', (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            const rect = redactionCanvas.getBoundingClientRect();
            const endX = e.clientX - rect.left;
            const endY = e.clientY - rect.top;

            const width = endX - startX;
            const height = endY - startY;

            if (Math.abs(width) > 5 && Math.abs(height) > 5) {
                if (!redactions[pageNum]) {
                    redactions[pageNum] = [];
                }

                const x = width < 0 ? endX : startX;
                const y = height < 0 ? endY : startY;
                const w = Math.abs(width);
                const h = Math.abs(height);

                pdfDocument.getPage(pageNum).then(page => {
                    const viewport = page.getViewport({ scale: zoomLevel });
                    redactions[pageNum].push({
                        x: x / viewport.width,
                        y: y / viewport.height,
                        width: w / viewport.width,
                        height: h / viewport.height,
                        color: redactionColor
                    });
                    redrawPageRedactions(pageNum);
                    updateUI();
                });
            } else {
                redrawPageRedactions(pageNum);
            }
        });

        redactionCanvas.addEventListener('mouseleave', () => {
            if (isDrawing) {
                isDrawing = false;
                redrawPageRedactions(pageNum);
            }
        });
    }

    // Update which pages are visible and queue them for rendering
    function updateVisiblePages() {
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        const newVisiblePages = new Set();
        const pagesToRender = [];

        // Find all visible pages
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageEl = pageContainers[pageNum];
            if (!pageEl) continue;

            const rect = pageEl.getBoundingClientRect();
            const isVisible = !(rect.bottom < wrapperRect.top || rect.top > wrapperRect.bottom);

            if (isVisible) {
                newVisiblePages.add(pageNum);

                // Only queue for rendering if not already cached
                if (!renderedPages.has(pageNum) && !renderingPages.has(pageNum)) {
                    pagesToRender.push(pageNum);
                }
            }
        }

        visiblePages = newVisiblePages;

        // Queue visible pages first, then queue nearby pages for preloading
        renderQueue = [
            ...pagesToRender,
            ...getPreloadPages(Array.from(newVisiblePages))
        ];

        processRenderQueue();
        updateCurrentPage();
    }

    // Get pages to preload (pages just outside viewport)
    function getPreloadPages(visiblePageNums) {
        if (visiblePageNums.length === 0) return [];

        const preload = [];
        const minVisible = Math.min(...visiblePageNums);
        const maxVisible = Math.max(...visiblePageNums);

        // Preload 2 pages before and after visible area
        for (let i = Math.max(1, minVisible - 2); i < minVisible; i++) {
            if (!renderedPages.has(i) && !renderingPages.has(i)) {
                preload.push(i);
            }
        }
        for (let i = maxVisible + 1; i <= Math.min(totalPages, maxVisible + 2); i++) {
            if (!renderedPages.has(i) && !renderingPages.has(i)) {
                preload.push(i);
            }
        }

        return preload;
    }

    // Process render queue efficiently
    async function processRenderQueue() {
        if (isProcessingQueue || renderQueue.length === 0) return;
        if (!pdfDocument) return;

        isProcessingQueue = true;

        while (renderQueue.length > 0) {
            // Prioritize visible pages
            let pageNum = null;

            // Find first visible page in queue
            for (let i = 0; i < renderQueue.length; i++) {
                if (visiblePages.has(renderQueue[i])) {
                    pageNum = renderQueue.splice(i, 1)[0];
                    break;
                }
            }

            // If no visible page, take first in queue
            if (pageNum === null) {
                pageNum = renderQueue.shift();
            }

            if (renderedPages.has(pageNum)) {
                continue;
            }

            await renderPageOptimized(pageNum);
        }

        isProcessingQueue = false;
    }

    // Render a single page (optimized)
    async function renderPageOptimized(pageNum) {
        if (renderedPages.has(pageNum) || renderingPages.has(pageNum)) return;
        if (!pdfDocument) return;

        renderingPages.add(pageNum);

        try {
            const page = await pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: zoomLevel });

            const pageEl = pageContainers[pageNum];
            if (!pageEl) return; // Page container was removed

            const pdfCanvas = pageEl.pdfCanvas;
            const redactionCanvas = pageEl.redactionCanvas;

            // Set canvas dimensions
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;
            redactionCanvas.width = viewport.width;
            redactionCanvas.height = viewport.height;

            // Apply styles
            pdfCanvas.style.display = 'block';
            pdfCanvas.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
            redactionCanvas.style.position = 'absolute';
            redactionCanvas.style.top = '0';
            redactionCanvas.style.left = '0';
            redactionCanvas.style.cursor = 'crosshair';
            redactionCanvas.style.display = 'block';
            redactionCanvas.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';

            // Render page to canvas
            const ctx = pdfCanvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Render redactions
            redrawPageRedactions(pageNum);

            // Mark as rendered (cached)
            renderedPages.add(pageNum);
        } catch (err) {
            console.error(`Error rendering page ${pageNum}:`, err);
        } finally {
            renderingPages.delete(pageNum);
        }
    }

    // Redraw redactions for a specific page
    function redrawPageRedactions(pageNum) {
        const pageEl = pageContainers[pageNum];
        if (!pageEl) return;

        const redactionCanvas = pageEl.redactionCanvas;
        const ctx = redactionCanvas.getContext('2d');
        ctx.clearRect(0, 0, redactionCanvas.width, redactionCanvas.height);

        const pageRedactions = redactions[pageNum] || [];
        pageRedactions.forEach(rect => {
            const x = rect.x * redactionCanvas.width;
            const y = rect.y * redactionCanvas.height;
            const w = rect.width * redactionCanvas.width;
            const h = rect.height * redactionCanvas.height;

            ctx.fillStyle = rect.color;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
        });
    }

    // Re-render all pages when zoom changes
    async function reRenderAllPages(pageToScrollTo = null) {
        renderingPages.clear();
        visiblePages.clear();

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageEl = pageContainers[pageNum];
            if (pageEl) {
                pageEl.pdfCanvas.width = 0;
                pageEl.pdfCanvas.height = 0;
                pageEl.redactionCanvas.width = 0;
                pageEl.redactionCanvas.height = 0;
            }
        }

        // Re-render and maintain position
        updateVisiblePages();

        // Scroll to the page we were on before zoom
        if (pageToScrollTo && pageContainers[pageToScrollTo]) {
            setTimeout(() => {
                pageContainers[pageToScrollTo].scrollIntoView({ behavior: 'auto', block: 'start' });
            }, 50);
        }

        updateUI();
    }    // Generate thumbnails
    async function generateThumbnails() {
        thumbnailList.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDocument.getPage(i);
            const viewport = page.getViewport({ scale: 0.3 });

            const canvas = document.createElement('canvas');
            canvas.className = 'thumbnail-canvas';
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            const item = document.createElement('div');
            item.className = 'thumbnail-item';

            const badge = document.createElement('div');
            badge.className = 'thumbnail-badge';
            badge.style.display = 'none';

            const label = document.createElement('div');
            label.className = 'thumbnail-label';
            label.textContent = i18n.t('redactPdfJS.pageLabel') + i;

            item.appendChild(badge);
            item.appendChild(canvas);
            item.appendChild(label);

            item.addEventListener('click', () => {
                const pageEl = pageContainers[i];
                if (pageEl) {
                    pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });

            thumbnailList.appendChild(item);
        }
    }

    // Update current page based on scroll position
    function updateCurrentPage() {
        if (visiblePages.size === 0) return;

        // Find the topmost visible page
        let topPage = currentPage;
        let topPosition = Infinity;

        for (let pageNum of visiblePages) {
            const pageEl = pageContainers[pageNum];
            const rect = pageEl.getBoundingClientRect();
            const distance = Math.abs(rect.top);
            if (distance < topPosition) {
                topPosition = distance;
                topPage = pageNum;
            }
        }

        currentPage = topPage;
        pageInput.value = currentPage;

        // Update zoom display
        document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;

        // Update active thumbnail
        document.querySelectorAll('.thumbnail-item').forEach((item, i) => {
            item.classList.toggle('active', i + 1 === currentPage);
        });
    }

    // Update UI
    function updateUI() {
        // Update thumbnail badges
        document.querySelectorAll('.thumbnail-item').forEach((item, i) => {
            const badge = item.querySelector('.thumbnail-badge');
            const count = (redactions[i + 1] || []).length;
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        });

        // Update apply button
        const totalRedactions = Object.values(redactions).reduce((sum, arr) => sum + arr.length, 0);
        applyBtn.disabled = totalRedactions === 0;
    }

    // Cleanup on exit
    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (droppedFilePath) {
                await window.electronAPI.deleteFile(droppedFilePath);
            }
            if (pdfDocument) {
                await pdfDocument.destroy();
            }
            window.location.href = '../../index.html';
        });
    }

    window.addEventListener('beforeunload', async () => {
        if (droppedFilePath) {
            await window.electronAPI.deleteFile(droppedFilePath);
        }
        if (pdfDocument) {
            await pdfDocument.destroy();
        }
    });
});
