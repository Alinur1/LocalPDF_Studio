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


// src/renderer/tools/ocrPdf/ocrPdf.js - FIXED VERSION

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDropForOCR } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';
import tesseractOcr from '../../utils/tesseractOcr.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const processBtn = document.getElementById('process-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const languageSelect = document.getElementById('languageSelect');
    const languageDropdown = document.getElementById('languageDropdown');
    const languageTags = document.getElementById('languageTags');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const dropdownSearch = document.querySelector('.dropdown-search');
    const dropdownOptions = document.querySelectorAll('.dropdown-option');
    const pageOptionsContainer = document.getElementById('page-options-container');
    const selectionInfoEl = document.getElementById('selection-info');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const selectAllBtn = document.getElementById('select-all-pages');
    const selectEvenBtn = document.getElementById('select-even-pages');
    const selectOddBtn = document.getElementById('select-odd-pages');
    const invertSelectionBtn = document.getElementById('invert-selection');
    const manualPagesInput = document.getElementById('manual-pages');
    const pageRangesInput = document.getElementById('page-ranges');
    const previewTitle = document.getElementById('preview-title');

    // BATCH PROCESSING MODAL ELEMENTS
    const batchProgressModal = document.getElementById('batch-progress-modal');
    const batchProgressFill = document.getElementById('batch-progress-fill');
    const batchCurrentAction = document.getElementById('batch-current-action');
    const batchCurrentPage = document.getElementById('batch-current-page');
    const batchTotalPages = document.getElementById('batch-total-pages');
    const batchTimeElapsed = document.getElementById('batch-time-elapsed');
    const batchPerformanceWarning = document.getElementById('batch-performance-warning');
    const batchCancelBtn = document.getElementById('batch-cancel-btn');
    const batchStatusDots = document.getElementById('batch-status-dots');

    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];
    let selectedPages = new Set();
    let selectedLanguages = new Set(['eng']);
    let totalPages = 0;
    let isImageFile = false;
    let batchProcessingCancelled = false;

    const langNames = {
        'eng': 'English',
        'por': 'Portuguese',
        'afr': 'Afrikaans',
        'sqi': 'Albanian',
        'amh': 'Amharic',
        'ara': 'Arabic',
        'asm': 'Assamese',
        'aze': 'Azerbaijani',
        'aze_cyrl': 'Azerbaijani - Cyrillic',
        'eus': 'Basque',
        'bel': 'Belarusian',
        'ben': 'Bengali',
        'bos': 'Bosnian',
        'bul': 'Bulgarian',
        'mya': 'Burmese',
        'cat': 'Catalan; Valencian',
        'ceb': 'Cebuano',
        'khm': 'Central Khmer',
        'chr': 'Cherokee',
        'chi_sim': 'Chinese - Simplified',
        'chi_tra': 'Chinese - Traditional',
        'hrv': 'Croatian',
        'ces': 'Czech',
        'dan': 'Danish',
        'nld': 'Dutch; Flemish',
        'dzo': 'Dzongkha',
        'enm': 'English, Middle (1100-1500)',
        'epo': 'Esperanto',
        'est': 'Estonian',
        'fin': 'Finnish',
        'fra': 'French',
        'frm': 'French, Middle (ca. 1400-1600)',
        'glg': 'Galician',
        'kat': 'Georgian',
        'deu': 'German',
        'frk': 'German Fraktur',
        'ell': 'Greek, Modern (1453-)',
        'grc': 'Greek, Ancient (-1453)',
        'guj': 'Gujarati',
        'hat': 'Haitian; Haitian Creole',
        'heb': 'Hebrew',
        'hin': 'Hindi',
        'hun': 'Hungarian',
        'isl': 'Icelandic',
        'ind': 'Indonesian',
        'iku': 'Inuktitut',
        'gle': 'Irish',
        'ita': 'Italian',
        'jpn': 'Japanese',
        'jav': 'Javanese',
        'kan': 'Kannada',
        'kaz': 'Kazakh',
        'kir': 'Kirghiz; Kyrgyz',
        'kor': 'Korean',
        'kur': 'Kurdish',
        'lao': 'Lao',
        'lat': 'Latin',
        'lav': 'Latvian',
        'lit': 'Lithuanian',
        'mkd': 'Macedonian',
        'msa': 'Malay',
        'mal': 'Malayalam',
        'mlt': 'Maltese',
        'mar': 'Marathi',
        'nep': 'Nepali',
        'nor': 'Norwegian',
        'ori': 'Oriya',
        'pan': 'Panjabi; Punjabi',
        'fas': 'Persian',
        'pol': 'Polish',
        'pus': 'Pushto; Pashto',
        'ron': 'Romanian; Moldavian; Moldovan',
        'rus': 'Russian',
        'san': 'Sanskrit',
        'srp': 'Serbian',
        'srp_latn': 'Serbian - Latin',
        'sin': 'Sinhala; Sinhalese',
        'slk': 'Slovak',
        'slv': 'Slovenian',
        'spa': 'Spanish; Castilian',
        'swa': 'Swahili',
        'swe': 'Swedish',
        'syr': 'Syriac',
        'tgl': 'Tagalog',
        'tgk': 'Tajik',
        'tam': 'Tamil',
        'tel': 'Telugu',
        'tha': 'Thai',
        'bod': 'Tibetan',
        'tir': 'Tigrinya',
        'tur': 'Turkish',
        'uig': 'Uighur; Uyghur',
        'ukr': 'Ukrainian',
        'urd': 'Urdu',
        'uzb': 'Uzbek',
        'uzb_cyrl': 'Uzbek - Cyrillic',
        'vie': 'Vietnamese',
        'cym': 'Welsh',
        'yid': 'Yiddish'
    };

    // Helper function to update language tags display
    function updateLanguageTags() {
        const langArray = Array.from(selectedLanguages).sort();
        languageTags.innerHTML = '';

        langArray.forEach(langCode => {
            const tag = document.createElement('span');
            tag.className = 'language-tag';
            tag.innerHTML = `${langNames[langCode]} <button class="tag-remove" data-value="${langCode}">×</button>`;
            languageTags.appendChild(tag);

            const removeBtn = tag.querySelector('.tag-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeLanguage(langCode);
            });
        });

        if (langArray.length === 0) {
            languageTags.innerHTML = '<span class="language-placeholder">Select Languages</span>';
        }
    }

    function removeLanguage(langCode) {
        selectedLanguages.delete(langCode);
        const option = document.querySelector(`.dropdown-option[data-value="${langCode}"]`);
        if (option) {
            const checkbox = option.querySelector('.option-checkbox');
            if (checkbox) {
                checkbox.checked = false;
            }
            option.classList.remove('selected');
        }
        updateLanguageTags();
    }

    // Custom dropdown functionality
    languageDropdown.addEventListener('click', (e) => {
        if (e.target.closest('.tag-remove')) {
            return;
        }
        dropdownMenu.classList.toggle('active');
        languageDropdown.classList.toggle('active');
        if (dropdownMenu.classList.contains('active')) {
            dropdownSearch.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            dropdownMenu.classList.remove('active');
            languageDropdown.classList.remove('active');
        }
    });

    dropdownSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        dropdownOptions.forEach(option => {
            const text = option.textContent.toLowerCase();
            const value = option.dataset.value.toLowerCase();

            if (searchTerm === '' || text.includes(searchTerm) || value.includes(searchTerm)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });
    });

    dropdownOptions.forEach(option => {
        const checkbox = option.querySelector('.option-checkbox');
        option.addEventListener('click', (e) => {
            if (e.target === checkbox) {
                checkbox.checked = !checkbox.checked;
            } else {
                checkbox.checked = !checkbox.checked;
            }

            const value = option.dataset.value;
            if (checkbox.checked) {
                selectedLanguages.add(value);
                option.classList.add('selected');
            } else {
                selectedLanguages.delete(value);
                option.classList.remove('selected');
            }
            updateLanguageTags();
        });
    });

    dropdownOptions.forEach(option => {
        const checkbox = option.querySelector('.option-checkbox');
        const value = option.dataset.value;
        if (checkbox.checked) {
            selectedLanguages.add(value);
            option.classList.add('selected');
        }
    });
    updateLanguageTags();

    // Page selection functionality
    clearSelectionBtn.addEventListener('click', () => {
        selectedPages.clear();
        manualPagesInput.value = '';
        pageRangesInput.value = '';
        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            thumb.classList.remove('selected');
        });
        updateSelectionInfo();
    });

    selectAllBtn.addEventListener('click', () => {
        for (let i = 1; i <= totalPages; i++) {
            selectedPages.add(i);
            const thumb = document.querySelector(`[data-page-num="${i}"]`);
            if (thumb) thumb.classList.add('selected');
        }
        updateSelectionInfo();
    });

    selectEvenBtn.addEventListener('click', () => {
        for (let i = 2; i <= totalPages; i += 2) {
            selectedPages.add(i);
            const thumb = document.querySelector(`[data-page-num="${i}"]`);
            if (thumb) thumb.classList.add('selected');
        }
        updateSelectionInfo();
    });

    selectOddBtn.addEventListener('click', () => {
        for (let i = 1; i <= totalPages; i += 2) {
            selectedPages.add(i);
            const thumb = document.querySelector(`[data-page-num="${i}"]`);
            if (thumb) thumb.classList.add('selected');
        }
        updateSelectionInfo();
    });

    invertSelectionBtn.addEventListener('click', () => {
        const newSelection = new Set();
        for (let i = 1; i <= totalPages; i++) {
            if (!selectedPages.has(i)) {
                newSelection.add(i);
            }
        }
        selectedPages = newSelection;

        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            const pageNum = parseInt(thumb.dataset.pageNum);
            if (selectedPages.has(pageNum)) {
                thumb.classList.add('selected');
            } else {
                thumb.classList.remove('selected');
            }
        });
        updateSelectionInfo();
    });

    function parsePageInput(input) {
        const pages = new Set();
        if (!input.trim()) return pages;

        const parts = input.split(',').map(p => p.trim());
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(x => parseInt(x.trim()));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                        if (i > 0 && i <= totalPages) {
                            pages.add(i);
                        }
                    }
                }
            } else {
                const page = parseInt(part);
                if (!isNaN(page) && page > 0 && page <= totalPages) {
                    pages.add(page);
                }
            }
        }
        return pages;
    }

    function updatePageSelectionFromInputs() {
        const manualPages = parsePageInput(manualPagesInput.value);
        const rangePages = parsePageInput(pageRangesInput.value);

        selectedPages.clear();
        manualPages.forEach(p => selectedPages.add(p));
        rangePages.forEach(p => selectedPages.add(p));

        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            const pageNum = parseInt(thumb.dataset.pageNum);
            if (selectedPages.has(pageNum)) {
                thumb.classList.add('selected');
            } else {
                thumb.classList.remove('selected');
            }
        });
        updateSelectionInfo();
    }

    manualPagesInput.addEventListener('input', updatePageSelectionFromInputs);
    pageRangesInput.addEventListener('input', updatePageSelectionFromInputs);

    function togglePageSelection(pageNum, element) {
        if (selectedPages.has(pageNum)) {
            selectedPages.delete(pageNum);
            element.classList.remove('selected');
        } else {
            selectedPages.add(pageNum);
            element.classList.add('selected');
        }
        updateSelectionInfo();
    }

    function updateSelectionInfo() {
        const count = selectedPages.size;
        if (count === 0) {
            // selectionInfoEl.textContent = 'No pages selected';
            selectionInfoEl.textContent = i18n.t('OCR.preview_no_pages_selected');
            selectionInfoEl.style.display = 'none';
        } else {
            const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
            selectionInfoEl.textContent = `${count} page(s) selected: ${sortedPages.join(', ')}`;
            selectionInfoEl.style.display = 'block';
        }
    }

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('ocrPdfJS.selectingFiles'));
        const files = await window.electronAPI.selectPdfsAndImages();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            handleFileSelected({
                path: filePath,
                name: fileName,
                size: fileSize,
                isImage: /\.(jpg|jpeg|png|bmp|tiff)$/i.test(filePath)
            });
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
            window.location.href = '../../index.html';
        });
    }

    async function handleFileSelected(file) {
        clearAll(true);
        selectedFile = file;
        isImageFile = /\.(jpg|jpeg|png|bmp|tiff)$/i.test(file.path);
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        await loadPdfPreview(file.path);
        updateProcessButtonState();
    }

    async function loadPdfPreview(filePath) {
        try {
            loadingUI.show(i18n.t('ocrPdfJS.loadingPreview'));
            previewContainer.style.display = 'block';
            previewGrid.innerHTML = '';
            selectedPages.clear();
            totalPages = 0;
            manualPagesInput.value = '';
            pageRangesInput.value = '';

            const isImage = /\.(jpg|jpeg|png|bmp|tiff)$/i.test(filePath);

            if (isImage) {
                previewTitle.textContent = i18n.t('ocrPdfJS.imagePreview');
                pageOptionsContainer.style.display = 'none';
                pageCountEl.textContent = '';

                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'page-thumbnail';
                const img = document.createElement('img');
                img.src = `file://${filePath}`;
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '4px';
                imageWrapper.appendChild(img);
                previewGrid.appendChild(imageWrapper);
            } else {
                previewTitle.textContent = i18n.t('ocrPdfJS.pdfPreviewTitle');
                pageOptionsContainer.style.display = 'block';

                const loadingTask = pdfjsLib.getDocument(`file://${filePath}`);
                pdfDoc = await loadingTask.promise;
                totalPages = pdfDoc.numPages;
                pageCountEl.textContent = `${totalPages} page(s)`;
                previewGrid.innerHTML = '';
                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    await renderPageThumbnail(pageNum);
                }
            }
        } catch (error) {
            console.error('Error loading file:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">${i18n.t('ocrPdfJS.failedToLoadPreview')}</p>`;
        } finally {
            loadingUI.hide();
        }
    }

    // FIXED: This is now a regular function, not using 'this'
    async function generatePageBatch(pdfDoc, pageNumbers) {
        const canvases = [];

        for (const pageNum of pageNumbers) {
            try {
                const page = await pdfDoc.getPage(pageNum);

                // FIXED: Call standalone function, not this.calculateOptimalScale
                const scale = calculateOptimalScale(page);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({ canvasContext: context, viewport }).promise;
                canvases.push(canvas);

                console.log(`Created canvas for page ${pageNum}: ${canvas.width}x${canvas.height} (${Math.round((canvas.width * canvas.height * 4) / (1024 * 1024))}MB)`);

            } catch (error) {
                console.error(`Failed to render page ${pageNum}:`, error);
                const emptyCanvas = document.createElement('canvas');
                emptyCanvas.width = 1;
                emptyCanvas.height = 1;
                canvases.push(emptyCanvas);
            }
        }
        return canvases;
    }

    // FIXED: Standalone function, not part of any object
    function calculateOptimalScale(page) {
        const viewport = page.getViewport({ scale: 1.0 });
        const area = viewport.width * viewport.height;
        const MAX_AREA = 1920 * 1080;

        if (area > MAX_AREA) {
            const scale = Math.sqrt(MAX_AREA / area);
            return Math.max(scale, 1.5);
        }
        return 3.0;
    }

    // NEW: Optimized batch processing function
    async function generateOcrCanvasesBatch(pdfPath, progressCallback = null) {
        const loadingTask = pdfjsLib.getDocument(`file://${pdfPath}`);
        const ocrPdfDoc = await loadingTask.promise;

        const pagesToProcess = selectedPages.size > 0
            ? Array.from(selectedPages).sort((a, b) => a - b)
            : Array.from({ length: ocrPdfDoc.numPages }, (_, i) => i + 1);

        const ocrCanvases = [];
        const BATCH_SIZE = 2;
        const totalBatches = Math.ceil(pagesToProcess.length / BATCH_SIZE);

        console.log(`Processing ${pagesToProcess.length} pages in ${totalBatches} batches...`);

        // Show performance warning for large files
        if (pagesToProcess.length > 10) {
            batchPerformanceWarning.style.display = 'block';
        }

        for (let batchIndex = 0; batchIndex < pagesToProcess.length; batchIndex += BATCH_SIZE) {
            if (batchProcessingCancelled) {
                throw new Error('OCR cancelled by user');
            }

            const batchEnd = Math.min(batchIndex + BATCH_SIZE, pagesToProcess.length);
            const batchPages = pagesToProcess.slice(batchIndex, batchEnd);
            const batchNumber = Math.floor(batchIndex / BATCH_SIZE) + 1;

            if (progressCallback) {
                progressCallback(batchIndex, pagesToProcess.length,
                    `Processing batch ${batchNumber}/${totalBatches} (pages ${batchPages[0]}-${batchPages[batchPages.length - 1]})`);
            }

            const batchCanvases = await generatePageBatch(ocrPdfDoc, batchPages);
            ocrCanvases.push(...batchCanvases);
            // Update batch status dots
            updateBatchStatusDots(batchNumber, totalBatches, 'active');
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await ocrPdfDoc.destroy();
        return ocrCanvases;
    }

    // NEW: Batch status visualization
    function updateBatchStatusDots(currentBatch, totalBatches, status = 'active') {
        batchStatusDots.innerHTML = '';
        for (let i = 1; i <= totalBatches; i++) {
            const dot = document.createElement('div');
            dot.className = 'batch-dot';

            if (i < currentBatch) {
                dot.classList.add('completed');
            } else if (i === currentBatch) {
                dot.classList.add(status);
            }
            batchStatusDots.appendChild(dot);
        }
    }

    async function renderPageThumbnail(pageNum, forOCR = false) {
        const page = await pdfDoc.getPage(pageNum);
        const scale = forOCR ? 2.0 : 0.3;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context, viewport }).promise;

        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'page-thumbnail';
        thumbWrapper.dataset.pageNum = pageNum;

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = `Page ${pageNum}`;

        thumbWrapper.appendChild(canvas);
        thumbWrapper.appendChild(pageLabel);

        if (!isImageFile) {
            thumbWrapper.addEventListener('click', () => {
                togglePageSelection(pageNum, thumbWrapper);
            });
            thumbWrapper.style.cursor = 'pointer';
        }

        previewGrid.appendChild(thumbWrapper);

        if (forOCR) {
            return canvas;
        } else {
            renderedPages.push(canvas);
        }
    }

    function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
        renderedPages.forEach(c => {
            if (c.getContext) {
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, c.width, c.height);
            }
        });
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        selectedPages.clear();
        totalPages = 0;
        pageOptionsContainer.style.display = 'none';
        selectionInfoEl.style.display = 'none';
        selectionInfoEl.textContent = '';
        manualPagesInput.value = '';
        pageRangesInput.value = '';
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        updateProcessButtonState();
    }

    async function getFileSize(filePath) {
        try {
            const fileInfo = await window.electronAPI.getFileInfo(filePath);
            return fileInfo.size;
        } catch {
            return 0;
        }
    }

    async function cleanupDroppedFile() {
        if (droppedFilePath) {
            try {
                await window.electronAPI.deleteFile(droppedFilePath);
            } catch (err) {
                console.error('Error deleting dropped file:', err);
            }
        }
    }

    function updateProcessButtonState() {
        processBtn.disabled = !selectedFile;
    }

    initializeGlobalDragDropForOCR({
        onFilesDropped: async (files) => {
            if (files.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('ocrPdfJS.dropPdfOrImage'), ['OK']);
                return;
            }
            await cleanupDroppedFile();
            const file = files[0];
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
                    size: fileSize,
                    isImage: /\.(jpg|jpeg|png|bmp|tiff)$/i.test(file.name)
                });
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('ocrPdfJS.dropPdfOrImage'), ['OK']);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('ocrPdfJS.dropPdfOrImage'), ['OK']);
        }
    });

    // NEW: UPDATED PROCESS BUTTON HANDLER WITH BATCH PROCESSING
    processBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.warning'), i18n.t('ocrPdfJS.selectFileFirst'), ['OK']);
            return;
        }

        if (!isImageFile && selectedPages.size === 0) {
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('ocrPdfJS.selectPages'), ['OK']);
            return;
        }

        if (selectedLanguages.size === 0) {
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('ocrPdfJS.selectLanguages'), ['OK']);
            return;
        }

        const languageArray = Array.from(selectedLanguages).sort();
        const languageString = languageArray.join('+');
        const languageDisplay = languageArray.length === 1 ? langNames[languageArray[0]] : `${languageArray.length} languages`;

        // Reset batch processing state
        batchProcessingCancelled = false;
        const startTime = Date.now();

        // Show batch progress modal
        batchProgressModal.style.display = 'flex';
        batchCurrentAction.textContent = i18n.t('ocrPdfJS.initializingOcr');
        batchProgressFill.style.width = '0%';
        batchTotalPages.textContent = selectedPages.size > 0 ? selectedPages.size : totalPages;
        batchCurrentPage.textContent = '0';
        batchTimeElapsed.textContent = '0s';
        batchPerformanceWarning.style.display = 'none';

        // Clear previous batch dots
        batchStatusDots.innerHTML = '';

        // Cancel button handler
        batchCancelBtn.onclick = () => {
            batchProcessingCancelled = true;
            batchCurrentAction.textContent = 'Cancelling...';
            batchCancelBtn.disabled = true;
        };

        // Update time periodically
        const timeInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            batchTimeElapsed.textContent = `${elapsed}s`;
        }, 1000);

        try {
            // Initialize Tesseract
            updateBatchProgress(5, `Initializing Tesseract (${languageDisplay})...`);
            await tesseractOcr.initialize(languageString);

            let extractedText;
            if (isImageFile) {
                // Process single image
                updateBatchProgress(20, 'Processing image...');
                extractedText = await tesseractOcr.extractTextFromImage(selectedFile.path);
                updateBatchProgress(100, 'Image processing complete!');
            } else {
                // Process PDF with batch processing
                const pagesToProcess = selectedPages.size > 0
                    ? Array.from(selectedPages).sort((a, b) => a - b)
                    : Array.from({ length: totalPages }, (_, i) => i + 1);

                const totalPagesToProcess = pagesToProcess.length;
                batchTotalPages.textContent = totalPagesToProcess;

                // Show warning for large files
                if (totalPagesToProcess > 20) {
                    batchPerformanceWarning.style.display = 'block';
                }

                // Generate canvases in batches
                updateBatchProgress(10, 'Generating high-resolution pages for OCR...');

                const progressCallback = (processed, total, message) => {
                    if (batchProcessingCancelled) {
                        throw new Error('OCR cancelled by user');
                    }

                    const percent = 10 + Math.round((processed / total) * 40);
                    updateBatchProgress(percent, message || `Loading pages...`);
                    batchCurrentPage.textContent = processed;
                };

                const ocrCanvases = await generateOcrCanvasesBatch(selectedFile.path, progressCallback);

                // OCR with progress tracking
                updateBatchProgress(60, 'Running OCR on pages...');

                const ocrProgressCallback = (processed, total) => {
                    if (batchProcessingCancelled) {
                        throw new Error('OCR cancelled by user');
                    }

                    const percent = 60 + Math.round((processed / total) * 35);
                    updateBatchProgress(percent, `OCR: Page ${processed} of ${total}`);
                    batchCurrentPage.textContent = processed;

                    // Update batch dots
                    const currentBatch = Math.ceil(processed / 2); // Assuming batch size of 2
                    const totalBatches = Math.ceil(total / 2);
                    updateBatchStatusDots(currentBatch, totalBatches, 'active');
                };

                extractedText = await tesseractOcr.extractTextFromPdfCanvasesWithProgress(
                    ocrCanvases,
                    ocrProgressCallback,
                    2 // Batch size for OCR
                );

                updateBatchProgress(100, 'OCR completed successfully!');
            }

            if (batchProcessingCancelled) {
                throw new Error('OCR cancelled by user');
            }

            // Save result
            updateBatchProgress(100, 'Saving text file...');
            const fileName = selectedFile.name.replace(/\.[^/.]+$/, "") + '_ocr.txt';
            await window.electronAPI.saveTextFile(fileName, extractedText);

            // Hide progress modal
            batchProgressModal.style.display = 'none';
            clearInterval(timeInterval);

            await customAlert.alert(i18n.t('alerts.success'), i18n.t('ocrPdfJS.successMsg'), ['OK']);

        } catch (error) {
            console.error('OCR processing failed:', error);

            // Hide progress modal
            batchProgressModal.style.display = 'none';
            clearInterval(timeInterval);

            if (error.message === 'OCR cancelled by user' || batchProcessingCancelled) {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('ocrPdfJS.cancelledMsg'), ['OK']);
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('ocrPdfJS.errorOcr') + error.message, ['OK']);
            }
        } finally {
            loadingUI.forceHide();
            batchCancelBtn.disabled = false;
        }
    });

    // NEW: Helper function for batch progress
    function updateBatchProgress(percent, message = '') {
        if (batchProgressFill) {
            batchProgressFill.style.width = `${percent}%`;
        }
        if (batchCurrentAction && message) {
            batchCurrentAction.textContent = message;
        }
    }

    function objectToFormData(obj) {
        const formData = new FormData();
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && !(obj[key] instanceof Blob)) {
                    formData.append(key, JSON.stringify(obj[key]));
                } else {
                    formData.append(key, obj[key]);
                }
            }
        }
        return formData;
    }
});