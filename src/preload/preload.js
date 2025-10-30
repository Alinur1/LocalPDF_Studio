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


// src/preload/preload.js

const { contextBridge, ipcRenderer, app } = require('electron');
const fs = require('fs');
const path = require('path');

// Global drag and drop prevention
document.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
});

document.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
});

contextBridge.exposeInMainWorld('electronAPI', {
    selectPdfs: () => ipcRenderer.invoke('select-pdf-files'),
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
    getApiPort: () => ipcRenderer.invoke('get-api-port'),
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
    }
});
