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

    let originalImage = null;         // The original HTMLImageElement
    let selectedFile = null;          // { name, size }
    let droppedFilePath = null;

    // Transform state (applied to originalImage before pixel edits)
    let rotation90 = 0;              // multiple of 90
    let flipH = false;
    let flipV = false;
    let fineRotation = 0;            // degrees
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
    let textOverlay = null;  // { text, size, color, weight, position, bg }

    // Crop state
    let cropMode = false;
    let cropStart = null;
    let cropEnd = null;
    let isCropDragging = false;
    let cropApplied = false;   // tracks if a crop rect is ready to apply

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

            // Exit crop mode if switching away
            if (btn.dataset.tab !== 'crop' && cropMode) {
                exitCropMode();
            }
        });
    });

    selectImageBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('imageEditorJS.selecting-image'));
        try {
            const files = await window.electronAPI.selectPdfsAndImages();
            if (files && files.length > 0) {
                // Filter to image files
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

                // Store natural size for resize inputs
                resizeW = img.naturalWidth;
                resizeH = img.naturalHeight;
                aspectRatio = img.naturalWidth / img.naturalHeight;

                document.getElementById('resize-width').value = resizeW;
                document.getElementById('resize-height').value = resizeH;

                // Reset all state
                resetAdjustmentState();

                // Show UI
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

    function renderCanvas() {
        if (!originalImage) return;

        // Determine canvas size based on rotation
        const isRotated90 = (rotation90 % 180 !== 0);
        let canvasW = isRotated90 ? resizeH : resizeW;
        let canvasH = isRotated90 ? resizeW : resizeH;

        editorCanvas.width = canvasW;
        editorCanvas.height = canvasH;
        canvasDimensionsEl.textContent = `${canvasW} × ${canvasH} px`;

        ctx.save();
        ctx.clearRect(0, 0, canvasW, canvasH);

        // Apply 90° rotations and flips
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate((rotation90 * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

        // Fine rotation (additional on top of 90° steps)
        ctx.rotate((fineRotation * Math.PI) / 180);

        const drawW = isRotated90 ? resizeH : resizeW;
        const drawH = isRotated90 ? resizeW : resizeH;

        ctx.globalAlpha = opacityAdj / 100;
        ctx.filter = buildCSSFilter();
        ctx.drawImage(originalImage, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Apply pixel-level effects that CSS filter can't handle
        if (activeFilter !== 'none' || saturation !== 0 || sharpness > 0) {
            applyPixelEffects();
        }

        // Draw text overlay on top
        if (textOverlay) {
            drawTextOverlay();
        }
    }

    function buildCSSFilter() {
        const filters = [];

        // brightness: CSS 0-2 mapped from our -100 to 100
        filters.push(`brightness(${1 + brightness / 100})`);

        // contrast: CSS 0-2
        filters.push(`contrast(${1 + contrast / 100})`);

        // blur
        if (blurAmount > 0) filters.push(`blur(${blurAmount * 0.5}px)`);

        // exposure via CSS brightness layered
        if (exposure !== 0) filters.push(`brightness(${1 + exposure / 150})`);

        // Greyscale/sepia/invert for those simple cases
        switch (activeFilter) {
            case 'grayscale': filters.push('grayscale(1)'); break;
            case 'sepia': filters.push('sepia(1)'); break;
            case 'invert': filters.push('invert(1)'); break;
        }

        return filters.join(' ');
    }

    function applyPixelEffects() {
        const imageData = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], b = data[i + 2];

            // Saturation via HSL manipulation
            if (saturation !== 0) {
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const delta = max - min;
                if (delta > 0) {
                    const sat = saturation / 100;
                    if (sat > 0) {
                        r = r + (r - (r + g + b) / 3) * sat;
                        g = g + (g - (r + g + b) / 3) * sat;
                        b = b + (b - (r + g + b) / 3) * sat;
                    } else {
                        const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                        r = r + (grey - r) * (-sat);
                        g = g + (grey - g) * (-sat);
                        b = b + (grey - b) * (-sat);
                    }
                }
            }

            // Named filters (pixel-based)
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
                    // High contrast, desaturated shadows
                    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    r = r * 0.6 + grey * 0.4;
                    g = g * 0.6 + grey * 0.4;
                    b = b * 0.6 + grey * 0.4;
                    // Boost highlights
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

        // Simple sharpness via unsharp mask (lightweight version)
        if (sharpness > 0) {
            applyUnsharpMask(imageData, sharpness);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    function applyUnsharpMask(imageData, amount) {
        // Very simplified: enhance edges by comparing to a blurred version
        // Using a basic 3x3 kernel
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
                    // Average of 4 cardinal neighbors
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

    function drawTextOverlay() {
        if (!textOverlay || !textOverlay.text.trim()) return;

        const { text, size, color, weight, position, bg } = textOverlay;
        const cw = editorCanvas.width;
        const ch = editorCanvas.height;

        ctx.save();
        ctx.font = `${weight} ${size}px system-ui, sans-serif`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Compute position
        const padding = size * 0.6;
        const lines = text.split('\n');
        const lineH = size * 1.3;
        const totalH = lines.length * lineH;
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));

        let x, y;
        const [vPos, hPos] = position.split('-');

        if (hPos === 'left' || position === 'middle-left') {
            ctx.textAlign = 'left';
            x = padding;
        } else if (hPos === 'right' || position === 'middle-right') {
            ctx.textAlign = 'right';
            x = cw - padding;
        } else {
            ctx.textAlign = 'center';
            x = cw / 2;
        }

        if (vPos === 'top') {
            y = padding + totalH / 2;
        } else if (vPos === 'bottom') {
            y = ch - padding - totalH / 2;
        } else {
            y = ch / 2 - totalH / 2 + lineH / 2;
        }

        // Draw background box
        if (bg) {
            const boxPadX = size * 0.4;
            const boxPadY = size * 0.25;
            let boxX;
            if (ctx.textAlign === 'left') boxX = x - boxPadX;
            else if (ctx.textAlign === 'right') boxX = x - maxW - boxPadX;
            else boxX = x - maxW / 2 - boxPadX;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            roundRect(ctx, boxX, y - totalH / 2 - boxPadY, maxW + boxPadX * 2, totalH + boxPadY * 2, 6);
            ctx.fill();
            ctx.fillStyle = color;
        }

        // Draw each line
        lines.forEach((line, i) => {
            ctx.fillText(line, x, y + i * lineH);
        });

        ctx.restore();
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // ─── Adjustments ─────────────────────────────────────────────────────
    function bindSlider(id, stateKey, displayId, suffix = '', onUpdate = null) {
        const slider = document.getElementById(id);
        const display = document.getElementById(displayId);
        slider.addEventListener('input', () => {
            const val = parseInt(slider.value);
            // Update the correct state variable
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
            if (onUpdate) onUpdate(val);
            renderCanvas();
        });
    }

    bindSlider('brightness', 'brightness', 'brightness-value');
    bindSlider('contrast', 'contrast', 'contrast-value');
    bindSlider('saturation', 'saturation', 'saturation-value');
    bindSlider('exposure', 'exposure', 'exposure-value');
    bindSlider('sharpness', 'sharpness', 'sharpness-value');
    bindSlider('blur', 'blur', 'blur-value');
    bindSlider('opacity-adj', 'opacity', 'opacity-value', '%');
    bindSlider('fine-rotation', 'fineRotation', 'fine-rotation-value', '°');

    document.getElementById('rotate-cw').addEventListener('click', () => {
        rotation90 = (rotation90 + 90) % 360;
        // Swap resize dimensions
        [resizeW, resizeH] = [resizeH, resizeW];
        document.getElementById('resize-width').value = resizeW;
        document.getElementById('resize-height').value = resizeH;
        renderCanvas();
    });

    document.getElementById('rotate-ccw').addEventListener('click', () => {
        rotation90 = (rotation90 - 90 + 360) % 360;
        [resizeW, resizeH] = [resizeH, resizeW];
        document.getElementById('resize-width').value = resizeW;
        document.getElementById('resize-height').value = resizeH;
        renderCanvas();
    });

    document.getElementById('flip-h').addEventListener('click', () => {
        flipH = !flipH;
        renderCanvas();
    });

    document.getElementById('flip-v').addEventListener('click', () => {
        flipV = !flipV;
        renderCanvas();
    });

    // Resize with aspect ratio lock
    const lockAspect = document.getElementById('lock-aspect');
    const rwInput = document.getElementById('resize-width');
    const rhInput = document.getElementById('resize-height');

    rwInput.addEventListener('input', () => {
        const w = parseInt(rwInput.value);
        if (!w || w < 1) return;
        resizeW = w;
        if (lockAspect.checked) {
            resizeH = Math.round(w / aspectRatio);
            rhInput.value = resizeH;
        }
    });

    rhInput.addEventListener('input', () => {
        const h = parseInt(rhInput.value);
        if (!h || h < 1) return;
        resizeH = h;
        if (lockAspect.checked) {
            resizeW = Math.round(h * aspectRatio);
            rwInput.value = resizeW;
        }
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
        renderCanvas();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderCanvas();
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
        renderCanvas();
    });

    document.getElementById('clear-text').addEventListener('click', () => {
        textOverlay = null;
        renderCanvas();
    });

    document.getElementById('start-crop').addEventListener('click', () => {
        enterCropMode();
    });

    document.getElementById('apply-crop').addEventListener('click', () => {
        applyCrop();
    });

    document.getElementById('cancel-crop').addEventListener('click', () => {
        exitCropMode();
    });

    function enterCropMode() {
        cropMode = true;
        cropStart = null;
        cropEnd = null;
        cropApplied = false;
        isCropDragging = false;

        // Size the overlay canvas to match the displayed canvas
        const rect = editorCanvas.getBoundingClientRect();
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
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    function getConstrainedCropEnd(start, end) {
        const ratioStr = document.getElementById('crop-ratio').value;
        if (ratioStr === 'free') return end;

        const [rw, rh] = ratioStr.split(':').map(Number);
        const ratio = rw / rh;
        let w = end.x - start.x;
        let h = end.y - start.y;
        const signX = w < 0 ? -1 : 1;
        const signY = h < 0 ? -1 : 1;
        w = Math.abs(w);
        h = Math.abs(h);
        if (w / h > ratio) {
            h = w / ratio;
        } else {
            w = h * ratio;
        }
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

        const x = Math.round(Math.min(cropStart.x, cropEnd.x));
        const y = Math.round(Math.min(cropStart.y, cropEnd.y));
        const w = Math.round(Math.abs(cropEnd.x - cropStart.x));
        const h = Math.round(Math.abs(cropEnd.y - cropStart.y));

        if (w > 5 && h > 5) {
            cropApplied = true;
            document.getElementById('apply-crop').disabled = false;
            document.getElementById('crop-coords').style.display = 'block';
            document.getElementById('crop-info').textContent = `x:${x} y:${y}  ${w} × ${h} px`;
        }
    }

    function drawCropOverlay() {
        if (!cropStart || !cropEnd) return;
        const cw = cropOverlayCanvas.width;
        const ch = cropOverlayCanvas.height;

        const x = Math.min(cropStart.x, cropEnd.x);
        const y = Math.min(cropStart.y, cropEnd.y);
        const w = Math.abs(cropEnd.x - cropStart.x);
        const h = Math.abs(cropEnd.y - cropStart.y);

        cropCtx.clearRect(0, 0, cw, ch);

        // Dark overlay outside crop area
        cropCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        cropCtx.fillRect(0, 0, cw, ch);
        cropCtx.clearRect(x, y, w, h);

        // Bright border around crop
        cropCtx.strokeStyle = '#3498db';
        cropCtx.lineWidth = 2;
        cropCtx.strokeRect(x, y, w, h);

        // Rule of thirds grid
        cropCtx.strokeStyle = 'rgba(52, 152, 219, 0.4)';
        cropCtx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
            cropCtx.beginPath();
            cropCtx.moveTo(x + (w / 3) * i, y);
            cropCtx.lineTo(x + (w / 3) * i, y + h);
            cropCtx.stroke();
            cropCtx.beginPath();
            cropCtx.moveTo(x, y + (h / 3) * i);
            cropCtx.lineTo(x + w, y + (h / 3) * i);
            cropCtx.stroke();
        }

        // Corner handles
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

        // Extract cropped pixels from the current rendered canvas
        const croppedData = ctx.getImageData(x, y, w, h);

        // Create a new temp canvas, draw the crop onto it, then make it the new original
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCanvas.getContext('2d').putImageData(croppedData, 0, 0);

        // Replace originalImage with cropped result
        const newImg = new Image();
        newImg.onload = () => {
            originalImage = newImg;
            resizeW = w;
            resizeH = h;
            aspectRatio = w / h;
            rotation90 = 0;
            flipH = false;
            flipV = false;
            fineRotation = 0;
            document.getElementById('resize-width').value = w;
            document.getElementById('resize-height').value = h;
            document.getElementById('fine-rotation').value = 0;
            document.getElementById('fine-rotation-value').textContent = '0°';
            exitCropMode();
            // Reset adjustments since they're baked in now
            resetAdjustmentState();
            renderCanvas();
        };
        newImg.src = tempCanvas.toDataURL('image/png');
    }

    resetBtn.addEventListener('click', async () => {
        const result = await customAlert.alert(i18n.t('alerts.warning'), i18n.t('imageEditorJS.reset-confirm-msg'), [i18n.t('imageEditorJS.btn-cancel'), i18n.t('imageEditorJS.btn-reset')]);
        if (result === 1) {
            rotation90 = 0;
            flipH = false;
            flipV = false;
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
        brightness = 0;
        contrast = 0;
        saturation = 0;
        exposure = 0;
        sharpness = 0;
        blurAmount = 0;
        opacityAdj = 100;
        fineRotation = 0;
        activeFilter = 'none';
        textOverlay = null;

        // Reset slider UI
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

    saveBtn.addEventListener('click', async () => {
        if (!originalImage || !selectedFile) return;

        const format = saveFormat.value;
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
        const quality = format === 'image/jpeg' ? 0.92 : undefined;

        loadingUI.show(i18n.t('imageEditorJS.saving-image'));
        try {
            const dataUrl = editorCanvas.toDataURL(format, quality);
            const base64 = dataUrl.split(',')[1];
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

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

    function clearAll() {
        originalImage = null;
        selectedFile = null;
        droppedFilePath = null;

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

    initializeGlobalDragDropForImages({
        onFilesDropped: async (imageFiles) => {
            if (imageFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageEditorJS.drop-one-image'), [i18n.t('imageEditorJS.btn-ok')]);
                return;
            }

            await cleanupDroppedFile();

            const file = imageFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({
                name: file.name,
                buffer: buffer
            });

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