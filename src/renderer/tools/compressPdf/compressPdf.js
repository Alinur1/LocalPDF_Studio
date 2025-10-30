/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


// src/renderer/tools/compressPdf/compressPdf.js

import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';

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

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show("Selecting PDF files...");
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);
            handleFileSelected({ path: filePath, name: fileName, size: fileSize });
        }
        loadingUI.hide();
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

    compressBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            await customAlert.alert('LocalPDF Studio - NOTICE', 'Please select a file first.', ['OK']);
            return;
        }
        const quality = getSelectedQuality();
        const options = buildCompressOptions(quality);
        const requestBody = {
            filePath: selectedFile.path,
            options: options
        };
        try {
            loadingUI.show('Compressing PDF...This may take a while for large files.');
            compressBtn.disabled = true;
            compressBtn.textContent = 'Compressing...';            
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
            const originalSize = parseInt(response.headers.get('X-Original-Size') || '0');
            const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0');
            const compressionRatio = parseFloat(response.headers.get('X-Compression-Ratio') || '0');
            const result = await response.blob();
            const arrayBuffer = await result.arrayBuffer();
            const defaultName = `${selectedFile.name.replace('.pdf', '')}_compressed.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
            if (savedPath) {
                const message = originalSize > 0
                    ? `Success! PDF compressed successfully!\n\n` +
                    `Original Size: ${formatFileSize(originalSize)}\n` +
                    `Compressed Size: ${formatFileSize(compressedSize)}\n` +
                    `Space Saved: ${compressionRatio.toFixed(1)}%\n\n` +
                    `Saved to: ${savedPath}`
                    : `Success! PDF compressed successfully!\nSaved to: ${savedPath}`;
                await customAlert.alert('LocalPDF Studio - SUCCESS', message, ['OK']);
            } else {
                await customAlert.alert('LocalPDF Studio - WARNING', 'Operation cancelled or failed to save the file.', ['OK']);
            }
        } catch (error) {            
            console.error('Error compressing PDF:', error);
            await customAlert.alert('LocalPDF Studio - ERROR', `An error occurred while compressing the PDF:\n${error.message}`, ['OK']);
        } finally {
            loadingUI.hide();
            compressBtn.disabled = false;
            compressBtn.textContent = 'Compress PDF';
        }
    });

    function buildCompressOptions(quality) {
        let qualityEnum;
        let customQuality = null;

        switch (quality.level) {
            case 'low':
                qualityEnum = 0;
                break;
            case 'medium':
                qualityEnum = 1;
                break;
            case 'high':
                qualityEnum = 2;
                break;
            case 'custom':
                qualityEnum = 3;
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
});
