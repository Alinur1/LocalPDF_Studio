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


// src/preload/preload.js

const { contextBridge, ipcRenderer, app } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
    selectPdfs: () => ipcRenderer.invoke('select-pdf-files'),
    selectPdfsAndImages: () => ipcRenderer.invoke('select-pdf-and-image-files'),
    openExternal: (url) => ipcRenderer.send('open-external-link', url),
    getFileInfo: (path) => {
        try {
            const stats = fs.statSync(path);
            return Promise.resolve({ size: stats.size });
        } catch (err) {
            return Promise.resolve({ size: 0 });
        }
    },
    saveMergedPdf: (buffer) => ipcRenderer.invoke('save-merged-pdf', buffer),
    saveZipFile: (filename, buffer) => ipcRenderer.invoke('save-zip-file', { filename, buffer }),
    savePdfFile: (filename, buffer) => ipcRenderer.invoke('save-pdf-file', { filename, buffer }),
    saveTextFile: (filename, text) => ipcRenderer.invoke('save-text-file', { filename, text }),
    savePdfWithMetadata: (filePath, metadata) => ipcRenderer.invoke('save-pdf-with-metadata', { filePath, metadata }),
    getApiPort: () => ipcRenderer.invoke('get-api-port'),
    isSnap: () => ipcRenderer.invoke('is-snap'),
    resolveAsset: async (relativePath) => {
        try {
            const isPackaged = await ipcRenderer.invoke('is-app-packaged');
            const basePath = isPackaged
                ? process.resourcesPath
                : path.resolve(__dirname, '../../');
            return `file://${path.join(basePath, 'assets', relativePath)}`;
        } catch (err) {
            console.error('Error resolving asset path:', err);
            return '';
        }
    },
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (event, filePath) => callback(filePath)),
    getQueuedPdfFiles: () => ipcRenderer.invoke('get-queued-pdf-files'),
    saveDroppedFile: (fileInfo) => ipcRenderer.invoke('save-dropped-file', fileInfo),
    deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
    performTesseractOCR: (imagePath, language, options) => ipcRenderer.invoke('perform-tesseract-ocr', { imagePath, language, options }),  
    performTesseractPDFOCR: (pages, language, options) => ipcRenderer.invoke('perform-tesseract-pdf-ocr', { pages, language, options }),    
    getTesseractLanguages: () => ipcRenderer.invoke('get-tesseract-languages'),    
    onTesseractProgress: (callback) => ipcRenderer.on('tesseract-progress', (event, progress) => callback(progress))
});
