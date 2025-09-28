// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path'); // 👈 ADD THIS

const createWindow = () => {
    Menu.setApplicationMenu(null);
    const win = new BrowserWindow({
        minWidth: 700,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'), // 👈 adjust relative path
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.maximize();
    win.loadFile('src/renderer/index.html');
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
    // Security check: ensure the URL is a web link.
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

    if (result.canceled) return [];
    return result.filePaths;
});
