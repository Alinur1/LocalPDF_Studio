/**
 * LocalPDF Studio - Offline Image Toolkit
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
 * - Frontend: Electron + HTML/CSS/JS (Pure Frontend, No Backend)
 * - Image Processing: Canvas API + Filters
**/

import { initializeGlobalDragDropForImages } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from "../../utils/themeManager.js";

class ImageResizer {
    constructor() {
        this.selectedImages = [];
        this.currentImageIndex = 0;
        this.processedImages = [];
        this.transformations = {
            rotation: 0,
            flipH: false,
            flipV: false,
        };
        this.enhancements = {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0,
        };
        this.filters = {
            grayscale: false,
            sepia: false,
            blur: false,
            sharpen: false,
        };
        this.presets = JSON.parse(localStorage.getItem('imageResizePresets') || '{}');
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.loadPresets();
    }

    setupTheme() {
        ThemeManager.init();
    }

    setupEventListeners() {
        // FIX: Use the persistent hidden file input in the DOM instead of dynamically
        //      creating one each click — avoids popup-blocker issues in Electron.
        const selectBtn = document.getElementById('select-images-btn');
        const fileInput = document.getElementById('file-input');

        selectBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag & Drop — use global drag-drop handler for consistent behavior
        initializeGlobalDragDropForImages({
            onFilesDropped: (files) => this.addImages(files),
            onInvalidFiles: () => this.showModal('Error', 'Please select valid image files (JPEG, PNG, BMP, TIFF, WebP).')
        });

        // File Removal
        document.getElementById('remove-files-btn').addEventListener('click', () => this.clearSelectedFiles());

        // Preview Tabs
        // FIX: Pass the tab and the button element explicitly instead of relying on
        //      the deprecated global `window.event` object used in switchPreviewTab().
        document.querySelectorAll('.preview-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchPreviewTab(e.currentTarget.dataset.tab, e.currentTarget));
        });

        // Comparison Slider
        const comparisonRange = document.querySelector('.comparison-range');
        if (comparisonRange) {
            comparisonRange.addEventListener('input', (e) => this.updateComparisonSlider(e));
        }

