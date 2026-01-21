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

// src/renderer/tools/cropPdf/cropPdf.js

import * as pdfjsLib from "../../../pdf/build/pdf.mjs";
import { API } from "../../api/api.js";
import customAlert from "../../utils/customAlert.js";
import loadingUI from "../../utils/loading.js";
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from "../../utils/i18n.js";
import { ThemeManager } from "../../utils/themeManager.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "../../../pdf/build/pdf.worker.mjs";

document.addEventListener("DOMContentLoaded", async () => {
  await API.init();
  await i18n.init();
  ThemeManager.init();

  const selectPdfBtn = document.getElementById("select-pdf-btn");
  const removePdfBtn = document.getElementById("remove-pdf-btn");
  const cropBtn = document.getElementById("crop-btn");
  const resetBtn = document.getElementById("reset-btn");
  const zoomInBtn = document.getElementById("zoom-in-btn");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  const resetZoomBtn = document.getElementById("reset-zoom-btn");
  const viewModeBtns = {
    single: document.getElementById("view-single-btn"),
    double: document.getElementById("view-double-btn"),
  };
  const pdfNameEl = document.getElementById("pdf-name");
  const pdfSizeEl = document.getElementById("pdf-size");
  const previewContainer = document.getElementById("preview-container");
  const previewGrid = document.getElementById("preview-grid");
  const pageCountEl = document.getElementById("page-count");
  const pageDisplayEl = document.getElementById("page-display");
  const pageInputEl = document.getElementById("page-input");
  const modal = document.getElementById("page-not-found-modal");
  const closeModalBtn = modal.querySelector(".close-btn");

  const pagesRangeRadios = document.querySelectorAll(
    'input[name="pages-range"]'
  );
  const customPagesGroup = document.getElementById("custom-pages-group");
  const customPages = document.getElementById("custom-pages");

  const margins = {
    top: document.getElementById("margin-top"),
    right: document.getElementById("margin-right"),
    bottom: document.getElementById("margin-bottom"),
    left: document.getElementById("margin-left"),
  };

  // ================ INTERNAL STATE ================
  let selectedFile = null;
  let droppedFilePath = null;
  let pdfDoc = null;
  let renderedPages = [];
  let currentPage = 1;
  let scale = 96 / 72;
  let viewMode = 'single'; // 'single', 'double'

  // Mouse cropping state
  let cropState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentCanvas: null,
    currentPageNum: null,
  };

  // Zoom state
  let zoomLevel = 1;
  const MIN_ZOOM = 1; // Start at 100%, no zoom out
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.25;

  // Ratio for converting pixels to PDF points
  const PIXEL_TO_POINT = 72 / 96;

  // Store original dimensions for each page
  let pageDimensions = [];

  // ================ EVENT LISTENERS ================
  selectPdfBtn.addEventListener("click", selectPdf);
  removePdfBtn.addEventListener("click", async () => {
    await cleanupDroppedFile();
    clearAll();
  });
  resetBtn.addEventListener("click", resetMargins);
  cropBtn.addEventListener("click", cropPdf);

  pageInputEl.addEventListener('change', () => {
    const pageNum = parseInt(pageInputEl.value, 10);
    navigateToPage(pageNum);
  });

  // Zoom button listeners (if they exist in your HTML)
  if (zoomInBtn) zoomInBtn.addEventListener("click", zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", zoomOut);
  if (resetZoomBtn) resetZoomBtn.addEventListener("click", resetZoom);

  // View mode button listeners
  viewModeBtns.single.addEventListener("click", () => setViewMode('single'));
  viewModeBtns.double.addEventListener("click", () => setViewMode('double'));

  previewGrid.addEventListener('scroll', () => {
    updateCurrentPageDisplay();
  });

  closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });

  // Back button with cleanup
  const backButton = document.querySelector('a[href="../../index.html"]');
  if (backButton) {
    backButton.addEventListener('click', async (e) => {
      e.preventDefault();
      await cleanupDroppedFile();
      clearAll();
      window.location.href = '../../index.html';
    });
  }

  pagesRangeRadios.forEach((r) => {
    r.addEventListener("change", () => {
      customPagesGroup.style.display = r.value === "custom" ? "block" : "none";
    });
  });

  Object.values(margins).forEach((input) => {
    input.addEventListener("input", () => {
      input.classList.remove("error");
      updateCropOverlay();
    });
  });

  // Mouse cropping event listeners
  previewGrid.addEventListener('mousedown', (e) => startCrop(e));
  previewGrid.addEventListener('mousemove', (e) => drawCrop(e));
  previewGrid.addEventListener('mouseup', () => endCrop());
  previewGrid.addEventListener('mouseleave', () => endCrop());

  initializeGlobalDragDrop({
    onFilesDropped: async (pdfFiles) => {
      if (pdfFiles.length > 1) {
        await customAlert.alert(i18n.t('alerts.notice'), i18n.t('cropPdfJS.dropOneFile'), [i18n.t('common.ok')]);
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
        await customAlert.alert(i18n.t('alerts.error'), i18n.t('cropPdfJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
      }
    },
    onInvalidFiles: async () => {
      await customAlert.alert(i18n.t('alerts.notice'), i18n.t('cropPdfJS.dropPdfFile'), [i18n.t('common.ok')]);
    }
  });

  // ================ FUNCTIONS ================
  async function selectPdf() {
    loadingUI.show(i18n.t('cropPdfJS.selectingPdf'));
    try {
      const files = await window.electronAPI.selectPdfs();
      if (!files || !files.length) return;

      const path = files[0];
      const name = path.split(/[\\/]/).pop();
      const size = await getFileSize(path);

      await handleFileSelected({ path, name, size });
    } finally {
      loadingUI.hide();
    }
  }

  async function handleFileSelected(file) {
    clearAll(true);

    selectedFile = file;
    pdfNameEl.textContent = file.name;
    pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;

    selectPdfBtn.style.display = "none";
    document.getElementById("selected-file-info").style.display = "flex";

    await renderPdfPreview(file.path);

    cropBtn.disabled = false;
  }

  async function renderPdfPreview(path) {
    loadingUI.show(i18n.t('cropPdfJS.renderingPdf'));
    previewContainer.style.display = "flex";
    previewContainer.style.flexDirection = "column";
    previewGrid.innerHTML = "";
    renderedPages = [];
    pageDimensions = [];
    currentPage = 1;
    zoomLevel = 1;
    viewMode = 'single';

    // Initialize zoom display
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
      zoomDisplay.textContent = '100%';
    }

    pdfDoc = await pdfjsLib.getDocument(`file://${path}`).promise;
    pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
    pageInputEl.max = pdfDoc.numPages;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      await renderPage(i);
    }

    updateViewMode();
    updateCurrentPageDisplay();
    updateCropOverlay();
    applyZoom();
    loadingUI.hide();
  }

  // ==================== VIEW MODE FUNCTIONS ====================
  function setViewMode(mode) {
    viewMode = mode;
    updateViewModeButtons();
    updateViewMode();
    updateCurrentPageDisplay();
  }

  function updateViewModeButtons() {
    // Remove active class from all buttons
    Object.values(viewModeBtns).forEach(btn => {
      btn.classList.remove('active');
    });

    // Add active class to selected button
    if (viewMode === 'single') {
      viewModeBtns.single.classList.add('active');
    } else if (viewMode === 'double') {
      viewModeBtns.double.classList.add('active');
    }
  }

  function updateViewMode() {
    previewGrid.className = 'preview-grid'; // Reset classes
    previewGrid.classList.add(`view-${viewMode}`);

    // Hide/show pages based on view mode
    renderedPages.forEach((canvas, index) => {
      const pageNum = index + 1;
      const wrapper = document.getElementById(`page-wrapper-${pageNum}`);

      if (!wrapper) return;

      if (viewMode === 'single') {
        // Show all pages in single column
        wrapper.style.display = 'flex';
      } else if (viewMode === 'double') {
        // Show pages in pairs
        wrapper.style.display = 'flex';
      }
    });

    // Reapply zoom to adjust spacing
    applyZoom();
  }

  // ==================== END VIEW MODE FUNCTIONS ====================

  function navigateToPage(pageNum) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      modal.style.display = 'block';
      pageInputEl.value = currentPage;
      return;
    }
    const pageWrapper = document.getElementById(`page-wrapper-${pageNum}`);
    if (pageWrapper) {
      const isMobile = window.innerWidth <= 768;
      pageWrapper.scrollIntoView({
        behavior: isMobile ? 'auto' : 'smooth',
        block: 'center'
      });
      currentPage = pageNum;
      pageDisplayEl.textContent = `${String(pageNum).padStart(2, '0')}/${pdfDoc.numPages}`;
    }
  }

  async function renderPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Store original dimensions
    pageDimensions.push({
      width: viewport.width,
      height: viewport.height
    });

    const wrapper = document.createElement("div");
    wrapper.className = "page-thumbnail";
    wrapper.id = `page-wrapper-${pageNum}`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.id = `canvas-${pageNum}`;
    canvas.style.cursor = "crosshair";

    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = i18n.t('cropPdfJS.pageLabel') + pageNum;

    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    previewGrid.appendChild(wrapper);

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    // store original for overlay redraw
    canvas.original = document.createElement("canvas");
    canvas.original.width = canvas.width;
    canvas.original.height = canvas.height;
    canvas.original.getContext("2d").drawImage(canvas, 0, 0);
    renderedPages.push(canvas);
  }

  function updateCurrentPageDisplay() {
    let maxVisibleHeight = 0;
    let mostVisiblePage = currentPage;

    for (let i = 1; i <= renderedPages.length; i++) {
      const pageWrapper = document.getElementById(`page-wrapper-${i}`);
      if (pageWrapper && pageWrapper.style.display !== 'none') {
        const rect = pageWrapper.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, previewGrid.clientHeight) - Math.max(rect.top, 0);

        if (visibleHeight > maxVisibleHeight) {
          maxVisibleHeight = visibleHeight;
          mostVisiblePage = i;
        }
      }
    }
    currentPage = mostVisiblePage;
    pageInputEl.value = currentPage;
    pageDisplayEl.textContent = `${String(currentPage).padStart(2, '0')}/${pdfDoc.numPages}`;
  }

  // ==================== MOUSE CROPPING FUNCTIONS ====================
  function startCrop(e) {
    const canvas = e.target.closest('canvas');
    if (!canvas || canvas.id.startsWith('compare-')) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    cropState.isDrawing = true;
    cropState.startX = (e.clientX - rect.left) * scaleX;
    cropState.startY = (e.clientY - rect.top) * scaleY;
    cropState.currentCanvas = canvas;
    cropState.currentPageNum = parseInt(canvas.id.split('-')[1]);
  }

  function drawCrop(e) {
    if (!cropState.isDrawing || !cropState.currentCanvas) return;

    const canvas = cropState.currentCanvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    // Calculate crop box
    const x1 = Math.min(cropState.startX, currentX);
    const y1 = Math.min(cropState.startY, currentY);
    const x2 = Math.max(cropState.startX, currentX);
    const y2 = Math.max(cropState.startY, currentY);

    // Redraw the page with crop overlay
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas.original, 0, 0);

    // Draw darkened areas outside crop box
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, y1); // Top
    ctx.fillRect(0, y2, canvas.width, canvas.height - y2); // Bottom
    ctx.fillRect(0, y1, x1, y2 - y1); // Left
    ctx.fillRect(x2, y1, canvas.width - x2, y2 - y1); // Right

    // Draw green crop box border
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#00ff62";
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  function endCrop() {
    if (!cropState.isDrawing) return;

    cropState.isDrawing = false;

    const canvas = cropState.currentCanvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get the crop box coordinates from the canvas's last drawn state
    const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;

    // Find the green crop box border (#00ff62)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Look for green color (high green, low red and blue)
      if (g > 200 && r < 100 && b < 100 && a > 200) {
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    // If we found a crop box, update margins
    if (minX <= maxX && minY <= maxY) {
      const cropLeft = minX * PIXEL_TO_POINT;
      const cropTop = minY * PIXEL_TO_POINT;
      const cropRight = (canvas.width - maxX) * PIXEL_TO_POINT;
      const cropBottom = (canvas.height - maxY) * PIXEL_TO_POINT;

      // Update margin inputs
      margins.top.value = Math.round(cropTop);
      margins.left.value = Math.round(cropLeft);
      margins.right.value = Math.round(cropRight);
      margins.bottom.value = Math.round(cropBottom);

      // Redraw overlay on all pages with new margins
      updateCropOverlay();
    } else {
      // If no valid crop box, just redraw with current margins
      updateCropOverlay();
    }

    cropState.currentCanvas = null;
    cropState.currentPageNum = null;
  }

  // ==================== END MOUSE CROPPING FUNCTIONS ====================

  function updateCropOverlay() {
    if (!renderedPages.length) return;

    const top = +margins.top.value || 0;
    const right = +margins.right.value || 0;
    const bottom = +margins.bottom.value || 0;
    const left = +margins.left.value || 0;

    const ratio = 96 / 72; // PDF point → pixel

    renderedPages.forEach(canvas => {
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(canvas.original, 0, 0);

      const cropW = w - left * ratio - right * ratio;
      const cropH = h - top * ratio - bottom * ratio;

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, w, top * ratio); // Top
      ctx.fillRect(0, top * ratio + cropH, w, h - (top * ratio + cropH)); // Bottom
      ctx.fillRect(0, top * ratio, left * ratio, cropH); // Left
      ctx.fillRect(left * ratio + cropW, top * ratio, right * ratio, cropH); // Right

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#00ff62";
      ctx.strokeRect(left * ratio, top * ratio, cropW, cropH);
    });
  }

  async function cropPdf() {
    if (!selectedFile) {
      customAlert.alert(i18n.t('alerts.notice'), i18n.t('cropPdfJS.selectPdfFirst'), [i18n.t('common.ok')]);
      return;
    }

    const body = {
      filePath: selectedFile.path,
      pagesRange: document.querySelector('input[name="pages-range"]:checked')
        .value,
      customPages: customPages.value.trim(),
      margins: {
        top: +margins.top.value || 0,
        right: +margins.right.value || 0,
        bottom: +margins.bottom.value || 0,
        left: +margins.left.value || 0,
      },
    };

    try {
      loadingUI.show(i18n.t('cropPdfJS.croppingPdf'));
      cropBtn.disabled = true;
      cropBtn.textContent = i18n.t('cropPdfJS.croppingBtn');

      const endpoint = await API.pdf.crop;
      const result = await API.request.post(endpoint, body, {
        responseType: "blob",
      });

      if (result) {
        const arrayBuffer = await result.arrayBuffer();
        const newName = selectedFile.name.replace(".pdf", "_cropped.pdf");

        const saved = await window.electronAPI.savePdfFile(
          newName,
          arrayBuffer
        );
        if (saved) {
          customAlert.alert(
            i18n.t('alerts.success'),
            i18n.t('cropPdfJS.successMessage') + saved,
            [i18n.t('common.ok')]
          );
        }
      }
    } catch (err) {
      console.error(err);
      customAlert.alert(i18n.t('alerts.error'), err.message, [i18n.t('common.ok')]);
    } finally {
      loadingUI.hide();
      cropBtn.disabled = false;
      cropBtn.textContent = i18n.t('cropPdf.crop-btn');
    }
  }

  function resetMargins() {
    Object.values(margins).forEach((m) => (m.value = 0));
    updateCropOverlay();
  }

  // ==================== ZOOM FUNCTIONS ====================
  function handleZoom(delta) {
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));
    applyZoom();
  }

  function zoomIn() {
    handleZoom(ZOOM_STEP);
  }

  function zoomOut() {
    handleZoom(-ZOOM_STEP);
  }

  function resetZoom() {
    zoomLevel = 1;
    applyZoom();
  }

  function applyZoom() {
    renderedPages.forEach((canvas, index) => {
      const wrapper = canvas.parentElement;
      const pageNum = index + 1;
      const dimensions = pageDimensions[index];
      
      if (!dimensions) return;

      // Apply transform for zoom
      wrapper.style.transform = `scale(${zoomLevel})`;
      wrapper.style.transformOrigin = 'center top';
      
      // Calculate the extra space needed due to zoom
      // When zoomed, the element takes more visual space
      const scaledHeight = dimensions.height * zoomLevel;
      const originalHeight = dimensions.height;
      const extraHeight = scaledHeight - originalHeight;
      
      // Add margin to prevent overlap - only bottom margin to push next page down
      wrapper.style.marginBottom = `${extraHeight}px`;
      
      // For double view mode, also adjust horizontal spacing
      if (viewMode === 'double') {
        const scaledWidth = dimensions.width * zoomLevel;
        const originalWidth = dimensions.width;
        const extraWidth = scaledWidth - originalWidth;
        
        // Add horizontal margin for double page view
        wrapper.style.marginRight = `${extraWidth / 2}px`;
        wrapper.style.marginLeft = `${extraWidth / 2}px`;
      } else {
        // Reset horizontal margins for single view
        wrapper.style.marginRight = '0';
        wrapper.style.marginLeft = '0';
      }
    });

    // Update zoom level display
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    // Update button states
    if (zoomOutBtn) {
      zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
      zoomOutBtn.style.opacity = zoomLevel <= MIN_ZOOM ? '0.5' : '1';
      zoomOutBtn.style.cursor = zoomLevel <= MIN_ZOOM ? 'not-allowed' : 'pointer';
    }
    if (zoomInBtn) {
      zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
      zoomInBtn.style.opacity = zoomLevel >= MAX_ZOOM ? '0.5' : '1';
      zoomInBtn.style.cursor = zoomLevel >= MAX_ZOOM ? 'not-allowed' : 'pointer';
    }
    if (resetZoomBtn) {
      resetZoomBtn.disabled = zoomLevel === 1;
      resetZoomBtn.style.opacity = zoomLevel === 1 ? '0.5' : '1';
      resetZoomBtn.style.cursor = zoomLevel === 1 ? 'not-allowed' : 'pointer';
    }
  }

  // ==================== END ZOOM FUNCTIONS ====================

  async function getFileSize(path) {
    try {
      const info = await window.electronAPI.getFileInfo(path);
      return info.size || 0;
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

  function clearAll(preserveDroppedFilePath = false) {
    renderedPages = [];
    pageDimensions = [];
    previewGrid.innerHTML = "";
    previewContainer.style.display = "none";

    selectPdfBtn.style.display = "block";
    document.getElementById("selected-file-info").style.display = "none";

    cropBtn.disabled = true;
    selectedFile = null;
    if (!preserveDroppedFilePath) {
      droppedFilePath = null;
    }
    pdfDoc = null;
    currentPage = 1;
    zoomLevel = 1;
    viewMode = 'single';
    pageCountEl.textContent = '';
    pageDisplayEl.textContent = '';
    pageInputEl.value = '';

    // Reset zoom display
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
      zoomDisplay.textContent = '100%';
    }

    // Reset view mode buttons
    updateViewModeButtons();
    
    // Ensure zoom buttons are enabled
    if (zoomOutBtn) {
      zoomOutBtn.disabled = false;
      zoomOutBtn.style.opacity = '1';
      zoomOutBtn.style.cursor = 'pointer';
    }
    if (zoomInBtn) {
      zoomInBtn.disabled = false;
      zoomInBtn.style.opacity = '1';
      zoomInBtn.style.cursor = 'pointer';
    }
    if (resetZoomBtn) {
      resetZoomBtn.disabled = true;
      resetZoomBtn.style.opacity = '0.5';
      resetZoomBtn.style.cursor = 'not-allowed';
    }
  }
});