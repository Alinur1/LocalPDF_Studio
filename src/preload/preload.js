// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectPdfs: () => ipcRenderer.invoke('select-pdf-files'),
    openExternal: (url) => ipcRenderer.send('open-external-link', url)
});