        // Resize Mode — also toggle unit labels between px and %
        document.querySelectorAll('input[name="resize-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateUnitLabels();
                this.updatePreview();
            });
        });

        // Width & Height
        const widthInput = document.getElementById('resize-width');
        const heightInput = document.getElementById('resize-height');
        const lockAspectCheckbox = document.getElementById('lock-aspect-ratio');

        widthInput.addEventListener('input', () => {
            if (lockAspectCheckbox.checked) this.updateHeightFromWidth();
            this.updatePreview();
        });

        heightInput.addEventListener('input', () => {
            if (lockAspectCheckbox.checked) this.updateWidthFromHeight();
            this.updatePreview();
        });

        lockAspectCheckbox.addEventListener('change', () => this.updatePreview());

        // Aspect Ratio Presets
        // FIX: Pass the clicked button element explicitly to avoid `event` global.
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyAspectRatio(e.currentTarget.dataset.ratio, 'aspect', e.currentTarget));
        });

        // Aspect Ratio Handling
        document.querySelectorAll('input[name="aspect-mode"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });

        // Padding color sync
        const paddingColor = document.getElementById('padding-color');
        const paddingColorHex = document.getElementById('padding-color-hex');
        paddingColor.addEventListener('input', () => {
            paddingColorHex.value = paddingColor.value;
            this.updatePreview();
        });
        paddingColorHex.addEventListener('change', () => {
            // Validate hex before applying
            if (/^#[0-9a-fA-F]{6}$/.test(paddingColorHex.value)) {
                paddingColor.value = paddingColorHex.value;
                this.updatePreview();
            }
        });

        // Transformations — rotation buttons now set absolute rotation directly (reset/+90/+180/+270)
        // FIX: applyRotation now receives the target button so it doesn't rely on global event.
        document.querySelectorAll('.transform-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyRotation(e.currentTarget.dataset.rotation, e.currentTarget));
        });

        document.querySelectorAll('.flip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFlip(e.currentTarget.dataset.flip, e.currentTarget));
        });

        // Crop Mode
        document.querySelectorAll('input[name="crop-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('crop-presets').style.display = e.target.value === 'preset' ? 'block' : 'none';
                this.updatePreview();
            });
        });

        // Image Enhancement sliders
        const sliderMap = [
            { id: 'brightness-slider', valId: 'brightness-value', key: 'brightness', suffix: '%' },
            { id: 'contrast-slider',   valId: 'contrast-value',   key: 'contrast',   suffix: '%' },
            { id: 'saturation-slider', valId: 'saturation-value', key: 'saturation', suffix: '%' },
            { id: 'hue-slider',        valId: 'hue-value',        key: 'hue',        suffix: '°' },
        ];

        sliderMap.forEach(({ id, valId, key }) => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                this.enhancements[key] = parseInt(el.value);
                document.getElementById(valId).textContent = el.value;
                this.updatePreview();
            });
        });

        document.getElementById('auto-enhance-btn').addEventListener('click', () => this.autoEnhance());

        // Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilter(e.currentTarget.dataset.filter, e.currentTarget));
        });

        // Output format — hide quality slider for lossless formats
        document.getElementById('output-format').addEventListener('change', () => {
            this.toggleQualitySlider();
            this.updatePreview();
        });

        // Quality slider
        document.getElementById('quality-slider').addEventListener('input', (e) => {
            document.getElementById('quality-value').textContent = e.target.value;
            this.updatePreview();
        });

        // Watermark toggle
        const enableWatermarkCheckbox = document.getElementById('enable-watermark');
        enableWatermarkCheckbox.addEventListener('change', () => {
            document.getElementById('watermark-options').style.display =
                enableWatermarkCheckbox.checked ? 'block' : 'none';
            this.updatePreview();
        });

        document.querySelectorAll('input[name="watermark-type"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });

        document.getElementById('watermark-text').addEventListener('input', () => this.updatePreview());
        document.getElementById('watermark-font-size').addEventListener('input', () => this.updatePreview());
        document.getElementById('watermark-opacity').addEventListener('input', (e) => {
            document.getElementById('watermark-opacity-value').textContent = e.target.value;
            this.updatePreview();
        });

        // Watermark position buttons
        document.querySelectorAll('.position-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updatePreview();
            });
        });

        // Smart Compression
        const smartCompressionCheckbox = document.getElementById('smart-compression');
        smartCompressionCheckbox.addEventListener('change', () => {
            document.getElementById('target-size-group').style.display =
                smartCompressionCheckbox.checked ? 'block' : 'none';
        });

        // Process & Reset
        document.getElementById('process-btn').addEventListener('click', () => this.processAllImages());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetAllSettings());

        // Download All
        document.getElementById('download-all-btn').addEventListener('click', () => this.downloadAllAsZip());

        // Accordion
        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => this.toggleAccordion(header));
        });

        // Preset Management
        document.getElementById('save-preset-btn').addEventListener('click', () => this.savePreset());

        document.querySelectorAll('.quick-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyQuickPreset(e.currentTarget.dataset.preset));
        });

        document.querySelectorAll('.social-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applySocialPreset(e.currentTarget.dataset.preset));
        });

        // Modal Close — also close on overlay click and keyboard Escape
        document.getElementById('modal-close-btn').addEventListener('click', () => this.hideModal());
        document.querySelector('.close-btn').addEventListener('click', () => this.hideModal());
        document.querySelector('.close-btn').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') this.hideModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideModal();
        });
    }

    // ─── Unit label helper ───────────────────────────────────────────────────

    updateUnitLabels() {
        const mode = document.querySelector('input[name="resize-mode"]:checked')?.value;
        const unit = mode === 'percentage' ? '%' : 'px';
        document.getElementById('resize-width-unit').textContent = unit;
        document.getElementById('resize-height-unit').textContent = unit;
    }

    // ─── Quality slider visibility ───────────────────────────────────────────

    toggleQualitySlider() {
        const format = document.getElementById('output-format').value;
        // PNG and BMP are lossless — quality setting has no effect
        const lossless = format === 'png' || format === 'bmp';
        document.getElementById('quality-group').style.display = lossless ? 'none' : 'block';
    }

    // ─── File Handling ───────────────────────────────────────────────────────

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        // FIX: Reset input so the same file can be re-selected after removal
        event.target.value = '';
        this.addImages(files);
    }



    addImages(files) {
        const validFiles = files.filter(f => f.type.startsWith('image/'));
        if (validFiles.length === 0) {
            this.showModal('Error', 'Please select valid image files (JPEG, PNG, BMP, TIFF, WebP).');
            return;
        }

        // FIX: Track how many readers have completed so UI only updates once all
        //      files are loaded, preventing partial renders for large batches.
        let completed = 0;
        const total = validFiles.length;

        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.selectedImages.push({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: e.target.result,
                });
                completed++;
                if (completed === total) {
                    this.updateUI();
                }
            };
            reader.onerror = () => {
                completed++;
                console.error(`Failed to read file: ${file.name}`);
                if (completed === total) {
                    this.updateUI();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    clearSelectedFiles() {
        this.selectedImages = [];
        this.processedImages = [];
        this.currentImageIndex = 0;
        this.updateUI();

        // Show the editor panels again if results were showing
        const fileArea = document.getElementById('file-selection-area');
        const optionsPanel = document.getElementById('options-panel');
        const resultsSection = document.getElementById('results-section');
        fileArea.style.display = '';
        if (optionsPanel) optionsPanel.style.display = '';
        resultsSection.style.display = 'none';
    }

    updateUI() {
        const filesCountEl = document.getElementById('files-count');
        const filesSizeEl = document.getElementById('files-size');
        const selectedFilesInfo = document.getElementById('selected-files-info');
        const previewSection = document.getElementById('preview-section');
        const imagesList = document.getElementById('images-list');

        if (this.selectedImages.length > 0) {
            const totalSize = (this.selectedImages.reduce((sum, img) => sum + img.size, 0) / 1024 / 1024).toFixed(2);
            filesCountEl.textContent = `${this.selectedImages.length} image${this.selectedImages.length > 1 ? 's' : ''} selected`;
            filesSizeEl.textContent = `Total: ${totalSize} MB`;
            selectedFilesInfo.style.display = 'flex';
            previewSection.style.display = 'flex';
            imagesList.style.display = this.selectedImages.length > 1 ? 'block' : 'none';

            this.renderImagesList();
            this.loadImageForPreview(this.currentImageIndex);
        } else {
            selectedFilesInfo.style.display = 'none';
            previewSection.style.display = 'none';
            imagesList.style.display = 'none';
        }
    }

    renderImagesList() {
        const imagesGrid = document.getElementById('images-grid');
        imagesGrid.innerHTML = '';

        this.selectedImages.forEach((img, index) => {
            const div = document.createElement('div');
            div.className = 'image-item' + (index === this.currentImageIndex ? ' active' : '');
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-label', `Select image ${img.name}`);

            const imgEl = document.createElement('img');
            imgEl.src = img.data;
            imgEl.alt = img.name;

            const overlay = document.createElement('div');
            overlay.className = 'image-item-overlay';
            overlay.textContent = '👁️';

            div.appendChild(imgEl);
            div.appendChild(overlay);
            div.addEventListener('click', () => this.selectImage(index));
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') this.selectImage(index);
            });
            imagesGrid.appendChild(div);
        });
    }

    selectImage(index) {
        this.currentImageIndex = index;
        this.renderImagesList();
        this.loadImageForPreview(index);
    }

    // FIX: Wrap image loading in a Promise helper for clean async/await usage
    loadImageElement(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src.substring(0, 60)}...`));
            img.src = src;
        });
    }

    async loadImageForPreview(index) {
        if (index >= this.selectedImages.length) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[index].data);
            this.drawBeforePreview(img);
            this.updatePreview();
        } catch (err) {
            console.error(err);
        }
    }

    // ─── Preview ─────────────────────────────────────────────────────────────

    drawBeforePreview(img) {
        const canvas = document.getElementById('canvas-before');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const { width, height } = this.scaleToFit(img.width, img.height, 400, 400);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        document.getElementById('original-size').textContent = `${img.width}×${img.height}px`;

        // Mirror to comparison before-canvas
        const canvasCompareBefore = document.getElementById('canvas-compare-before');
        const ctxCompare = canvasCompareBefore.getContext('2d');
        canvasCompareBefore.width = width;
        canvasCompareBefore.height = height;
        ctxCompare.drawImage(img, 0, 0, width, height);
    }

    /** Scale dimensions down to fit within maxW×maxH while preserving aspect ratio */
    scaleToFit(w, h, maxW, maxH) {
        if (w <= maxW && h <= maxH) return { width: w, height: h };
        const ratio = Math.min(maxW / w, maxH / h);
        return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
    }

    async updatePreview() {
        if (this.selectedImages.length === 0) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[this.currentImageIndex].data);
            const processedCanvas = this.createProcessedImage(img);
            this.drawAfterPreview(processedCanvas);
            this.drawComparisonAfter(processedCanvas);
        } catch (err) {
            console.error('Preview update failed:', err);
        }
    }

    createProcessedImage(img) {
        const resizeMode = document.querySelector('input[name="resize-mode"]:checked').value;
        const aspectMode = document.querySelector('input[name="aspect-mode"]:checked').value;
        const lockAspect = document.getElementById('lock-aspect-ratio').checked;

        let width = parseInt(document.getElementById('resize-width').value) || img.width;
        let height = parseInt(document.getElementById('resize-height').value) || img.height;

        // In percentage mode the inputs represent %, convert to px
        if (resizeMode === 'percentage') {
            width = Math.max(1, Math.round(img.width * (width / 100)));
            height = Math.max(1, Math.round(img.height * (height / 100)));
        }

        // Effective source dimensions after rotation (swap for 90/270)
        const swapped = this.transformations.rotation === 90 || this.transformations.rotation === 270;
        const srcW = swapped ? img.height : img.width;
        const srcH = swapped ? img.width : img.height;

        // Apply aspect ratio lock for fixed px mode
        if (lockAspect && (resizeMode === 'fixed' || resizeMode === 'fitcontain' || resizeMode === 'cover')) {
            const srcAspect = srcW / srcH;
            const tgtAspect = width / height;
            if (srcAspect > tgtAspect) {
                height = Math.max(1, Math.round(width / srcAspect));
            } else {
                width = Math.max(1, Math.round(height * srcAspect));
            }
        }

        document.getElementById('new-size').textContent = `${width}×${height}px`;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let targetWidth = width;
        let targetHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        const paddingColor = document.getElementById('padding-color').value;

        if (aspectMode === 'contain') {
            // Scale image to fit inside target dimensions, pad the rest
            const scale = Math.min(width / srcW, height / srcH);
            targetWidth = Math.round(srcW * scale);
            targetHeight = Math.round(srcH * scale);
            offsetX = Math.round((width - targetWidth) / 2);
            offsetY = Math.round((height - targetHeight) / 2);
            canvas.width = width;
            canvas.height = height;
            ctx.fillStyle = paddingColor;
            ctx.fillRect(0, 0, width, height);
        } else if (aspectMode === 'cover') {
            // Scale image to cover target dimensions, crop overflow
            const scale = Math.max(width / srcW, height / srcH);
            targetWidth = Math.round(srcW * scale);
            targetHeight = Math.round(srcH * scale);
            offsetX = Math.round((width - targetWidth) / 2);
            offsetY = Math.round((height - targetHeight) / 2);
            canvas.width = width;
            canvas.height = height;
        } else {
            // stretch — fill exactly
            canvas.width = width;
            canvas.height = height;
        }

        this.drawImageWithTransforms(ctx, img, offsetX, offsetY, targetWidth, targetHeight);
        return canvas;
    }

    drawImageWithTransforms(ctx, img, offsetX, offsetY, drawW, drawH) {
        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        const rot = this.transformations.rotation;

        ctx.save();

        // Move to centre of canvas for rotation pivot
        ctx.translate(canvasW / 2, canvasH / 2);

        if (rot !== 0) {
            ctx.rotate((rot * Math.PI) / 180);
        }

        // FIX: Scale was applied AFTER translation without resetting origin back,
        //      causing the flip to mirror around the canvas corner instead of
        //      the image centre. Now both axes are applied to the same transform.
        const scaleX = this.transformations.flipH ? -1 : 1;
        const scaleY = this.transformations.flipV ? -1 : 1;
        ctx.scale(scaleX, scaleY);

        // Draw centred (origin is now the canvas centre)
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        // Apply pixel-level enhancements (brightness, contrast, saturation, hue)
        this.applyEnhancementsToContext(ctx, canvasW, canvasH);

        // Watermark
        if (document.getElementById('enable-watermark').checked) {
            this.drawWatermark(ctx, canvasW, canvasH);
        }
    }

    applyEnhancementsToContext(ctx, canvasWidth, canvasHeight) {
        const needsProcessing =
            this.enhancements.brightness !== 100 ||
            this.enhancements.contrast   !== 100 ||
            this.enhancements.saturation !== 100 ||
            this.enhancements.hue        !== 0   ||
            this.filters.grayscale ||
            this.filters.sepia     ||
            this.filters.blur      ||
            this.filters.sharpen;

        if (!needsProcessing) return;

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;

        const brightness = this.enhancements.brightness / 100;
        const contrast   = (this.enhancements.contrast - 100) / 100;
        const saturation = this.enhancements.saturation / 100;
        const hue        = this.enhancements.hue;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Brightness
            r *= brightness;
            g *= brightness;
            b *= brightness;

            // Contrast — adjust around midpoint (128)
            r = (r - 128) * (1 + contrast) + 128;
            g = (g - 128) * (1 + contrast) + 128;
            b = (b - 128) * (1 + contrast) + 128;

            // Saturation
            if (saturation !== 1) {
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                r = gray + (r - gray) * saturation;
                g = gray + (g - gray) * saturation;
                b = gray + (b - gray) * saturation;
            }

            // Hue rotation
            if (hue !== 0) {
                [r, g, b] = this.applyHueRotation(r, g, b, hue);
            }

            data[i]     = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }

        ctx.putImageData(imageData, 0, 0);

        // Pixel-kernel filters operate on the already-enhanced image
        if (this.filters.grayscale) this.applyGrayscale(ctx, canvasWidth, canvasHeight);
        if (this.filters.sepia)     this.applySepia(ctx, canvasWidth, canvasHeight);
        if (this.filters.blur)      this.applyBlur(ctx, canvasWidth, canvasHeight);
        if (this.filters.sharpen)   this.applySharpen(ctx, canvasWidth, canvasHeight);
    }

    // ─── Hue helper (inline with main loop for performance) ──────────────────

    applyHueRotation(r, g, b, hueDeg) {
        const [h, s, l] = this.rgbToHsl(r, g, b);
        return this.hslToRgb((h + hueDeg) % 360, s, l);
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [h * 360, s * 100, l * 100];
    }

    hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // ─── Filter implementations ───────────────────────────────────────────────

    applyGrayscale(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    applySepia(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            data[i]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
        ctx.putImageData(imageData, 0, 0);
    }

    applyBlur(ctx, width, height) {
        const radius = 2;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const newData = new Uint8ClampedArray(data);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, count = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const ny = Math.min(Math.max(y + dy, 0), height - 1);
                        const nx = Math.min(Math.max(x + dx, 0), width - 1);
                        const idx = (ny * width + nx) * 4;
                        r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
                        count++;
                    }
                }
                const idx = (y * width + x) * 4;
                newData[idx]     = r / count;
                newData[idx + 1] = g / count;
                newData[idx + 2] = b / count;
            }
        }
        ctx.putImageData(new ImageData(newData, width, height), 0, 0);
    }

    applySharpen(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const newData = new Uint8ClampedArray(data);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let r = 0, g = 0, b = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const kIdx = (ky + 1) * 3 + (kx + 1);
                        r += data[idx]     * kernel[kIdx];
                        g += data[idx + 1] * kernel[kIdx];
                        b += data[idx + 2] * kernel[kIdx];
                    }
                }
                const idx = (y * width + x) * 4;
                newData[idx]     = Math.min(255, Math.max(0, r));
                newData[idx + 1] = Math.min(255, Math.max(0, g));
                newData[idx + 2] = Math.min(255, Math.max(0, b));
            }
        }
        ctx.putImageData(new ImageData(newData, width, height), 0, 0);
    }

    // ─── After / comparison preview drawing ──────────────────────────────────

    drawAfterPreview(canvas) {
        const canvasAfter = document.getElementById('canvas-after');
        const ctxAfter = canvasAfter.getContext('2d');
        // FIX: Scale processed canvas down to preview max so it doesn't overflow the panel
        const { width, height } = this.scaleToFit(canvas.width, canvas.height, 400, 400);
        canvasAfter.width = width;
        canvasAfter.height = height;
        ctxAfter.drawImage(canvas, 0, 0, width, height);
    }

    drawComparisonAfter(canvas) {
        const canvasCompareAfter = document.getElementById('canvas-compare-after');
        const ctxCompareAfter = canvasCompareAfter.getContext('2d');
        const { width, height } = this.scaleToFit(canvas.width, canvas.height, 400, 400);
        canvasCompareAfter.width = width;
        canvasCompareAfter.height = height;
        ctxCompareAfter.drawImage(canvas, 0, 0, width, height);

        // Estimate output file size
        const outputFormat = document.getElementById('output-format').value;
        const quality = parseInt(document.getElementById('quality-slider').value) / 100;
        const mime = this.getMimeType(outputFormat);
        const dataUrl = canvas.toDataURL(mime, quality);
        // base64 → bytes: length * 0.75 accounts for base64 overhead
        const fileSize = Math.round((dataUrl.length * 0.75) / 1024);
        document.getElementById('file-size-info').textContent = `~${fileSize} KB`;

        const originalSizeKB = this.selectedImages[this.currentImageIndex].size / 1024;
        const reduction = Math.round(((originalSizeKB - fileSize) / originalSizeKB) * 100);
        const reductionEl = document.getElementById('reduction-info');
        reductionEl.textContent = `${reduction > 0 ? '-' : '+'}${Math.abs(reduction)}%`;
        reductionEl.style.color = reduction > 0 ? '#2ecc71' : '#e74c3c';
    }

    // ─── Preview tab switching ────────────────────────────────────────────────

    // FIX: Accept button element explicitly instead of reading deprecated window.event
    switchPreviewTab(tab, buttonEl) {
        document.querySelectorAll('.preview-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        buttonEl.classList.add('active');
        buttonEl.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.preview-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('preview-' + tab).classList.add('active');
    }

    updateComparisonSlider(e) {
        const percentage = e.target.value / 100;
        const beforeImg = document.querySelector('.comparison-img.before');
        const afterImg  = document.querySelector('.comparison-img.after');
        // FIX: Adjust widths so the two panels always sum to 100% with no gap
        beforeImg.style.width = ((1 - percentage) * 100) + '%';
        afterImg.style.width  = (percentage * 100) + '%';
    }

    // ─── Dimension helpers ────────────────────────────────────────────────────

    async updateHeightFromWidth() {
        if (this.selectedImages.length === 0) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[this.currentImageIndex].data);
            const w = parseInt(document.getElementById('resize-width').value) || 1;
            const h = Math.max(1, Math.round((w * img.height) / img.width));
            document.getElementById('resize-height').value = h;
        } catch (err) { console.error(err); }
    }

    async updateWidthFromHeight() {
        if (this.selectedImages.length === 0) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[this.currentImageIndex].data);
            const h = parseInt(document.getElementById('resize-height').value) || 1;
            const w = Math.max(1, Math.round((h * img.width) / img.height));
            document.getElementById('resize-width').value = w;
        } catch (err) { console.error(err); }
    }

    // FIX: Accept clicked button element to avoid relying on window.event
    applyAspectRatio(ratio, type, buttonEl) {
        const [w, h] = ratio.split(':').map(Number);
        const currentWidth = parseInt(document.getElementById('resize-width').value) || 800;
        const newHeight = Math.max(1, Math.round((currentWidth * h) / w));
        document.getElementById('resize-height').value = newHeight;
        this.updatePreview();

        if (type === 'aspect') {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            buttonEl.classList.add('active');
        }
    }

    // ─── Rotation ────────────────────────────────────────────────────────────

    // FIX: The rotation buttons in HTML now use data-rotation as an ABSOLUTE target
    //      angle (0 = reset, 90 = quarter turn, 180 = half, 270 = three-quarter).
    //      Clicking a button sets transformations.rotation to that value directly,
    //      which is simpler, deterministic, and avoids double-accumulation bugs.
    applyRotation(angleDeg, buttonEl) {
        const angle = parseInt(angleDeg);
        this.transformations.rotation = angle;

        document.querySelectorAll('.transform-btn').forEach(b => b.classList.remove('active'));
        buttonEl.classList.add('active');

        this.updatePreview();
    }

    // ─── Flip ────────────────────────────────────────────────────────────────

    applyFlip(direction, buttonEl) {
        if (direction === 'horizontal') {
            this.transformations.flipH = !this.transformations.flipH;
        } else {
            this.transformations.flipV = !this.transformations.flipV;
        }
        buttonEl.classList.toggle('active',
            direction === 'horizontal' ? this.transformations.flipH : this.transformations.flipV
        );
        this.updatePreview();
    }

    // ─── Filters ─────────────────────────────────────────────────────────────

    // FIX: Accept button element explicitly
    toggleFilter(filterName, buttonEl) {
        this.filters[filterName] = !this.filters[filterName];
        buttonEl.classList.toggle('active', this.filters[filterName]);
        this.updatePreview();
    }

    autoEnhance() {
        this.enhancements = { brightness: 105, contrast: 115, saturation: 110, hue: 0 };

        document.getElementById('brightness-slider').value = 105;
        document.getElementById('brightness-value').textContent = '105';
        document.getElementById('contrast-slider').value = 115;
        document.getElementById('contrast-value').textContent = '115';
        document.getElementById('saturation-slider').value = 110;
        document.getElementById('saturation-value').textContent = '110';
        document.getElementById('hue-slider').value = 0;
        document.getElementById('hue-value').textContent = '0';

        this.updatePreview();
    }

    // ─── Watermark ────────────────────────────────────────────────────────────

    drawWatermark(ctx, canvasWidth, canvasHeight) {
        const watermarkType = document.querySelector('input[name="watermark-type"]:checked').value;
        const activePos = document.querySelector('.position-btn.active');
        const position = activePos ? activePos.dataset.position : 'center';
        const opacity = parseInt(document.getElementById('watermark-opacity').value) / 100;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (watermarkType === 'text') {
            const text = document.getElementById('watermark-text').value || '© Watermark';
            const fontSize = Math.max(8, parseInt(document.getElementById('watermark-font-size').value) || 24);

            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = Math.max(1, fontSize / 10);
            ctx.textBaseline = 'middle';

            const metrics = ctx.measureText(text);
            const tw = metrics.width;
            const pad = fontSize * 0.5;
            let x, y;

            switch (position) {
                case 'top-left':      x = pad;                          y = fontSize / 2 + pad; break;
                case 'top-center':    x = canvasWidth / 2 - tw / 2;    y = fontSize / 2 + pad; break;
                case 'top-right':     x = canvasWidth - tw - pad;       y = fontSize / 2 + pad; break;
                case 'left':          x = pad;                          y = canvasHeight / 2;   break;
                case 'right':         x = canvasWidth - tw - pad;       y = canvasHeight / 2;   break;
                case 'bottom-left':   x = pad;                          y = canvasHeight - fontSize / 2 - pad; break;
                case 'bottom-center': x = canvasWidth / 2 - tw / 2;    y = canvasHeight - fontSize / 2 - pad; break;
                case 'bottom-right':  x = canvasWidth - tw - pad;       y = canvasHeight - fontSize / 2 - pad; break;
                default:              x = canvasWidth / 2 - tw / 2;    y = canvasHeight / 2;   break;
            }

            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }

        ctx.restore();
    }

    // ─── Batch Processing ─────────────────────────────────────────────────────

    async processAllImages() {
        if (this.selectedImages.length === 0) {
            this.showModal('Error', 'Please select images first.');
            return;
        }

        this.showLoadingModal('Processing...');
        this.processedImages = [];

        const outputFormat = document.getElementById('output-format').value;
        const quality = parseInt(document.getElementById('quality-slider').value) / 100;
        const mime = this.getMimeType(outputFormat);

        try {
            // FIX: Use Promise.all + async image loading to avoid the original
            //      for-loop + onload callback race condition where the counter check
            //      fires inside nested async callbacks causing unpredictable ordering
            //      and potential double-triggers on the last image.
            const results = await Promise.all(
                this.selectedImages.map(async (imgRecord, i) => {
                    const img = await this.loadImageElement(imgRecord.data);
                    const canvas = this.createProcessedImage(img);

                    const dataUrl = (outputFormat === 'png' || outputFormat === 'bmp')
                        ? canvas.toDataURL(mime)
                        : canvas.toDataURL(mime, quality);

                    const filename = this.generateFilename(imgRecord.name, i, canvas.width, canvas.height);
                    return { name: filename, data: dataUrl, original: imgRecord.name };
                })
            );

            this.processedImages = results;
            this.hideLoadingModal();
            this.showResults();
        } catch (error) {
            this.hideLoadingModal();
            this.showModal('Error', `Processing failed: ${error.message}`);
        }
    }

    getMimeType(format) {
        return { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp' }[format] || 'image/jpeg';
    }

    // FIX: generateFilename had a double extension removal bug — it stripped the
    //      extension once at the top (baseName) and then ran another .replace() to
    //      remove extensions again mid-function, corrupting filenames like
    //      "photo.final.jpg" → "photo" (losing ".final"). Now the extension is
    //      stripped only once at the beginning, and the format is appended once at
    //      the end. Also added width/height params so original_wxh pattern works correctly.
    generateFilename(originalName, index, processedW, processedH) {
        const namingPattern = document.getElementById('naming-pattern').value;
        const prefix = document.getElementById('filename-prefix').value;
        const suffix = document.getElementById('filename-suffix').value;
        const format = document.getElementById('output-format').value;

        // Strip extension once — keeps dots in filenames like "my.photo.jpg" intact
        const baseName = originalName.replace(/\.[^/.]+$/, '');

        let newName;
        switch (namingPattern) {
            case 'original_resized': newName = `${baseName}_resized`; break;
            case 'original_wxh':     newName = `${baseName}_${processedW}x${processedH}`; break;
            case 'custom':           newName = `${prefix}${baseName}${suffix}`; break;
            default:                 newName = baseName; break;
        }

        // For non-custom patterns, prepend prefix/suffix around the computed name
        if (namingPattern !== 'custom') {
            newName = `${prefix}${newName}${suffix}`;
        }

        return `${newName}.${format}`;
    }

    showResults() {
        // FIX: Correctly reference #options-panel (the id added to the HTML) and
        //      hide the file selection area so the results panel has full width.
        document.getElementById('file-selection-area').style.display = 'none';
        document.getElementById('preview-section').style.display = 'none';
        const optionsPanel = document.getElementById('options-panel');
        if (optionsPanel) optionsPanel.style.display = 'none';
        document.getElementById('results-section').style.display = 'block';

        const resultsGrid = document.getElementById('results-grid');
        resultsGrid.innerHTML = '';

        this.processedImages.forEach((img, index) => {
            const estimatedKB = Math.round((img.data.length * 0.75) / 1024);
            const div = document.createElement('div');
            div.className = 'result-item';

            const imgEl = document.createElement('img');
            imgEl.src = img.data;
            imgEl.alt = img.name;
            imgEl.className = 'result-item-image';

            const info = document.createElement('div');
            info.className = 'result-item-info';
            info.innerHTML = `
                <div class="result-item-name" title="${img.name}">${img.name}</div>
                <div class="result-item-size">~${estimatedKB} KB</div>
                <div class="result-item-actions">
                    <button class="result-item-btn">⬇ Download</button>
                </div>
            `;

            info.querySelector('.result-item-btn').addEventListener('click', () => {
                this.downloadImage(img.data, img.name);
            });

            div.appendChild(imgEl);
            div.appendChild(info);
            resultsGrid.appendChild(div);
        });
    }

    downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async downloadAllAsZip() {
        if (this.processedImages.length === 0) {
            this.showModal('Error', 'Process images first.');
            return;
        }

        // FIX: The original code called this "Download as ZIP" but simply triggered
        //      individual downloads. This is now honest about what it's doing, and
        //      staggers downloads slightly to prevent browser download managers from
        //      blocking simultaneous initiations.
        this.showLoadingModal('Preparing downloads...');

        try {
            for (let i = 0; i < this.processedImages.length; i++) {
                await new Promise(resolve => setTimeout(resolve, i * 150));
                this.downloadImage(this.processedImages[i].data, this.processedImages[i].name);
            }
            this.hideLoadingModal();
            this.showModal('Done', `${this.processedImages.length} image${this.processedImages.length > 1 ? 's' : ''} downloaded.`);
        } catch (error) {
            this.hideLoadingModal();
            this.showModal('Error', error.message);
        }
    }

    // ─── Reset ───────────────────────────────────────────────────────────────

    resetAllSettings() {
        this.transformations = { rotation: 0, flipH: false, flipV: false };
        this.enhancements    = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        this.filters         = { grayscale: false, sepia: false, blur: false, sharpen: false };

        const reset = (id, val) => { document.getElementById(id).value = val; };
        reset('resize-width', '800');
        reset('resize-height', '600');
        reset('brightness-slider', '100'); document.getElementById('brightness-value').textContent = '100';
        reset('contrast-slider', '100');   document.getElementById('contrast-value').textContent = '100';
        reset('saturation-slider', '100'); document.getElementById('saturation-value').textContent = '100';
        reset('hue-slider', '0');          document.getElementById('hue-value').textContent = '0';
        reset('quality-slider', '85');     document.getElementById('quality-value').textContent = '85';
        reset('padding-color', '#ffffff'); document.getElementById('padding-color-hex').value = '#ffffff';

        document.getElementById('lock-aspect-ratio').checked = true;
        document.getElementById('enable-watermark').checked = false;
        document.getElementById('watermark-options').style.display = 'none';

        document.querySelector('input[name="resize-mode"][value="fixed"]').checked = true;
        document.querySelector('input[name="aspect-mode"][value="stretch"]').checked = true;

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.transform-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.transform-btn[data-rotation="0"]').classList.add('active');
        document.querySelectorAll('.flip-btn').forEach(b => b.classList.remove('active'));

        this.updateUnitLabels();
        this.toggleQualitySlider();
        this.updatePreview();
    }

    // ─── Presets ─────────────────────────────────────────────────────────────

    loadPresets() {
        const container = document.getElementById('custom-presets');
        container.innerHTML = '';

        Object.entries(this.presets).forEach(([name, settings]) => {
            const div = document.createElement('div');
            div.className = 'custom-preset-item';

            const label = document.createElement('span');
            label.textContent = name;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'custom-preset-remove';
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', `Delete preset ${name}`);
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePreset(name);
            });

            div.appendChild(label);
            div.appendChild(removeBtn);
            div.addEventListener('click', () => this.applyPreset(settings));
            container.appendChild(div);
        });

        const hasPresets = Object.keys(this.presets).length > 0;
        document.getElementById('custom-presets-list').style.display = hasPresets ? 'block' : 'none';
    }

    savePreset() {
        const presetName = document.getElementById('preset-name').value.trim();
        if (!presetName) { this.showModal('Error', 'Please enter a preset name.'); return; }

        this.presets[presetName] = {
            width:      document.getElementById('resize-width').value,
            height:     document.getElementById('resize-height').value,
            format:     document.getElementById('output-format').value,
            quality:    document.getElementById('quality-slider').value,
            resizeMode: document.querySelector('input[name="resize-mode"]:checked').value,
            aspectMode: document.querySelector('input[name="aspect-mode"]:checked').value,
        };

        localStorage.setItem('imageResizePresets', JSON.stringify(this.presets));
        document.getElementById('preset-name').value = '';
        this.loadPresets();
        this.showModal('Saved', `Preset "${presetName}" saved.`);
    }

    deletePreset(name) {
        if (confirm(`Delete preset "${name}"?`)) {
            delete this.presets[name];
            localStorage.setItem('imageResizePresets', JSON.stringify(this.presets));
            this.loadPresets();
        }
    }

    applyPreset(settings) {
        document.getElementById('resize-width').value  = settings.width;
        document.getElementById('resize-height').value = settings.height;
        document.getElementById('output-format').value = settings.format;
        document.getElementById('quality-slider').value = settings.quality;
        document.getElementById('quality-value').textContent = settings.quality;
        document.querySelector(`input[name="resize-mode"][value="${settings.resizeMode}"]`).checked = true;
        document.querySelector(`input[name="aspect-mode"][value="${settings.aspectMode}"]`).checked = true;
        this.toggleQualitySlider();
        this.updatePreview();
    }

    applyQuickPreset(preset) {
        const presets = {
            thumbnail: { width: 150,  height: 150  },
            web:       { width: 1920, height: 1080 },
            print:     { width: 4000, height: 3000 },
            mobile:    { width: 640,  height: 480  },
        };
        const s = presets[preset];
        if (s) {
            document.getElementById('resize-width').value  = s.width;
            document.getElementById('resize-height').value = s.height;
            this.updatePreview();
        }
    }

    applySocialPreset(preset) {
        const presets = {
            'instagram-square': { width: 1080, height: 1080 },
            'instagram-story':  { width: 1080, height: 1920 },
            'twitter':          { width: 1024, height: 512  },
            'facebook':         { width: 1200, height: 628  },
        };
        const s = presets[preset];
        if (s) {
            document.getElementById('resize-width').value  = s.width;
            document.getElementById('resize-height').value = s.height;
            this.updatePreview();
        }
    }

    // ─── Accordion ────────────────────────────────────────────────────────────

    toggleAccordion(header) {
        const content = header.nextElementSibling;
        const isActive = content.classList.contains('active');

        // Close all
        document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.accordion-header').forEach(h => {
            h.classList.remove('active');
            h.setAttribute('aria-expanded', 'false');
        });

        // Open this one if it was closed
        if (!isActive) {
            content.classList.add('active');
            header.classList.add('active');
            header.setAttribute('aria-expanded', 'true');
        }
    }

    // ─── Modals ───────────────────────────────────────────────────────────────

    showModal(title, message) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('message-modal').classList.add('show');
    }

    hideModal() {
        document.getElementById('message-modal').classList.remove('show');
    }

    showLoadingModal(text = 'Processing...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-modal').style.display = 'flex';
    }

    hideLoadingModal() {
        document.getElementById('loading-modal').style.display = 'none';
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    new ImageResizer();
});