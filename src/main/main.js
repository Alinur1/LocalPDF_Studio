// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path');
const fs = require('fs');

const createWindow = () => {
    //Menu.setApplicationMenu(null);

    const win = new BrowserWindow({
        minWidth: 700,
        minHeight: 600,
        webPreferences: {
            preload: path.resolve(app.getAppPath(), 'src/preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.maximize();
    win.loadFile(path.resolve(app.getAppPath(), 'src/renderer/index.html'));
};

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('open-external-link', (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
    } else {
        console.warn(`Blocked attempt to open non-web URL: ${url}`);
    }
});

ipcMain.handle('select-pdf-files', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('save-merged-pdf', async (event, arrayBuffer) => { // Renamed 'buffer' to 'arrayBuffer' for clarity
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Merged PDF',
        defaultPath: 'merged.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
        return { success: false };
    }

    try {
        const buffer = Buffer.from(arrayBuffer);

        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (err) {
        console.error("Failed to save PDF:", err);
        return { success: false, error: err.message };
    }
});

