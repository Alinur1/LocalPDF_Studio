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

// src/renderer/tools/imageEditor/imageEditor.js

import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDropForImages } from '../../utils/globalDragDrop.js';
import { ThemeManager } from '../../utils/themeManager.js';
import i18n from '../../utils/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    ThemeManager.init();

    const selectImageBtn = document.getElementById('select-image-btn');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const imageNameEl = document.getElementById('image-name');
    const imageSizeEl = document.getElementById('image-size');
    const editorWorkspace = document.getElementById('editor-workspace');
    const actionButtons = document.getElementById('action-buttons');
    const canvasDimensionsEl = document.getElementById('canvas-dimensions');
    const editorCanvas = document.getElementById('editor-canvas');
    const ctx = editorCanvas.getContext('2d');
    const cropOverlayCanvas = document.getElementById('crop-overlay');
    const cropCtx = cropOverlayCanvas.getContext('2d');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const saveBtn = document.getElementById('save-btn');
    const resetBtn = document.getElementById('reset-btn');
    const saveFormat = document.getElementById('save-format');
    let originalImage = null;
    let selectedFile = null;
    let droppedFilePath = null;
    const MAX_PREVIEW_SIZE = 1200; // max dimension for preview processing
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');
    let previewScale = 1;
    let rafPending = false;
    let pixelDebounceTimer = null;
    const PIXEL_DEBOUNCE_MS = 80; // ms to wait after last slider move

    // Transform state
    let rotation90 = 0;
    let flipH = false;
    let flipV = false;
    let fineRotation = 0;
    let resizeW = 0;
    let resizeH = 0;
    let aspectRatio = 1;

    // Pixel adjustment state
    let brightness = 0;
    let contrast = 0;
    let saturation = 0;
    let exposure = 0;
    let sharpness = 0;
    let blurAmount = 0;
    let opacityAdj = 100;

    // Filter state
    let activeFilter = 'none';

    // Text overlay state
    let textOverlay = null;

    // Crop state
    let cropMode = false;
    let cropStart = null;
    let cropEnd = null;
    let isCropDragging = false;
    let cropApplied = false;

    // ─── Helpers ─────────────────────────────────────────────────────────
    function scheduleRender() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            renderCanvas();
        });
    }

    function schedulePixelRender() {
        scheduleRender();
        clearTimeout(pixelDebounceTimer);
        pixelDebounceTimer = setTimeout(() => {
            scheduleRender();
        }, PIXEL_DEBOUNCE_MS);
    }

    function updateOffscreenSize(logicalW, logicalH) {
        const maxDim = Math.max(logicalW, logicalH);
        if (maxDim <= MAX_PREVIEW_SIZE) {
            previewScale = 1;
            offscreenCanvas.width = logicalW;
            offscreenCanvas.height = logicalH;
        } else {
            previewScale = MAX_PREVIEW_SIZE / maxDim;
            offscreenCanvas.width = Math.round(logicalW * previewScale);
            offscreenCanvas.height = Math.round(logicalH * previewScale);
        }
    }

    // ─── Tab navigation ───────────────────────────────────────────────────

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            if (btn.dataset.tab !== 'crop' && cropMode) exitCropMode();
        });
    });

    // ─── File loading ─────────────────────────────────────────────────────

    selectImageBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('imageEditorJS.selecting-image'));
        try {
            const files = await window.electronAPI.selectPdfsAndImages();
            if (files && files.length > 0) {
                const imagePaths = files.filter(f => /\.(jpg|jpeg|png|bmp|webp|tiff)$/i.test(f));
                if (imagePaths.length === 0) {
                    await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageEditorJS.invalid-files'), [i18n.t('imageEditorJS.btn-ok')]);
                    return;
                }
                const filePath = imagePaths[0];
                const fileName = filePath.split(/[\\/]/).pop();
                const fileInfo = await window.electronAPI.getFileInfo(filePath);
                await loadImageFromPath(filePath, fileName, fileInfo.size || 0);
            }
        } finally {
            loadingUI.hide();
        }
    });

    removeImageBtn.addEventListener('click', async () => {
        await cleanupDroppedFile();
        clearAll();
    });

    document.getElementById('back-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await cleanupDroppedFile();
        clearAll();
        window.location.href = '../../index.html';
    });

    async function loadImageFromPath(filePath, fileName, fileSize) {
        return new Promise((resolve, reject) => {
            loadingUI.show(i18n.t('imageEditorJS.selecting-image'));
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                selectedFile = { name: fileName, size: fileSize, path: filePath };

                resizeW = img.naturalWidth;
                resizeH = img.naturalHeight;
                aspectRatio = img.naturalWidth / img.naturalHeight;

                document.getElementById('resize-width').value = resizeW;
                document.getElementById('resize-height').value = resizeH;

                resetAdjustmentState();

                selectImageBtn.style.display = 'none';
                selectedFileInfo.style.display = 'flex';
                imageNameEl.textContent = fileName;
                imageSizeEl.textContent = `(${(fileSize / 1024 / 1024).toFixed(2)} MB) — ${img.naturalWidth} × ${img.naturalHeight} px`;
                editorWorkspace.style.display = 'flex';
                actionButtons.style.display = 'flex';

                renderCanvas();
                loadingUI.hide();
                resolve();
            };
            img.onerror = () => {
                loadingUI.hide();
                customAlert.alert(i18n.t('alerts.error'), i18n.t('imageEditorJS.failed-load-image'), [i18n.t('imageEditorJS.btn-ok')]);
                reject(new Error('Image load failed'));
            };
            img.src = `file://${filePath}`;
        });
    }

    // ─── Rendering ────────────────────────────────────────────────────────
    function renderCanvas() {
        if (!originalImage) return;

        const isRotated90 = (rotation90 % 180 !== 0);
        const logicalW = isRotated90 ? resizeH : resizeW;
        const logicalH = isRotated90 ? resizeW : resizeH;

        // Size the display canvas to the logical (output) dimensions
        editorCanvas.width = logicalW;
        editorCanvas.height = logicalH;
        canvasDimensionsEl.textContent = `${logicalW} × ${logicalH} px`;

        // Size offscreen canvas (downscaled for preview pixel work)
        updateOffscreenSize(logicalW, logicalH);

        const ow = offscreenCanvas.width;
        const oh = offscreenCanvas.height;

        // --- Step 1: draw to offscreen with transforms + CSS filters ---
        offscreenCtx.save();
        offscreenCtx.clearRect(0, 0, ow, oh);
        offscreenCtx.translate(ow / 2, oh / 2);
        offscreenCtx.rotate((rotation90 * Math.PI) / 180);
        offscreenCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        offscreenCtx.rotate((fineRotation * Math.PI) / 180);

        const drawW = isRotated90 ? resizeH * previewScale : resizeW * previewScale;
        const drawH = isRotated90 ? resizeW * previewScale : resizeH * previewScale;

        offscreenCtx.globalAlpha = opacityAdj / 100;
        offscreenCtx.filter = buildCSSFilter();
        offscreenCtx.drawImage(originalImage, -drawW / 2, -drawH / 2, drawW, drawH);
        offscreenCtx.restore();

        // --- Step 2: pixel-level effects on the small offscreen canvas ---
        const needsPixelPass = activeFilter !== 'none' || saturation !== 0 || sharpness > 0;
        if (needsPixelPass) {
            applyPixelEffects(offscreenCtx, ow, oh);
        }

        // --- Step 3: blit offscreen → display canvas (upscale back) ---
        ctx.save();
        ctx.clearRect(0, 0, logicalW, logicalH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreenCanvas, 0, 0, ow, oh, 0, 0, logicalW, logicalH);
        ctx.restore();

        // --- Step 4: text overlay at full display resolution ---
        if (textOverlay) drawTextOverlay();
    }

    function renderFullResolution() {
        if (!originalImage) return;

        const isRotated90 = (rotation90 % 180 !== 0);
        const logicalW = isRotated90 ? resizeH : resizeW;
        const logicalH = isRotated90 ? resizeW : resizeH;

        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = logicalW;
        fullCanvas.height = logicalH;
        const fCtx = fullCanvas.getContext('2d');

        fCtx.save();
        fCtx.clearRect(0, 0, logicalW, logicalH);
        fCtx.translate(logicalW / 2, logicalH / 2);
        fCtx.rotate((rotation90 * Math.PI) / 180);
        fCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        fCtx.rotate((fineRotation * Math.PI) / 180);

        const drawW = isRotated90 ? resizeH : resizeW;
        const drawH = isRotated90 ? resizeW : resizeH;

        fCtx.globalAlpha = opacityAdj / 100;
        fCtx.filter = buildCSSFilter();
        fCtx.drawImage(originalImage, -drawW / 2, -drawH / 2, drawW, drawH);
        fCtx.restore();

        const needsPixelPass = activeFilter !== 'none' || saturation !== 0 || sharpness > 0;
        if (needsPixelPass) {
            applyPixelEffects(fCtx, logicalW, logicalH);
        }

        // Text overlay
        if (textOverlay) drawTextOverlayOnCtx(fCtx, logicalW, logicalH);

        return fullCanvas;
    }

    function buildCSSFilter() {
        const filters = [];
        filters.push(`brightness(${1 + brightness / 100})`);
        filters.push(`contrast(${1 + contrast / 100})`);
        if (blurAmount > 0) filters.push(`blur(${blurAmount * 0.5}px)`);
        if (exposure !== 0) filters.push(`brightness(${1 + exposure / 150})`);

        // Simple CSS-only filters (no pixel pass needed)
        switch (activeFilter) {
            case 'grayscale': filters.push('grayscale(1)'); break;
            case 'sepia': filters.push('sepia(1)'); break;
            case 'invert': filters.push('invert(1)'); break;
        }
        return filters.join(' ');
    }

    function applyPixelEffects(targetCtx, w, h) {
        const imageData = targetCtx.getImageData(0, 0, w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], b = data[i + 2];

            if (saturation !== 0) {
                const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                const sat = saturation / 100;
                if (sat > 0) {
                    r = r + (r - grey) * sat;
                    g = g + (g - grey) * sat;
                    b = b + (b - grey) * sat;
                } else {
                    r = r + (grey - r) * (-sat);
                    g = g + (grey - g) * (-sat);
                    b = b + (grey - b) * (-sat);
                }
            }

            switch (activeFilter) {
                case 'vintage': {
                    r = Math.min(255, r * 1.1 + 20);
                    g = Math.min(255, g * 0.95);
                    b = Math.min(255, b * 0.7);
                    break;
                }
                case 'cool': {
                    r = Math.max(0, r - 20);
                    b = Math.min(255, b + 30);
                    break;
                }
                case 'warm': {
                    r = Math.min(255, r + 30);
                    g = Math.min(255, g + 10);
                    b = Math.max(0, b - 20);
                    break;
                }
                case 'dramatic': {
                    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    r = r * 0.6 + grey * 0.4;
                    g = g * 0.6 + grey * 0.4;
                    b = b * 0.6 + grey * 0.4;
                    if (r > 128) r = Math.min(255, r * 1.2);
                    if (g > 128) g = Math.min(255, g * 1.2);
                    if (b > 128) b = Math.min(255, b * 1.2);
                    break;
                }
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }

        if (sharpness > 0) {
            applyUnsharpMask(imageData, sharpness);
        }

        targetCtx.putImageData(imageData, 0, 0);
    }

    function applyUnsharpMask(imageData, amount) {
        const w = imageData.width;
        const h = imageData.height;
        const src = new Uint8ClampedArray(imageData.data);
        const data = imageData.data;
        const factor = amount * 0.15;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const current = src[idx + c];
                    const avg = (
                        src[((y - 1) * w + x) * 4 + c] +
                        src[((y + 1) * w + x) * 4 + c] +
                        src[(y * w + (x - 1)) * 4 + c] +
                        src[(y * w + (x + 1)) * 4 + c]
                    ) / 4;
                    data[idx + c] = Math.max(0, Math.min(255, current + (current - avg) * factor));
                }
            }
        }
    }

    // ─── Text overlay ─────────────────────────────────────────────────────

    function drawTextOverlay() {
        drawTextOverlayOnCtx(ctx, editorCanvas.width, editorCanvas.height);
    }

    function drawTextOverlayOnCtx(targetCtx, cw, ch) {
        if (!textOverlay || !textOverlay.text.trim()) return;
        const { text, size, color, weight, position, bg } = textOverlay;

        targetCtx.save();
        targetCtx.font = `${weight} ${size}px system-ui, sans-serif`;
        targetCtx.fillStyle = color;
        targetCtx.textBaseline = 'middle';
        targetCtx.textAlign = 'center';

        const padding = size * 0.6;
        const lines = text.split('\n');
        const lineH = size * 1.3;
        const totalH = lines.length * lineH;
        const maxW = Math.max(...lines.map(l => targetCtx.measureText(l).width));

        let x, y;
        const [vPos, hPos] = position.split('-');

        if (hPos === 'left' || position === 'middle-left') {
            targetCtx.textAlign = 'left';
            x = padding;
        } else if (hPos === 'right' || position === 'middle-right') {
            targetCtx.textAlign = 'right';
            x = cw - padding;
        } else {
            targetCtx.textAlign = 'center';
            x = cw / 2;
        }

        if (vPos === 'top') {
            y = padding + totalH / 2;
        } else if (vPos === 'bottom') {
            y = ch - padding - totalH / 2;
        } else {
            y = ch / 2 - totalH / 2 + lineH / 2;
        }

        if (bg) {
            const boxPadX = size * 0.4;
            const boxPadY = size * 0.25;
            let boxX;
            if (targetCtx.textAlign === 'left') boxX = x - boxPadX;
            else if (targetCtx.textAlign === 'right') boxX = x - maxW - boxPadX;
            else boxX = x - maxW / 2 - boxPadX;

            targetCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            roundRect(targetCtx, boxX, y - totalH / 2 - boxPadY, maxW + boxPadX * 2, totalH + boxPadY * 2, 6);
            targetCtx.fill();
            targetCtx.fillStyle = color;
        }

        lines.forEach((line, i) => {
            targetCtx.fillText(line, x, y + i * lineH);
        });

        targetCtx.restore();
    }

    function roundRect(targetCtx, x, y, width, height, radius) {
        targetCtx.beginPath();
        targetCtx.moveTo(x + radius, y);
        targetCtx.lineTo(x + width - radius, y);
        targetCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
        targetCtx.lineTo(x + width, y + height - radius);
        targetCtx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        targetCtx.lineTo(x + radius, y + height);
        targetCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
        targetCtx.lineTo(x, y + radius);
        targetCtx.quadraticCurveTo(x, y, x + radius, y);
        targetCtx.closePath();
    }

    // ─── Slider bindings ──────────────────────────────────────────────────

    function bindSlider(id, stateKey, displayId, suffix = '', usePixelDebounce = false) {
        const slider = document.getElementById(id);
        const display = document.getElementById(displayId);
        slider.addEventListener('input', () => {
            const val = parseInt(slider.value);
            switch (stateKey) {
                case 'brightness': brightness = val; break;
                case 'contrast': contrast = val; break;
                case 'saturation': saturation = val; break;
                case 'exposure': exposure = val; break;
                case 'sharpness': sharpness = val; break;
                case 'blur': blurAmount = val; break;
                case 'opacity': opacityAdj = val; break;
                case 'fineRotation': fineRotation = val; break;
            }
            display.textContent = suffix ? `${val}${suffix}` : `${val}`;
            if (usePixelDebounce) {
                schedulePixelRender();
            } else {
                scheduleRender();
            }
        });
    }

    // CSS-filter-only sliders → fast, no debounce needed
    bindSlider('brightness', 'brightness', 'brightness-value');
    bindSlider('contrast', 'contrast', 'contrast-value');
    bindSlider('exposure', 'exposure', 'exposure-value');
    bindSlider('blur', 'blur', 'blur-value');
    bindSlider('opacity-adj', 'opacity', 'opacity-value', '%');
    bindSlider('fine-rotation', 'fineRotation', 'fine-rotation-value', '°');

    // Pixel-pass sliders → debounce
    bindSlider('saturation', 'saturation', 'saturation-value', '', true);
    bindSlider('sharpness', 'sharpness', 'sharpness-value', '', true);

    document.getElementById('rotate-cw').addEventListener('click', () => {
        rotation90 = (rotation90 + 90) % 360;
        [resizeW, resizeH] = [resizeH, resizeW];
        document.getElementById('resize-width').value = resizeW;
        document.getElementById('resize-height').value = resizeH;
        scheduleRender();
    });

    document.getElementById('rotate-ccw').addEventListener('click', () => {
        rotation90 = (rotation90 - 90 + 360) % 360;
        [resizeW, resizeH] = [resizeH, resizeW];
        document.getElementById('resize-width').value = resizeW;
        document.getElementById('resize-height').value = resizeH;
        scheduleRender();
    });

    document.getElementById('flip-h').addEventListener('click', () => { flipH = !flipH; scheduleRender(); });
    document.getElementById('flip-v').addEventListener('click', () => { flipV = !flipV; scheduleRender(); });

    const lockAspect = document.getElementById('lock-aspect');
    const rwInput = document.getElementById('resize-width');
    const rhInput = document.getElementById('resize-height');

    rwInput.addEventListener('input', () => {
        const w = parseInt(rwInput.value);
        if (!w || w < 1) return;
        resizeW = w;
        if (lockAspect.checked) { resizeH = Math.round(w / aspectRatio); rhInput.value = resizeH; }
    });

    rhInput.addEventListener('input', () => {
        const h = parseInt(rhInput.value);
        if (!h || h < 1) return;
        resizeH = h;
        if (lockAspect.checked) { resizeW = Math.round(h * aspectRatio); rwInput.value = resizeW; }
    });

    document.getElementById('apply-resize').addEventListener('click', () => {
        const w = parseInt(rwInput.value);
        const h = parseInt(rhInput.value);
        if (!w || !h || w < 1 || h < 1 || w > 10000 || h > 10000) {
            customAlert.alert(i18n.t('alerts.warning'), i18n.t('imageEditorJS.invalid-dimensions'), [i18n.t('imageEditorJS.btn-ok')]);
            return;
        }
        resizeW = w;
        resizeH = h;
        scheduleRender();
    });

    // Filters: pixel-based ones need debounce, CSS-only ones are instant
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            const cssOnlyFilters = new Set(['none', 'grayscale', 'sepia', 'invert']);
            if (cssOnlyFilters.has(activeFilter)) {
                scheduleRender();
            } else {
                schedulePixelRender();
            }
        });
    });

    document.getElementById('text-color').addEventListener('input', (e) => {
        document.getElementById('text-color-preview').style.backgroundColor = e.target.value;
    });

    document.querySelectorAll('.pos-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    document.getElementById('text-size').addEventListener('input', (e) => {
        document.getElementById('text-size-value').textContent = `${e.target.value}px`;
    });

    document.getElementById('apply-text').addEventListener('click', () => {
        const text = document.getElementById('text-content').value.trim();
        if (!text) {
            customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageEditorJS.empty-text'), [i18n.t('imageEditorJS.btn-ok')]);
            return;
        }
        const activePos = document.querySelector('.pos-btn.active');
        textOverlay = {
            text,
            size: parseInt(document.getElementById('text-size').value),
            color: document.getElementById('text-color').value,
            weight: document.getElementById('text-weight').value,
            position: activePos ? activePos.dataset.pos : 'center',
            bg: document.getElementById('text-bg').checked
        };
        scheduleRender();
    });

    document.getElementById('clear-text').addEventListener('click', () => {
        textOverlay = null;
        scheduleRender();
    });

    // ─── Crop ─────────────────────────────────────────────────────────────

    document.getElementById('start-crop').addEventListener('click', () => enterCropMode());
    document.getElementById('apply-crop').addEventListener('click', () => applyCrop());
    document.getElementById('cancel-crop').addEventListener('click', () => exitCropMode());

    function enterCropMode() {
        cropMode = true;
        cropStart = null;
        cropEnd = null;
        cropApplied = false;
        isCropDragging = false;

        cropOverlayCanvas.width = editorCanvas.width;
        cropOverlayCanvas.height = editorCanvas.height;
        cropOverlayCanvas.style.width = editorCanvas.style.width || editorCanvas.offsetWidth + 'px';
        cropOverlayCanvas.style.height = editorCanvas.style.height || editorCanvas.offsetHeight + 'px';
        cropOverlayCanvas.style.left = editorCanvas.offsetLeft + 'px';
        cropOverlayCanvas.style.top = editorCanvas.offsetTop + 'px';
        cropOverlayCanvas.style.display = 'block';

        document.getElementById('apply-crop').disabled = true;
        document.getElementById('cancel-crop').disabled = false;
        document.getElementById('start-crop').disabled = true;
        document.getElementById('crop-coords').style.display = 'none';

        cropOverlayCanvas.addEventListener('mousedown', onCropMouseDown);
        cropOverlayCanvas.addEventListener('mousemove', onCropMouseMove);
        cropOverlayCanvas.addEventListener('mouseup', onCropMouseUp);
    }

    function exitCropMode() {
        cropMode = false;
        cropStart = null;
        cropEnd = null;
        cropApplied = false;
        cropOverlayCanvas.style.display = 'none';
        cropCtx.clearRect(0, 0, cropOverlayCanvas.width, cropOverlayCanvas.height);
        document.getElementById('apply-crop').disabled = true;
        document.getElementById('cancel-crop').disabled = true;
        document.getElementById('start-crop').disabled = false;
        document.getElementById('crop-coords').style.display = 'none';
        cropOverlayCanvas.removeEventListener('mousedown', onCropMouseDown);
        cropOverlayCanvas.removeEventListener('mousemove', onCropMouseMove);
        cropOverlayCanvas.removeEventListener('mouseup', onCropMouseUp);
    }

    function getCropPoint(e) {
        const rect = cropOverlayCanvas.getBoundingClientRect();
        const scaleX = cropOverlayCanvas.width / rect.width;
        const scaleY = cropOverlayCanvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }

    function getConstrainedCropEnd(start, end) {
        const ratioStr = document.getElementById('crop-ratio').value;
        if (ratioStr === 'free') return end;
        const [rw, rh] = ratioStr.split(':').map(Number);
        const ratio = rw / rh;
        let w = end.x - start.x, h = end.y - start.y;
        const signX = w < 0 ? -1 : 1, signY = h < 0 ? -1 : 1;
        w = Math.abs(w); h = Math.abs(h);
        if (w / h > ratio) h = w / ratio; else w = h * ratio;
        return { x: start.x + w * signX, y: start.y + h * signY };
    }

    function onCropMouseDown(e) {
        isCropDragging = true;
        cropStart = getCropPoint(e);
        cropEnd = { ...cropStart };
    }

    function onCropMouseMove(e) {
        if (!isCropDragging || !cropStart) return;
        cropEnd = getConstrainedCropEnd(cropStart, getCropPoint(e));
        drawCropOverlay();
    }

    function onCropMouseUp(e) {
        if (!isCropDragging) return;
        isCropDragging = false;
        cropEnd = getConstrainedCropEnd(cropStart, getCropPoint(e));
        drawCropOverlay();
        const w = Math.round(Math.abs(cropEnd.x - cropStart.x));
        const h = Math.round(Math.abs(cropEnd.y - cropStart.y));
        if (w > 5 && h > 5) {
            cropApplied = true;
            document.getElementById('apply-crop').disabled = false;
            document.getElementById('crop-coords').style.display = 'block';
            const x = Math.round(Math.min(cropStart.x, cropEnd.x));
            const y = Math.round(Math.min(cropStart.y, cropEnd.y));
            document.getElementById('crop-info').textContent = `x:${x} y:${y}  ${w} × ${h} px`;
        }
    }

    function drawCropOverlay() {
        if (!cropStart || !cropEnd) return;
        const cw = cropOverlayCanvas.width, ch = cropOverlayCanvas.height;
        const x = Math.min(cropStart.x, cropEnd.x), y = Math.min(cropStart.y, cropEnd.y);
        const w = Math.abs(cropEnd.x - cropStart.x), h = Math.abs(cropEnd.y - cropStart.y);

        cropCtx.clearRect(0, 0, cw, ch);
        cropCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        cropCtx.fillRect(0, 0, cw, ch);
        cropCtx.clearRect(x, y, w, h);

        cropCtx.strokeStyle = '#3498db';
        cropCtx.lineWidth = 2;
        cropCtx.strokeRect(x, y, w, h);

        cropCtx.strokeStyle = 'rgba(52, 152, 219, 0.4)';
        cropCtx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            cropCtx.beginPath(); cropCtx.moveTo(x + (w / 3) * i, y); cropCtx.lineTo(x + (w / 3) * i, y + h); cropCtx.stroke();
            cropCtx.beginPath(); cropCtx.moveTo(x, y + (h / 3) * i); cropCtx.lineTo(x + w, y + (h / 3) * i); cropCtx.stroke();
        }

        const hs = 8;
        cropCtx.fillStyle = '#3498db';
        [[x, y], [x + w - hs, y], [x, y + h - hs], [x + w - hs, y + h - hs]].forEach(([hx, hy]) => {
            cropCtx.fillRect(hx, hy, hs, hs);
        });
    }

    function applyCrop() {
        if (!cropStart || !cropEnd) return;
        const x = Math.round(Math.min(cropStart.x, cropEnd.x));
        const y = Math.round(Math.min(cropStart.y, cropEnd.y));
        const w = Math.round(Math.abs(cropEnd.x - cropStart.x));
        const h = Math.round(Math.abs(cropEnd.y - cropStart.y));
        if (w < 1 || h < 1) return;

        const croppedData = ctx.getImageData(x, y, w, h);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCanvas.getContext('2d').putImageData(croppedData, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            originalImage = newImg;
            resizeW = w; resizeH = h; aspectRatio = w / h;
            rotation90 = 0; flipH = false; flipV = false; fineRotation = 0;
            document.getElementById('resize-width').value = w;
            document.getElementById('resize-height').value = h;
            document.getElementById('fine-rotation').value = 0;
            document.getElementById('fine-rotation-value').textContent = '0°';
            exitCropMode();
            resetAdjustmentState();
            renderCanvas();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    // ─── Reset ────────────────────────────────────────────────────────────

    resetBtn.addEventListener('click', async () => {
        const result = await customAlert.alert(
            i18n.t('alerts.warning'),
            i18n.t('imageEditorJS.reset-confirm-msg'),
            [i18n.t('imageEditorJS.btn-cancel'), i18n.t('imageEditorJS.btn-reset')]
        );
        if (result === 1) {
            rotation90 = 0; flipH = false; flipV = false;
            resizeW = originalImage.naturalWidth;
            resizeH = originalImage.naturalHeight;
            aspectRatio = originalImage.naturalWidth / originalImage.naturalHeight;
            document.getElementById('resize-width').value = resizeW;
            document.getElementById('resize-height').value = resizeH;
            textOverlay = null;
            exitCropMode();
            resetAdjustmentState();
            renderCanvas();
        }
    });

    function resetAdjustmentState() {
        brightness = 0; contrast = 0; saturation = 0; exposure = 0;
        sharpness = 0; blurAmount = 0; opacityAdj = 100; fineRotation = 0;
        activeFilter = 'none';
        textOverlay = null;

        ['brightness', 'contrast', 'saturation', 'exposure', 'sharpness', 'blur'].forEach(id => {
            document.getElementById(id).value = 0;
            document.getElementById(`${id}-value`).textContent = '0';
        });
        document.getElementById('opacity-adj').value = 100;
        document.getElementById('opacity-value').textContent = '100%';
        document.getElementById('fine-rotation').value = 0;
        document.getElementById('fine-rotation-value').textContent = '0°';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-filter="none"]').classList.add('active');
    }

    // ─── Save ─────────────────────────────────────────────────────────────

    saveBtn.addEventListener('click', async () => {
        if (!originalImage || !selectedFile) return;

        const format = saveFormat.value;
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
        const quality = format === 'image/jpeg' ? 0.92 : undefined;

        loadingUI.show(i18n.t('imageEditorJS.saving-image'));
        try {
            // Use full-resolution render for saving, not the preview canvas
            const fullCanvas = renderFullResolution();
            const dataUrl = fullCanvas.toDataURL(format, quality);
            const base64 = dataUrl.split(',')[1];
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            const defaultName = selectedFile.name.replace(/\.[^.]+$/, '') + `_edited.${ext}`;
            const savedPath = await window.electronAPI.saveImageFile(defaultName, bytes.buffer);

            if (savedPath) {
                await customAlert.alert(i18n.t('alerts.success'), i18n.t('imageEditorJS.save-success') + '\n' + savedPath, [i18n.t('imageEditorJS.btn-ok')]);
            } else {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('imageEditorJS.save-failed'), [i18n.t('imageEditorJS.btn-ok')]);
            }
        } catch (error) {
            console.error('Save error:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('imageEditorJS.save-error') + error.message, [i18n.t('imageEditorJS.btn-ok')]);
        } finally {
            loadingUI.hide();
        }
    });

    // ─── Clear / cleanup ──────────────────────────────────────────────────

    function clearAll() {
        originalImage = null;
        selectedFile = null;
        droppedFilePath = null;
        clearTimeout(pixelDebounceTimer);

        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        exitCropMode();
        resetAdjustmentState();

        selectImageBtn.style.display = 'block';
        selectedFileInfo.style.display = 'none';
        editorWorkspace.style.display = 'none';
        actionButtons.style.display = 'none';
        imageNameEl.textContent = '';
        imageSizeEl.textContent = '';
        canvasDimensionsEl.textContent = '';
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

    // ─── Drag & Drop ──────────────────────────────────────────────────────

    initializeGlobalDragDropForImages({
        onFilesDropped: async (imageFiles) => {
            if (imageFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageEditorJS.drop-one-image'), [i18n.t('imageEditorJS.btn-ok')]);
                return;
            }
            await cleanupDroppedFile();
            const file = imageFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });
            if (result.success) {
                droppedFilePath = result.filePath;
                await loadImageFromPath(result.filePath, file.name, file.size || 0);
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('imageEditorJS.process-drop-failed') + result.error, [i18n.t('imageEditorJS.btn-ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageEditorJS.invalid-files'), [i18n.t('imageEditorJS.btn-ok')]);
        }
    });
});