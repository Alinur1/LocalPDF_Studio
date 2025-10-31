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


// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const gotTheLock = app.requestSingleInstanceLock();

let apiProcess = null;
let apiPort = null;
let mainWindow = null;

function startBackend() {
    return new Promise((resolve, reject) => {
        let backendDir = '';
        let backendFile = '';

        switch (process.platform) {
            case 'win32':
                backendDir = './assets/backend_win';
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

        if (!fs.existsSync(backendPath)) {
            const errorMsg = `Backend executable not found at: ${backendPath}`;
            console.error(errorMsg);
            dialog.showErrorBox('Backend Not Found', errorMsg);
            reject(new Error(errorMsg));
            return;
        }

        try {
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
                apiPort = null;
            });

            apiProcess.on('exit', (code) => {
                console.log(`Backend process exited with code ${code}`);
                apiProcess = null;
                apiPort = null;
            });

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
    const base_path = app.isPackaged ? process.resourcesPath : app.getAppPath();
    let iconPath;
    if (process.platform === 'win32') {
        iconPath = path.join(base_path, 'assets/icons/app_icon.ico');
    } else if (process.platform === 'darwin') {
        iconPath = path.join(base_path, 'assets/icons/app_icon_mac.icns');
    } else {
        iconPath = path.join(base_path, 'assets/icons/app_icon_linux.png');
    }
    return fs.existsSync(iconPath) ? iconPath : undefined;
};

const createWindow = () => {
    //Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({
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

    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:') return;
        event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.maximize();
    mainWindow.loadFile(path.resolve(app.getAppPath(), 'src/renderer/index.html'));
};

function setupAutoUpdater() {
    autoUpdater.autoDownload = process.platform !== 'linux'; // skip auto-download on Linux

    autoUpdater.on('update-available', () => {
        if (process.platform === 'linux' && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Available',
                message: 'A new version of LocalPDF Studio is available!',
                detail: 'Auto-update is not supported on Linux (.AppImage). Do you want to open the download page?',
                buttons: ['Open Download Page', 'Later']
            }).then(result => {
                if (result.response === 0) {
                    shell.openExternal('https://github.com/Alinur1/LocalPDF_Studio/releases/latest');
                }
            });
        } else if (mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Available',
                message: 'A new version of LocalPDF Studio is available and will be downloaded automatically.'
            });
        }
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox(mainWindow, {
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
        if (process.platform === 'linux' && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Update Check Failed',
                message: 'Could not check for updates automatically.',
                detail: 'You can check manually on the releases page.',
                buttons: ['Open Download Page', 'Ignore']
            }).then(result => {
                if (result.response === 0) {
                    shell.openExternal('https://github.com/Alinur1/LocalPDF_Studio/releases/latest');
                }
            });
        }
    });

    // Trigger automatic check
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 60000);
}

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
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            await startBackend();
            createWindow();
            setupAutoUpdater();
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
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.warn('get-api-port called with no active window');
    }
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

ipcMain.handle('is-app-packaged', () => app.isPackaged);