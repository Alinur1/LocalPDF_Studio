// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

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
    }
});
