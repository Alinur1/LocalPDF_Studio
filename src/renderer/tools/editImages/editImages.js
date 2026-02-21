/**
 * LocalPDF Studio - Offline Image Toolkit
 * @author Md. Alinur Hossain <alinur1160@gmail.com>
 * @license AGPL 3.0
 */

import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDropForImages } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from "../../utils/themeManager.js";

class ImageResizer {
    constructor() {
        this.selectedImages = [];
        this.currentImageIndex = 0;
        this.processedImages = [];
        this.droppedImagePaths = [];
        this.transformations = { rotation: 0, flipH: false, flipV: false };
        this.enhancements = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        this.filters = { grayscale: false, sepia: false, blur: false, sharpen: false };
        this.presets = JSON.parse(localStorage.getItem('imageResizePresets') || '{}');
        this.currentImageDimensions = { width: 0, height: 0 }; // ← FIX: store real image dims
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
        const selectBtn = document.getElementById('select-images-btn');
        const fileInput = document.getElementById('file-input');

        selectBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        window.addEventListener('beforeunload', async () => {
            await this.cleanupDroppedFiles();
        });

        const backBtn = document.querySelector('a[href="../../index.html"]');
        if (backBtn) {
            backBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.cleanupDroppedFiles();
                window.location.href = '../../index.html';
            });
        }

        initializeGlobalDragDropForImages({
            onFilesDropped: (files) => this.addImages(files, true),
            onInvalidFiles: () => customAlert.alert('LocalPDF Studio - WARNING', 'Please select valid image files (JPEG, PNG, BMP, TIFF, WebP).')
        });

        document.getElementById('remove-files-btn').addEventListener('click', async () => await this.clearSelectedFiles());

        document.querySelectorAll('.preview-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchPreviewTab(e.currentTarget.dataset.tab, e.currentTarget));
        });

        // Comparison tab is now a static 50/50 split — no slider interaction needed

        document.querySelectorAll('input[name="resize-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateUnitLabels();
                this.updatePreview();
            });
        });

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

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyAspectRatio(e.currentTarget.dataset.ratio, 'aspect', e.currentTarget));
        });

        document.querySelectorAll('input[name="aspect-mode"]').forEach(radio => {
            radio.addEventListener('change', () => this.updatePreview());
        });

        const paddingColor = document.getElementById('padding-color');
        const paddingColorHex = document.getElementById('padding-color-hex');
        paddingColor.addEventListener('input', () => {
            paddingColorHex.value = paddingColor.value;
            this.updatePreview();
        });
        paddingColorHex.addEventListener('change', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(paddingColorHex.value)) {
                paddingColor.value = paddingColorHex.value;
                this.updatePreview();
            }
        });

        document.querySelectorAll('.transform-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyRotation(e.currentTarget.dataset.rotation, e.currentTarget));
        });
        document.querySelectorAll('.flip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyFlip(e.currentTarget.dataset.flip, e.currentTarget));
        });

        document.querySelectorAll('input[name="crop-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('crop-presets').style.display = e.target.value === 'preset' ? 'block' : 'none';
                this.updatePreview();
            });
        });

        const sliderMap = [
            { id: 'brightness-slider', valId: 'brightness-value', key: 'brightness' },
            { id: 'contrast-slider',   valId: 'contrast-value',   key: 'contrast'   },
            { id: 'saturation-slider', valId: 'saturation-value', key: 'saturation' },
            { id: 'hue-slider',        valId: 'hue-value',        key: 'hue'        },
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

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilter(e.currentTarget.dataset.filter, e.currentTarget));
        });

        document.getElementById('output-format').addEventListener('change', () => {
            this.toggleQualitySlider();
            this.updatePreview();
        });

        document.getElementById('quality-slider').addEventListener('input', (e) => {
            document.getElementById('quality-value').textContent = e.target.value;
            this.updatePreview();
        });

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

        document.querySelectorAll('.position-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updatePreview();
            });
        });

        document.getElementById('process-btn').addEventListener('click', () => this.processAllImages());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetAllSettings());

        // Download All button (inside results modal)
        document.getElementById('download-all-btn').addEventListener('click', () => this.downloadAllAsZip());

        document.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => this.toggleAccordion(header));
        });

        document.getElementById('save-preset-btn').addEventListener('click', () => this.savePreset());
        document.querySelectorAll('.quick-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyQuickPreset(e.currentTarget.dataset.preset));
        });
        document.querySelectorAll('.social-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applySocialPreset(e.currentTarget.dataset.preset));
        });

        // ── Message modal close ──────────────────────────────────────────────
        document.getElementById('modal-close-btn').addEventListener('click', () => this.hideModal());
        document.querySelector('.close-btn').addEventListener('click', () => this.hideModal());
        document.querySelector('.close-btn').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') this.hideModal();
        });

        // ── Results modal close ──────────────────────────────────────────────
        // X button in the header
        document.getElementById('results-modal-close-btn').addEventListener('click', () => this.closeResultsModal());
        // "Back to Editor" button in the footer
        document.getElementById('results-back-btn').addEventListener('click', () => this.closeResultsModal());
        // Click the dark backdrop outside the modal box to close
        document.getElementById('results-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('results-modal')) this.closeResultsModal();
        });

        // ── Escape key closes whichever modal is open ────────────────────────
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('results-modal').style.display !== 'none') {
                    this.closeResultsModal();
                } else {
                    this.hideModal();
                }
            }
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    updateUnitLabels() {
        const mode = document.querySelector('input[name="resize-mode"]:checked')?.value;
        const unit = mode === 'percentage' ? '%' : 'px';
        document.getElementById('resize-width-unit').textContent = unit;
        document.getElementById('resize-height-unit').textContent = unit;
    }

    toggleQualitySlider() {
        const format = document.getElementById('output-format').value;
        const lossless = format === 'png' || format === 'bmp';
        document.getElementById('quality-group').style.display = lossless ? 'none' : 'block';
    }

    // ─── File Handling ───────────────────────────────────────────────────────

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        event.target.value = '';
        this.addImages(files, false);
    }

    async cleanupDroppedFiles() {
        if (this.droppedImagePaths.length > 0) {
            try {
                for (const filePath of this.droppedImagePaths) {
                    await window.electronAPI.deleteFile(filePath);
                }
                this.droppedImagePaths = [];
            } catch (error) {
                console.log('Error cleaning up dropped files:', error);
            }
        }
    }

    async addImages(files, isDropped = false) {
        const validFiles = files.filter(f => f.type.startsWith('image/'));
        if (validFiles.length === 0) {
            customAlert.alert('LocalPDF Studio - WARNING', 'Please select valid image files (JPEG, PNG, BMP, TIFF, WebP).');
            return;
        }

        if (isDropped) {
            const savedPaths = [];
            for (const file of validFiles) {
                try {
                    const buffer = await file.arrayBuffer();
                    const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });
                    if (result.success) {
                        const blob = new Blob([buffer], { type: file.type });
                        const blobUrl = URL.createObjectURL(blob);
                        savedPaths.push({ name: file.name, size: file.size, type: file.type, blobUrl, filePath: result.filePath });
                        this.droppedImagePaths.push(result.filePath);
                    } else {
                        customAlert.alert('LocalPDF Studio - ERROR', 'Failed to save the image. Please try again.');
                        return;
                    }
                } catch (error) {
                    customAlert.alert('LocalPDF Studio - ERROR', 'An error occurred while adding the image. Please try again.');
                    return;
                }
            }
            this.loadImagesFromBlobUrls(savedPaths);
        } else {
            await this.loadImagesAsDataUrls(validFiles);
        }
    }

    async loadImagesAsDataUrls(files) {
        let completed = 0;
        const total = files.length;
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.selectedImages.push({ name: file.name, size: file.size, type: file.type, data: e.target.result });
                if (++completed === total) this.updateUI();
            };
            reader.onerror = () => { if (++completed === total) this.updateUI(); };
            reader.readAsDataURL(file);
        });
    }

    loadImagesFromBlobUrls(imageData) {
        let completed = 0;
        const total = imageData.length;
        for (const data of imageData) {
            const img = new Image();
            img.onload = () => {
                this.selectedImages.push({ name: data.name, size: data.size, type: data.type, data: data.blobUrl });
                if (++completed === total) this.updateUI();
            };
            img.onerror = () => { if (++completed === total) this.updateUI(); };
            img.src = data.blobUrl;
        }
    }

    async clearSelectedFiles() {
        await this.cleanupDroppedFiles();
        this.selectedImages = [];
        this.processedImages = [];
        this.currentImageIndex = 0;
        this.currentImageDimensions = { width: 0, height: 0 }; // ← FIX: clear dims on file clear
        this.closeResultsModal();
        this.updateUI();
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

            // Individual remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'image-item-remove';
            removeBtn.textContent = '✕';
            removeBtn.setAttribute('aria-label', `Remove ${img.name}`);
            removeBtn.setAttribute('title', `Remove ${img.name}`);
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // don't trigger selectImage
                this.removeImage(index);
            });

            div.appendChild(imgEl);
            div.appendChild(overlay);
            div.appendChild(removeBtn);
            div.addEventListener('click', () => this.selectImage(index));
            div.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this.selectImage(index); });
            imagesGrid.appendChild(div);
        });
    }

    selectImage(index) {
        this.currentImageIndex = index;
        this.renderImagesList();
        this.loadImageForPreview(index);
    }

    removeImage(index) {
        // Revoke blob URL if it's a dropped file to free memory
        const img = this.selectedImages[index];
        if (img.data && img.data.startsWith('blob:')) {
            URL.revokeObjectURL(img.data);
        }

        this.selectedImages.splice(index, 1);

        // Adjust currentImageIndex so it stays valid
        if (this.selectedImages.length === 0) {
            this.currentImageIndex = 0;
            this.currentImageDimensions = { width: 0, height: 0 }; // ← FIX: clear dims when no images left
        } else if (this.currentImageIndex >= this.selectedImages.length) {
            this.currentImageIndex = this.selectedImages.length - 1;
        }

        this.updateUI();
    }

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
        } catch (err) { console.log(err); }
    }

    // ─── Preview ─────────────────────────────────────────────────────────────

    drawBeforePreview(img) {
        const canvas = document.getElementById('canvas-before');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const { width, height } = this.scaleToFit(img.width, img.height, 600, 400);
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        document.getElementById('original-size').textContent = `${img.width}×${img.height}px`;

        // ← FIX: Save the real image dimensions before filling the inputs
        this.currentImageDimensions = { width: img.width, height: img.height };

        // Pre-fill resize inputs with the image's actual dimensions
        document.getElementById('resize-width').value  = img.width;
        document.getElementById('resize-height').value = img.height;

        // Comparison before — same dimensions
        const canvasCompareBefore = document.getElementById('canvas-compare-before');
        const ctxCompare = canvasCompareBefore.getContext('2d');
        canvasCompareBefore.width = width;
        canvasCompareBefore.height = height;
        ctxCompare.drawImage(img, 0, 0, width, height);

        // Set the slider container height to match so both panels align perfectly
        const slider = document.querySelector('.comparison-slider');
        if (slider) slider.style.height = (height + 20) + 'px';
    }

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
        } catch (err) { console.log('Preview update failed:', err); }
    }

    createProcessedImage(img) {
        const resizeMode = document.querySelector('input[name="resize-mode"]:checked').value;
        const aspectMode = document.querySelector('input[name="aspect-mode"]:checked').value;
        const lockAspect = document.getElementById('lock-aspect-ratio').checked;

        let width = parseInt(document.getElementById('resize-width').value) || img.width;
        let height = parseInt(document.getElementById('resize-height').value) || img.height;

        if (resizeMode === 'percentage') {
            width = Math.max(1, Math.round(img.width * (width / 100)));
            height = Math.max(1, Math.round(img.height * (height / 100)));
        }

        const swapped = this.transformations.rotation === 90 || this.transformations.rotation === 270;
        const srcW = swapped ? img.height : img.width;
        const srcH = swapped ? img.width : img.height;

        if (lockAspect && (resizeMode === 'fixed' || resizeMode === 'fitcontain' || resizeMode === 'cover')) {
            const srcAspect = srcW / srcH;
            const tgtAspect = width / height;
            if (srcAspect > tgtAspect) height = Math.max(1, Math.round(width / srcAspect));
            else width = Math.max(1, Math.round(height * srcAspect));
        }

        document.getElementById('new-size').textContent = `${width}×${height}px`;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let targetWidth = width, targetHeight = height, offsetX = 0, offsetY = 0;
        const paddingColor = document.getElementById('padding-color').value;

        if (aspectMode === 'contain') {
            const scale = Math.min(width / srcW, height / srcH);
            targetWidth = Math.round(srcW * scale);
            targetHeight = Math.round(srcH * scale);
            offsetX = Math.round((width - targetWidth) / 2);
            offsetY = Math.round((height - targetHeight) / 2);
            canvas.width = width; canvas.height = height;
            ctx.fillStyle = paddingColor;
            ctx.fillRect(0, 0, width, height);
        } else if (aspectMode === 'cover') {
            const scale = Math.max(width / srcW, height / srcH);
            targetWidth = Math.round(srcW * scale);
            targetHeight = Math.round(srcH * scale);
            offsetX = Math.round((width - targetWidth) / 2);
            offsetY = Math.round((height - targetHeight) / 2);
            canvas.width = width; canvas.height = height;
        } else {
            canvas.width = width; canvas.height = height;
        }

        this.drawImageWithTransforms(ctx, img, offsetX, offsetY, targetWidth, targetHeight);
        return canvas;
    }

    drawImageWithTransforms(ctx, img, offsetX, offsetY, drawW, drawH) {
        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        const rot = this.transformations.rotation;
        ctx.save();
        ctx.translate(canvasW / 2, canvasH / 2);
        if (rot !== 0) ctx.rotate((rot * Math.PI) / 180);
        ctx.scale(this.transformations.flipH ? -1 : 1, this.transformations.flipV ? -1 : 1);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
        this.applyEnhancementsToContext(ctx, canvasW, canvasH);
        if (document.getElementById('enable-watermark').checked) {
            this.drawWatermark(ctx, canvasW, canvasH);
        }
    }

    applyEnhancementsToContext(ctx, canvasWidth, canvasHeight) {
        const needsProcessing =
            this.enhancements.brightness !== 100 || this.enhancements.contrast !== 100 ||
            this.enhancements.saturation !== 100 || this.enhancements.hue !== 0 ||
            this.filters.grayscale || this.filters.sepia || this.filters.blur || this.filters.sharpen;
        if (!needsProcessing) return;

        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        const brightness = this.enhancements.brightness / 100;
        const contrast = (this.enhancements.contrast - 100) / 100;
        const saturation = this.enhancements.saturation / 100;
        const hue = this.enhancements.hue;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i], g = data[i + 1], b = data[i + 2];
            r *= brightness; g *= brightness; b *= brightness;
            r = (r - 128) * (1 + contrast) + 128;
            g = (g - 128) * (1 + contrast) + 128;
            b = (b - 128) * (1 + contrast) + 128;
            if (saturation !== 1) {
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                r = gray + (r - gray) * saturation;
                g = gray + (g - gray) * saturation;
                b = gray + (b - gray) * saturation;
            }
            if (hue !== 0) [r, g, b] = this.applyHueRotation(r, g, b, hue);
            data[i] = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }
        ctx.putImageData(imageData, 0, 0);

        if (this.filters.grayscale) this.applyGrayscale(ctx, canvasWidth, canvasHeight);
        if (this.filters.sepia)     this.applySepia(ctx, canvasWidth, canvasHeight);
        if (this.filters.blur)      this.applyBlur(ctx, canvasWidth, canvasHeight);
        if (this.filters.sharpen)   this.applySharpen(ctx, canvasWidth, canvasHeight);
    }

    applyHueRotation(r, g, b, hueDeg) {
        const [h, s, l] = this.rgbToHsl(r, g, b);
        return this.hslToRgb((h + hueDeg) % 360, s, l);
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
        if (s === 0) { r = g = b = l; }
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

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
                        r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++;
                    }
                }
                const idx = (y * width + x) * 4;
                newData[idx] = r / count; newData[idx + 1] = g / count; newData[idx + 2] = b / count;
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
                        r += data[idx] * kernel[kIdx];
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

    drawAfterPreview(canvas) {
        const canvasAfter = document.getElementById('canvas-after');
        const ctxAfter = canvasAfter.getContext('2d');
        const { width, height } = this.scaleToFit(canvas.width, canvas.height, 400, 400);
        canvasAfter.width = width; canvasAfter.height = height;
        ctxAfter.drawImage(canvas, 0, 0, width, height);
    }

    drawComparisonAfter(canvas) {
        const canvasCompareAfter = document.getElementById('canvas-compare-after');
        const ctxCompareAfter = canvasCompareAfter.getContext('2d');
        const { width, height } = this.scaleToFit(canvas.width, canvas.height, 600, 400);
        canvasCompareAfter.width = width; canvasCompareAfter.height = height;
        ctxCompareAfter.drawImage(canvas, 0, 0, width, height);

        const outputFormat = document.getElementById('output-format').value;
        const quality = parseInt(document.getElementById('quality-slider').value) / 100;
        const mime = this.getMimeType(outputFormat);
        const dataUrl = canvas.toDataURL(mime, quality);
        const fileSize = Math.round((dataUrl.length * 0.75) / 1024);
        document.getElementById('file-size-info').textContent = `~${fileSize} KB`;

        const originalSizeKB = this.selectedImages[this.currentImageIndex].size / 1024;
        const reduction = Math.round(((originalSizeKB - fileSize) / originalSizeKB) * 100);
        const reductionEl = document.getElementById('reduction-info');
        reductionEl.textContent = `${reduction > 0 ? '-' : '+'}${Math.abs(reduction)}%`;
        reductionEl.style.color = reduction > 0 ? '#2ecc71' : '#e74c3c';
    }

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

    updateComparisonSlider() {
        // Static 50/50 split — nothing to update
    }

    async updateHeightFromWidth() {
        if (this.selectedImages.length === 0) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[this.currentImageIndex].data);
            const w = parseInt(document.getElementById('resize-width').value) || 1;
            document.getElementById('resize-height').value = Math.max(1, Math.round((w * img.height) / img.width));
        } catch (err) { console.log(err); }
    }

    async updateWidthFromHeight() {
        if (this.selectedImages.length === 0) return;
        try {
            const img = await this.loadImageElement(this.selectedImages[this.currentImageIndex].data);
            const h = parseInt(document.getElementById('resize-height').value) || 1;
            document.getElementById('resize-width').value = Math.max(1, Math.round((h * img.width) / img.height));
        } catch (err) { console.log(err); }
    }

    applyAspectRatio(ratio, type, buttonEl) {
        const [w, h] = ratio.split(':').map(Number);
        const currentWidth = parseInt(document.getElementById('resize-width').value) || 800;
        document.getElementById('resize-height').value = Math.max(1, Math.round((currentWidth * h) / w));
        this.updatePreview();
        if (type === 'aspect') {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            buttonEl.classList.add('active');
        }
    }

    applyRotation(angleDeg, buttonEl) {
        this.transformations.rotation = parseInt(angleDeg);
        document.querySelectorAll('.transform-btn').forEach(b => b.classList.remove('active'));
        buttonEl.classList.add('active');
        this.updatePreview();
    }

    applyFlip(direction, buttonEl) {
        if (direction === 'horizontal') this.transformations.flipH = !this.transformations.flipH;
        else this.transformations.flipV = !this.transformations.flipV;
        buttonEl.classList.toggle('active',
            direction === 'horizontal' ? this.transformations.flipH : this.transformations.flipV);
        this.updatePreview();
    }

    toggleFilter(filterName, buttonEl) {
        this.filters[filterName] = !this.filters[filterName];
        buttonEl.classList.toggle('active', this.filters[filterName]);
        this.updatePreview();
    }

    autoEnhance() {
        this.enhancements = { brightness: 105, contrast: 115, saturation: 110, hue: 0 };
        document.getElementById('brightness-slider').value = 105; document.getElementById('brightness-value').textContent = '105';
        document.getElementById('contrast-slider').value = 115;   document.getElementById('contrast-value').textContent = '115';
        document.getElementById('saturation-slider').value = 110; document.getElementById('saturation-value').textContent = '110';
        document.getElementById('hue-slider').value = 0;          document.getElementById('hue-value').textContent = '0';
        this.updatePreview();
    }

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
            const tw = ctx.measureText(text).width;
            const pad = fontSize * 0.5;
            let x, y;
            switch (position) {
                case 'top-left':      x = pad;                       y = fontSize / 2 + pad; break;
                case 'top-center':    x = canvasWidth / 2 - tw / 2;  y = fontSize / 2 + pad; break;
                case 'top-right':     x = canvasWidth - tw - pad;     y = fontSize / 2 + pad; break;
                case 'left':          x = pad;                        y = canvasHeight / 2;   break;
                case 'right':         x = canvasWidth - tw - pad;     y = canvasHeight / 2;   break;
                case 'bottom-left':   x = pad;                        y = canvasHeight - fontSize / 2 - pad; break;
                case 'bottom-center': x = canvasWidth / 2 - tw / 2;  y = canvasHeight - fontSize / 2 - pad; break;
                case 'bottom-right':  x = canvasWidth - tw - pad;     y = canvasHeight - fontSize / 2 - pad; break;
                default:              x = canvasWidth / 2 - tw / 2;  y = canvasHeight / 2; break;
            }
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }
        ctx.restore();
    }

    // ─── Batch Processing ─────────────────────────────────────────────────────

    async processAllImages() {
        if (this.selectedImages.length === 0) {
            customAlert.alert('LocalPDF Studio - NOTICE', 'Please select images first.');
            return;
        }

        this.showLoadingModal('Processing...');
        this.processedImages = [];

        const outputFormat = document.getElementById('output-format').value;
        const quality = parseInt(document.getElementById('quality-slider').value) / 100;
        const mime = this.getMimeType(outputFormat);

        try {
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
            this.showResultsModal();
        } catch (error) {
            this.hideLoadingModal();
            console.log('Image processing error:', error);
            customAlert.alert('LocalPDF Studio - ERROR', 'An error occurred while processing images. Please try again.');
        }
    }

    getMimeType(format) {
        return { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp' }[format] || 'image/jpeg';
    }

    generateFilename(originalName, index, processedW, processedH) {
        const namingPattern = document.getElementById('naming-pattern').value;
        const prefix = document.getElementById('filename-prefix').value;
        const suffix = document.getElementById('filename-suffix').value;
        const format = document.getElementById('output-format').value;
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        let newName;
        switch (namingPattern) {
            case 'original_resized': newName = `${baseName}_resized`; break;
            case 'original_wxh':     newName = `${baseName}_${processedW}x${processedH}`; break;
            case 'custom':           newName = `${prefix}${baseName}${suffix}`; break;
            default:                 newName = baseName; break;
        }
        if (namingPattern !== 'custom') newName = `${prefix}${newName}${suffix}`;
        return `${newName}.${format}`;
    }

    // ─── Results Modal ────────────────────────────────────────────────────────

    showResultsModal() {
        const count = this.processedImages.length;

        document.getElementById('results-modal-subtitle').textContent =
            `${count} image${count !== 1 ? 's' : ''} processed successfully.`;

        const resultsGrid = document.getElementById('results-grid');
        resultsGrid.innerHTML = '';

        this.processedImages.forEach((img) => {
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
                    <button class="result-item-btn">⬇ Save</button>
                </div>
            `;
            info.querySelector('.result-item-btn').addEventListener('click', () => {
                this.downloadImage(img.data, img.name);
            });

            div.appendChild(imgEl);
            div.appendChild(info);
            resultsGrid.appendChild(div);
        });

        const modal = document.getElementById('results-modal');
        modal.style.display = 'flex';
        document.getElementById('results-modal-close-btn').focus();
    }

    closeResultsModal() {
        document.getElementById('results-modal').style.display = 'none';
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
            customAlert.alert('LocalPDF Studio - NOTICE', 'Process images first.');
            return;
        }
        this.showLoadingModal('Building ZIP...');
        try {
            const zipBytes = await this.buildZip(this.processedImages);
            const blob = new Blob([zipBytes], { type: 'application/zip' });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href     = url;
            link.download = 'processed-images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.hideLoadingModal();
        } catch (error) {
            this.hideLoadingModal();
            console.error('ZIP error:', error);
            customAlert.alert('Download Error', 'Could not create ZIP. Please try saving images individually.');
        }
    }

    async buildZip(images) {
        const enc = (str) => new TextEncoder().encode(str);
        const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
        const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xFFFF, true); return b; };
        const concat = (...arrays) => {
            const total = arrays.reduce((s, a) => s + a.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const a of arrays) { out.set(a, off); off += a.length; }
            return out;
        };

        const crcTable = (() => {
            const t = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[i] = c;
            }
            return t;
        })();
        const crc32 = (buf) => {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };

        const now = new Date();
        const dosTime = u16(((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)));
        const dosDate = u16((((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()));

        const parts   = [];
        const central = [];
        let offset = 0;

        for (const img of images) {
            const base64   = img.data.split(',')[1];
            const binary   = atob(base64);
            const fileData = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) fileData[i] = binary.charCodeAt(i);

            const nameBytes = enc(img.name);
            const crc       = crc32(fileData);
            const size      = fileData.length;

            const lh = concat(
                new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
                u16(20), u16(0), u16(0),
                dosTime, dosDate,
                u32(crc), u32(size), u32(size),
                u16(nameBytes.length), u16(0),
                nameBytes
            );

            const cd = concat(
                new Uint8Array([0x50, 0x4B, 0x01, 0x02]),
                u16(20), u16(20), u16(0), u16(0),
                dosTime, dosDate,
                u32(crc), u32(size), u32(size),
                u16(nameBytes.length), u16(0), u16(0),
                u16(0), u16(0), u32(0),
                u32(offset),
                nameBytes
            );

            parts.push(lh, fileData);
            central.push(cd);
            offset += lh.length + size;
        }

        const cdData = concat(...central);
        const eocd = concat(
            new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
            u16(0), u16(0),
            u16(images.length), u16(images.length),
            u32(cdData.length), u32(offset),
            u16(0)
        );

        return concat(...parts, cdData, eocd);
    }

    // ─── Reset ───────────────────────────────────────────────────────────────

    resetAllSettings() {
        this.transformations = { rotation: 0, flipH: false, flipV: false };
        this.enhancements    = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        this.filters         = { grayscale: false, sepia: false, blur: false, sharpen: false };

        const reset = (id, val) => { document.getElementById(id).value = val; };

        // ← FIX: restore width/height to the actual loaded image dimensions, not hardcoded 800/600
        reset('resize-width',  this.currentImageDimensions.width  || '800');
        reset('resize-height', this.currentImageDimensions.height || '600');

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

        document.querySelectorAll('.filter-btn, .flip-btn, .transform-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.transform-btn[data-rotation="0"]').classList.add('active');

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
            removeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deletePreset(name); });
            div.appendChild(label);
            div.appendChild(removeBtn);
            div.addEventListener('click', () => this.applyPreset(settings));
            container.appendChild(div);
        });
        document.getElementById('custom-presets-list').style.display =
            Object.keys(this.presets).length > 0 ? 'block' : 'none';
    }

    savePreset() {
        const presetName = document.getElementById('preset-name').value.trim();
        if (!presetName) { customAlert.alert('LocalPDF Studio - WARNING', 'Please enter a preset name.'); return; }
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
        customAlert.alert('LocalPDF Studio - SUCCESS', `Preset "${presetName}" saved.`);
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
        const presets = { thumbnail: {width:150,height:150}, web: {width:1920,height:1080}, print: {width:4000,height:3000}, mobile: {width:640,height:480} };
        const s = presets[preset];
        if (s) { document.getElementById('resize-width').value = s.width; document.getElementById('resize-height').value = s.height; this.updatePreview(); }
    }

    applySocialPreset(preset) {
        const presets = { 'instagram-square': {width:1080,height:1080}, 'instagram-story': {width:1080,height:1920}, 'twitter': {width:1024,height:512}, 'facebook': {width:1200,height:628} };
        const s = presets[preset];
        if (s) { document.getElementById('resize-width').value = s.width; document.getElementById('resize-height').value = s.height; this.updatePreview(); }
    }

    // ─── Accordion ────────────────────────────────────────────────────────────

    toggleAccordion(header) {
        const content = header.nextElementSibling;
        const isActive = content.classList.contains('active');
        document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.accordion-header').forEach(h => { h.classList.remove('active'); h.setAttribute('aria-expanded', 'false'); });
        if (!isActive) { content.classList.add('active'); header.classList.add('active'); header.setAttribute('aria-expanded', 'true'); }
    }

    // ─── Loading / Message Modals ─────────────────────────────────────────────

    showLoadingModal(text = 'Processing...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-modal').style.display = 'flex';
    }

    hideLoadingModal() {
        document.getElementById('loading-modal').style.display = 'none';
    }

    showModal(title, message) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('message-modal').classList.add('show');
    }

    hideModal() {
        document.getElementById('message-modal').classList.remove('show');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    new ImageResizer();
});