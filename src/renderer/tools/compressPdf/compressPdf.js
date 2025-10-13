// src/renderer/tools/compressPdf/compressPdf.js

import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const compressBtn = document.getElementById('compress-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');

    const qualityRadios = document.querySelectorAll('input[name="quality"]');
    const customQualitySection = document.getElementById('custom-quality-section');
    const customQualitySlider = document.getElementById('custom-quality-slider');
    const qualityValue = document.getElementById('quality-value');

    const removeMetadataCheckbox = document.getElementById('remove-metadata');
    const removeUnusedCheckbox = document.getElementById('remove-unused');



    let selectedFile = null;

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

    function handleFileSelected(file) {
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${formatFileSize(file.size)})`;
        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';
        compressBtn.disabled = false;
    }

    function clearAll() {
        selectedFile = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        compressBtn.disabled = true;
    }

    // --- Quality Selection ---
    qualityRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'custom') {
                customQualitySection.style.display = 'block';
            } else {
                customQualitySection.style.display = 'none';
            }
        });
    });

    customQualitySlider.addEventListener('input', () => {
        qualityValue.textContent = customQualitySlider.value;
    });





    function getSelectedQuality() {
        const selected = document.querySelector('input[name="quality"]:checked');
        if (selected.value === 'custom') {
            return {
                level: 'custom',
                value: parseInt(customQualitySlider.value)
            };
        }
        return { level: selected.value };
    }

    // --- Compress PDF ---
    compressBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio', 'Please select a file first.', ['OK']);
            return;
        }

        const quality = getSelectedQuality();
        const options = buildCompressOptions(quality);

        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };

        try {
            compressBtn.disabled = true;
            compressBtn.textContent = 'Compressing...';
            showLoading('Compressing PDF...<br><small>This may take a while for large files</small>');

            const compressEndpoint = await API.pdf.compress;
            const response = await fetch(compressEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `Request failed with status ${response.status}`);
            }

            // Get compression stats from headers
            const originalSize = parseInt(response.headers.get('X-Original-Size') || '0');
            const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0');
            const compressionRatio = parseFloat(response.headers.get('X-Compression-Ratio') || '0');

            const result = await response.blob();
            const arrayBuffer = await result.arrayBuffer();
            const defaultName = `${selectedFile.name.replace('.pdf', '')}_compressed.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

            hideLoading();

            if (savedPath) {
                const message = originalSize > 0
                    ? `Success! PDF compressed successfully!\n\n` +
                    `Original Size: ${formatFileSize(originalSize)}\n` +
                    `Compressed Size: ${formatFileSize(compressedSize)}\n` +
                    `Space Saved: ${compressionRatio.toFixed(1)}%\n\n` +
                    `Saved to: ${savedPath}`
                    : `Success! PDF compressed successfully!\nSaved to: ${savedPath}`;

                await customAlert.alert('LocalPDF Studio', message, ['OK']);
            } else {
                await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
            }
        } catch (error) {
            hideLoading();
            console.error('Error compressing PDF:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred while compressing the PDF:\n${error.message}`, ['OK']);
        } finally {
            compressBtn.disabled = false;
            compressBtn.textContent = 'Compress PDF';
        }
    });

    function buildCompressOptions(quality) {
        let qualityEnum;
        let customQuality = null;

        switch (quality.level) {
            case 'low':
                qualityEnum = 0; // CompressionQuality.Low
                break;
            case 'medium':
                qualityEnum = 1; // CompressionQuality.Medium
                break;
            case 'high':
                qualityEnum = 2; // CompressionQuality.High
                break;
            case 'custom':
                qualityEnum = 3; // CompressionQuality.Custom
                customQuality = quality.value;
                break;
            default:
                qualityEnum = 1;
        }

        return {
            quality: qualityEnum,
            customQuality: customQuality,
            removeMetadata: removeMetadataCheckbox.checked,
            removeUnusedObjects: removeUnusedCheckbox.checked
        };
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
            document.getElementById('loading-message').innerHTML = message;
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