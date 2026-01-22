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


// src/renderer/utils/globalDragDrop.js

export function initializeGlobalDragDrop(options = {}) {
    const { onFilesDropped, onInvalidFiles } = options;

    const overlay = document.createElement('div');
    overlay.id = 'global-drag-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        pointer-events: none;
    `;

    const message = document.createElement('div');
    message.style.cssText = `
        background: #3498db;
        color: white;
        padding: 2rem;
        border-radius: 12px;
        font-size: 1.5rem;
        font-weight: bold;
        text-align: center;
        border: 3px dashed white;
        box-shadow: 0 0 20px rgba(52, 152, 219, 0.8);
    `;
    message.textContent = '📄 Drop your files here';

    overlay.appendChild(message);
    document.body.appendChild(overlay);

    let dragCounter = 0;

    document.addEventListener('dragover', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('drop', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('dragenter', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item');
        if (isInternalDrag) return;

        dragCounter++;
        const dt = e.dataTransfer;

        if (dt.types && (dt.types.includes('Files') || dt.types.includes('application/x-moz-file'))) {
            overlay.style.display = 'flex';
            overlay.style.pointerEvents = 'auto';
        }
    });

    document.addEventListener('dragleave', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item');
        if (isInternalDrag) return;

        dragCounter--;
        if (dragCounter === 0) {
            overlay.style.display = 'none';
            overlay.style.pointerEvents = 'none';
        }
    });

    document.addEventListener('drop', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item');
        if (isInternalDrag) return;

        e.preventDefault();
        e.stopPropagation();

        dragCounter = 0;
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';

        const dt = e.dataTransfer;
        const files = dt.files;

        if (files && files.length > 0) {
            const fileArray = [...files];
            const pdfFiles = fileArray.filter(file => {
                const fileName = file.name || '';
                return fileName.toLowerCase().endsWith('.pdf');
            });

            if (pdfFiles.length === 0) {
                if (onInvalidFiles) {
                    onInvalidFiles();
                }
                return;
            }

            if (onFilesDropped) {
                onFilesDropped(pdfFiles);
            }
        }
    });

    document.addEventListener('dragover', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        // Check if this is an internal drag operation
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item');

        if (!isFormElement && !isInternalDrag) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        }
    });
}

export function initializeGlobalDragDropForOCR(options = {}) {
    const { onFilesDropped, onInvalidFiles } = options;

    const overlay = document.createElement('div');
    overlay.id = 'global-drag-overlay-ocr';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        pointer-events: none;
    `;

    const message = document.createElement('div');
    message.style.cssText = `
        background: #3498db;
        color: white;
        padding: 2rem;
        border-radius: 12px;
        font-size: 1.5rem;
        font-weight: bold;
        text-align: center;
        border: 3px dashed white;
        box-shadow: 0 0 20px rgba(52, 152, 219, 0.8);
    `;
    message.textContent = '📄 Drop your files here';

    overlay.appendChild(message);
    document.body.appendChild(overlay);

    let dragCounter = 0;

    document.addEventListener('dragover', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('drop', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('dragenter', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation (page or image)
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item') ||
            e.dataTransfer.types.includes('application/x-image-item');
        if (isInternalDrag) return;

        dragCounter++;
        const dt = e.dataTransfer;

        if (dt.types && (dt.types.includes('Files') || dt.types.includes('application/x-moz-file'))) {
            overlay.style.display = 'flex';
            overlay.style.pointerEvents = 'auto';
        }
    });

    document.addEventListener('dragleave', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation (page or image)
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item') ||
            e.dataTransfer.types.includes('application/x-image-item');
        if (isInternalDrag) return;

        dragCounter--;
        if (dragCounter === 0) {
            overlay.style.display = 'none';
            overlay.style.pointerEvents = 'none';
        }
    });

    document.addEventListener('drop', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        if (isFormElement) return;

        // Check if this is an internal drag operation (page or image)
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item') ||
            e.dataTransfer.types.includes('application/x-image-item');
        if (isInternalDrag) return;

        e.preventDefault();
        e.stopPropagation();

        dragCounter = 0;
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';

        const dt = e.dataTransfer;
        const files = dt.files;

        if (files && files.length > 0) {
            const fileArray = [...files];
            const supportedFiles = fileArray.filter(file => {
                const fileName = file.name || '';
                const isPdf = fileName.toLowerCase().endsWith('.pdf');
                const isImage = /\.(jpg|jpeg|png|bmp|tiff)$/i.test(fileName);
                return isPdf || isImage;
            });

            if (supportedFiles.length === 0) {
                if (onInvalidFiles) {
                    onInvalidFiles();
                }
                return;
            }

            if (onFilesDropped) {
                onFilesDropped(supportedFiles);
            }
        }
    });

    document.addEventListener('dragover', (e) => {
        const isFormElement = e.target.matches('input, textarea, [contenteditable]');
        // Check if this is an internal drag operation (page or image)
        const isInternalDrag = e.dataTransfer.types.includes('application/x-page-item') ||
            e.dataTransfer.types.includes('application/x-image-item');

        if (!isFormElement && !isInternalDrag) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        }
    });
}