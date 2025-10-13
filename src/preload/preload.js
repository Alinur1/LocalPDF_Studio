// src/preload/preload.js

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

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
    getApiPort: () => ipcRenderer.invoke('get-api-port')
});
