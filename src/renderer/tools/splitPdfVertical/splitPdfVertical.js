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


// src/renderer/tools/splitPdfVertical/splitPdfVertical.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import loadingUI from '../../utils/loading.js';
import { ThemeManager } from '../../utils/themeManager.js';
import i18n from '../../utils/i18n.js';
import { pathToFileURL } from '../../utils/fileUrl.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const splitBtn = document.getElementById('split-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const previewContainer = document.getElementById('preview-container');
    const previewGrid = document.getElementById('preview-grid');
    const pageCountEl = document.getElementById('page-count');
    const splitModeRadios = document.querySelectorAll('input[name="splitMode"]');
    const optionsCustom = document.getElementById('optionsCustom');
    const slider = document.getElementById('split-slider');
    const percentageInput = document.getElementById('split-percentage');
    const visualLeft = document.getElementById('visual-left');
    const labelLeft = document.getElementById('label-left');
    const labelRight = document.getElementById('label-right');

    let selectedFile = null;
    let droppedFilePath = null;
    let pdfDoc = null;
    let renderedPages = [];

    splitModeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            optionsCustom.style.display = radio.value === 'custom' ? 'block' : 'none';
        });
    });

    function updateVisualPreview(value) {
        const pct = Math.min(99, Math.max(1, value));
        const right = 100 - pct;
        visualLeft.style.width = `${pct}%`;
        labelLeft.textContent = `Left — ${pct}%`;
        labelRight.textContent = `Right — ${right}%`;
    }

    slider.addEventListener('input', () => {
        const val = parseInt(slider.value, 10);
        percentageInput.value = val;
        updateVisualPreview(val);
    });

    percentageInput.addEventListener('input', () => {
        let val = parseInt(percentageInput.value, 10);
        if (isNaN(val)) return;
        val = Math.min(99, Math.max(1, val));
        slider.value = val;
        updateVisualPreview(val);
    });

    updateVisualPreview(50);

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('splitPdfVerticalJS.selecting-pdf'));
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
        await loadPdfPreview(file.path);
        updateSplitButtonState();
    }

    async function loadPdfPreview(filePath) {
        loadingUI.show(i18n.t('splitPdfVerticalJS.loading-preview'));
        try {
            previewContainer.style.display = 'block';
            const fileUrl = pathToFileURL(filePath);
            const loadingTask = pdfjsLib.getDocument(fileUrl);
            pdfDoc = await loadingTask.promise;
            pageCountEl.textContent = `Total Pages: ${pdfDoc.numPages}`;
            previewGrid.innerHTML = '';
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                await renderPageThumbnail(pageNum);
            }
        } catch (error) {
            console.error('Error loading PDF:', error);
            previewGrid.innerHTML = `<p style="color: #e74c3c; text-align: center;">Failed to load preview.</p>`;
        } finally {
            loadingUI.hide();
        }
    }

    async function renderPageThumbnail(pageNum) {
        const page = await pdfDoc.getPage(pageNum);
        const scale = 0.3;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;

        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = 'page-thumbnail';
        thumbWrapper.dataset.pageNum = pageNum;

        const pageLabel = document.createElement('div');
        pageLabel.className = 'page-label';
        pageLabel.textContent = `Page ${pageNum}`;

        thumbWrapper.appendChild(canvas);
        thumbWrapper.appendChild(pageLabel);
        previewGrid.appendChild(thumbWrapper);
        renderedPages.push(canvas);
    }

    function clearAll(preserveDroppedFilePath = false) {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        renderedPages.forEach(c => {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        });
        renderedPages = [];
        previewGrid.innerHTML = '';
        previewContainer.style.display = 'none';
        selectedFile = null;
        if (!preserveDroppedFilePath) droppedFilePath = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        updateSplitButtonState();
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
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfVerticalJS.drop-pdf'), [i18n.t('common.ok')]);
                return;
            }
            await cleanupDroppedFile();
            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });

            if (result.success) {
                droppedFilePath = result.filePath;
                handleFileSelected({ path: result.filePath, name: file.name, size: file.size || 0 });
            } else {
                console.log('Failed to save dropped file: ' + result.error);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfVerticalJS.pdf-drop-failed'), [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfVerticalJS.drop-a-pdf'), [i18n.t('common.ok')]);
        }
    });

    function updateSplitButtonState() {
        splitBtn.disabled = !selectedFile;
    }

    splitBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('splitPdfVerticalJS.pdf-required'), [i18n.t('common.ok')]);
            return;
        }

        const mode = document.querySelector('input[name="splitMode"]:checked').value;
        let splitPercentage = 50;

        if (mode === 'custom') {
            const raw = parseInt(percentageInput.value, 10);
            if (isNaN(raw) || raw < 1 || raw > 99) {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfVerticalJS.enter-split-position'), [i18n.t('common.ok')]);
                return;
            }
            splitPercentage = raw;
        }

        const requestBody = {
            filePath: selectedFile.path,
            splitPercentage: splitPercentage
        };

        try {
            loadingUI.show(i18n.t('splitPdfVerticalJS.splitting-pdf'));
            splitBtn.disabled = true;
            splitBtn.textContent = i18n.t('splitPdfVerticalJS.splitting');

            const endpoint = await API.pdf.verticalSplit;
            const result = await API.request.post(endpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = `${selectedFile.name.replace('.pdf', '')}_vertical_split.zip`;
                const savedPath = await window.electronAPI.saveZipFile(defaultName, arrayBuffer);

                if (savedPath) {
                    await customAlert.alert(i18n.t('alerts.success'), i18n.t('splitPdfVerticalJS.split-success'), [i18n.t('common.ok')]);
                } else {
                    await customAlert.alert(i18n.t('alerts.warning'), i18n.t('splitPdfVerticalJS.split-save-cancelled'), [i18n.t('common.ok')]);
                }
            } else {
                console.error('Vertical split API returned JSON:', result);
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfVerticalJS.unexpected-response'), [i18n.t('common.ok')]);
            }
        } catch (error) {
            console.error('Error splitting PDF vertically:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('splitPdfVerticalJS.failed-to-split'), [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            splitBtn.disabled = false;
            splitBtn.textContent = i18n.t('splitPdfVerticalJS.split-btn');
            updateSplitButtonState();
        }
    });
});