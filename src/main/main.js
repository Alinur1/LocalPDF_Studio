// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const gotTheLock = app.requestSingleInstanceLock();

let apiProcess = null;
let apiPort = null;

function startBackend() {
    return new Promise((resolve, reject) => {
        let backendDir = '';
        let backendFile = '';

        switch (process.platform) {
            case 'win32':
                backendDir = './assets/backend_windows';
                backendFile = 'LocalPDF_Studio_api.exe';
                break;
            case 'linux':
                backendDir = './assets/backend_linux';
                backendFile = 'LocalPDF_Studio_api';
                break;
            case 'darwin':
                backendDir = './assets/backend_macos';
                backendFile = 'LocalPDF_Studio_api';
                break;
            default:
                const errorMsg = `Your OS (${process.platform}) is not supported.`;
                dialog.showErrorBox('Unsupported OS', errorMsg);
                reject(new Error(errorMsg));
                return;
        }

        const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath();
        const backendPath = path.join(appPath, backendDir, backendFile);

        // Check if backend exists
        if (!fs.existsSync(backendPath)) {
            const errorMsg = `Backend executable not found at: ${backendPath}`;
            console.error(errorMsg);
            dialog.showErrorBox('Backend Not Found', errorMsg);
            reject(new Error(errorMsg));
            return;
        }

        try {
            // Set executable permissions for Linux/macOS
            if (process.platform === 'linux' || process.platform === 'darwin') {
                try {
                    fs.chmodSync(backendPath, 0o755);
                } catch (chmodErr) {
                    console.warn(`Could not set executable permissions: ${chmodErr.message}`);
                }
            }

            console.log(`Starting backend from: ${backendPath}`);
            apiProcess = spawn(backendPath);

            apiProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('Backend:', output);

                const match = output.match(/API_PORT:(\d+)/);
                if (match) {
                    apiPort = parseInt(match[1]);
                    console.log(`Backend started on port ${apiPort}`);
                    resolve(apiPort);
                }
            });

            apiProcess.stderr.on('data', (data) => {
                console.error('Backend Error:', data.toString());
            });

            apiProcess.on('error', (err) => {
                console.error('Failed to start backend:', err);
                reject(err);
            });

            apiProcess.on('close', (code) => {
                console.log(`Backend process exited with code ${code}`);
                apiProcess = null;
            });

            // Timeout in case port is never received
            setTimeout(() => {
                if (!apiPort) {
                    const errorMsg = 'Backend failed to start within 60 seconds. Please try again.';
                    console.error(errorMsg);
                    reject(new Error(errorMsg));
                }
            }, 60000);

        } catch (err) {
            console.error('Error starting backend:', err);
            reject(err);
        }
    });
}

const getIcon = () => {
    const appPath = app.getAppPath();
    let iconPath;
    if (process.platform === 'win32') {
        iconPath = path.join(appPath, 'assets/icons/app_icon.ico');
    } else if (process.platform === 'darwin') {
        iconPath = path.join(appPath, 'assets/icons/app_icon_mac.icns');
    } else {
        iconPath = path.join(appPath, 'assets/icons/app_icon_linux.png');
    }
    return fs.existsSync(iconPath) ? iconPath : undefined;
};

const createWindow = () => {
    Menu.setApplicationMenu(null);
    const win = new BrowserWindow({
        minWidth: 700,
        minHeight: 600,
        icon: getIcon(),
        webPreferences: {
            preload: path.resolve(app.getAppPath(), 'src/preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:') {
            return;
        }
        event.preventDefault();
    });

    win.maximize();
    win.loadFile(path.resolve(app.getAppPath(), 'src/renderer/index.html'));
};

if (!gotTheLock) {
    app.whenReady().then(() => {
        dialog.showMessageBoxSync({
            type: 'info',
            buttons: ['OK'],
            title: 'Already Running',
            message: 'LocalPDF Studio is already running.'
        });
    });
    app.quit();
} else {
    app.on('second-instance', () => {
        const existingWindow = BrowserWindow.getAllWindows()[0];
        if (existingWindow) {
            if (existingWindow.isMinimized()) existingWindow.restore();
            existingWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            await startBackend();
            createWindow();
            try {
                autoUpdater.autoDownload = true;
                autoUpdater.on('update-available', () => {
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'Update Available',
                        message: 'A new version of LocalPDF Studio is available and will be downloaded automatically.'
                    });
                });
                autoUpdater.on('update-downloaded', () => {
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'Update Ready',
                        message: 'An update has been downloaded. Restart LocalPDF Studio to apply it now?',
                        buttons: ['Restart', 'Later']
                    }).then(result => {
                        if (result.response === 0) autoUpdater.quitAndInstall();
                    });
                });
                autoUpdater.on('error', (err) => {
                    console.error('Auto-updater error:', err);
                });
                setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 60000);
            } catch (updateErr) {
                console.error('Update system failed to initialize:', updateErr);
            }
        } catch (err) {
            console.error('Failed to initialize app:', err);
            dialog.showErrorBox('Startup Error', `Failed to start the application backend.\n\nError: ${err.message}`);
            app.quit();
        }
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

app.on('window-all-closed', () => {
    // Kill the backend process
    if (apiProcess) {
        try {
            apiProcess.kill();
        } catch (err) {
            console.error('Error killing backend process:', err);
        }
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Ensure backend is killed on quit
    if (apiProcess) {
        try {
            apiProcess.kill();
        } catch (err) {
            console.error('Error killing backend process on quit:', err);
        }
    }
});

// IPC handler to get the API port
ipcMain.handle('get-api-port', () => {
    return apiPort;
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

ipcMain.handle('save-merged-pdf', async (event, arrayBuffer) => {
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

ipcMain.handle('save-zip-file', async (event, { filename, buffer }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [
            { name: 'ZIP Archive', extensions: ['zip'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (canceled || !filePath) {
        return null;
    }

    try {
        let nodeBuffer;
        if (Buffer.isBuffer(buffer)) {
            nodeBuffer = buffer;
        } else if (buffer instanceof ArrayBuffer) {
            nodeBuffer = Buffer.from(new Uint8Array(buffer));
        } else if (ArrayBuffer.isView(buffer)) {
            nodeBuffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } else {
            throw new Error("Unsupported buffer type received from renderer");
        }

        fs.writeFileSync(filePath, nodeBuffer);
        return filePath;
    } catch (err) {
        console.error("Failed to save file:", err);
        return null;
    }
});

ipcMain.handle('save-pdf-file', async (event, { filename, buffer }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
        return null;
    }

    try {
        let nodeBuffer;
        if (Buffer.isBuffer(buffer)) {
            nodeBuffer = buffer;
        } else if (buffer instanceof ArrayBuffer) {
            nodeBuffer = Buffer.from(new Uint8Array(buffer));
        } else if (ArrayBuffer.isView(buffer)) {
            nodeBuffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } else {
            throw new Error("Unsupported buffer type received from renderer");
        }

        fs.writeFileSync(filePath, nodeBuffer);
        return filePath;
    } catch (err) {
        console.error("Failed to save file:", err);
        return null;
    }
});
