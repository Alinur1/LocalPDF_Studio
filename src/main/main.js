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


// dotnet publish -c Release -r linux-x64 --self-contained true
// dotnet publish -c Release -r osx-x64 --self-contained true


// src/main/main.js
const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
const Tesseract = require('tesseract.js');
const gotTheLock = app.requestSingleInstanceLock();
const pdfTabsService = require('./services/pdfTabsService.js');

let apiProcess = null;
let apiPort = null;
let mainWindow = null;
let isDownloading = false;
let lastUpdateStatus = { status: 'No updates checked yet.', details: '' };
let openFileQueue = [];

// Helper to send or queue file paths to renderer
function queueOrSendOpenFile(filePath) {
    try {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('open-file', filePath);
        } else {
            openFileQueue.push(filePath);
        }
    } catch (err) {
        console.error('Failed to send open-file to renderer:', err);
        openFileQueue.push(filePath);
    }
}

// Register macOS open-file handler early so events are captured before ready
app.on('open-file', (event, filePath) => {
    try {
        event.preventDefault();
    } catch (e) { }
    if (filePath && /\.(pdf|md)$/i.test(filePath)) {
        queueOrSendOpenFile(filePath);
    }
});

// If the app was launched with PDF file paths in argv (common on Windows/Linux), queue them
try {
    if (process && process.argv && Array.isArray(process.argv)) {
        for (const a of process.argv) {
            if (typeof a === 'string' && /\.(pdf|md)$/i.test(a)) {
                console.log('Found PDF in argv:', a);
                queueOrSendOpenFile(path.resolve(a));
                //break;  // Only process the first PDF
            }
        }
    }
} catch (err) {
    console.error('Error scanning initial argv for PDF files:', err);
}

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
                backendDir = './assets/backend_mac';
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
    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({
        minWidth: 700,
        minHeight: 600,
        icon: getIcon(),
        backgroundColor: '#2c3e50',
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

    //Prevent PDF files from being opened in Chrome's PDF viewer
    mainWindow.webContents.on('will-prevent-unload', (event) => {
        event.preventDefault();
    });

    // Block navigation to PDF files
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.toLowerCase().endsWith('.pdf')) {
            console.log('Blocked PDF navigation:', url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('close', (event) => {
        if (isDownloading) {
            event.preventDefault();
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Update in Progress',
                message: 'An update is currently downloading. Please do not close the application.',
                buttons: ['OK']
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.maximize();
    mainWindow.loadFile(path.resolve(app.getAppPath(), 'src/renderer/index.html'));
};

function sendUpdateStatus(status, details = '') {
    lastUpdateStatus = { status, details };
    if (mainWindow) {
        mainWindow.webContents.send('update-status', lastUpdateStatus);
    }
}

function setupAutoUpdater() {
    if (process.platform === 'linux' && process.env.SNAP) {
        console.log('Snap detected — skipping manual auto-updater.');
        sendUpdateStatus('Snap package detected — updates are handled automatically by the Snap Store.');
        return;
    }

    autoUpdater.autoDownload = process.platform === 'win32';

    autoUpdater.on('checking-for-update', () => {
        sendUpdateStatus('Checking for update...');
    });

    autoUpdater.on('update-not-available', () => {
        sendUpdateStatus('No new update is available.');
    });

    autoUpdater.on('update-available', async (info) => {
        if (process.platform === 'linux') {
            try {
                sendUpdateStatus('Downloading update silently...');
                isDownloading = true;
                await autoUpdater.downloadUpdate();
            } catch (err) {
                console.error('Silent auto-update failed on Linux:', err);
                isDownloading = false;
                sendUpdateStatus('Auto-update failed', err.message || 'Unknown error');
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Manual Update Required',
                    message: 'LocalPDF Studio could not automatically update itself. Please download the latest version manually.',
                    detail: 'Would you like to manually download the latest version?',
                    buttons: ['Open Download Page', 'Later']
                }).then(result => {
                    if (result.response === 0) {
                        shell.openExternal('https://alinur1.github.io/LocalPDF_Studio_Website/');
                    }
                });
            }
        } else if (process.platform === 'darwin') {
            sendUpdateStatus('Update available!', `Version ${info.version} ready to download.`);
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Available',
                message: 'A new version is available. Automatic updates are disabled for macOS. Open download page?',
                buttons: ['Open Download Page', 'Later']
            }).then(result => {
                if (result.response === 0) {
                    shell.openExternal('https://alinur1.github.io/LocalPDF_Studio_Website/');
                }
            });
        } else {
            sendUpdateStatus('Downloading update...');
            isDownloading = true;
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const progress = progressObj.percent.toFixed(2);
        sendUpdateStatus('Downloading update...', `${progress}%`);
    });

    autoUpdater.on('update-downloaded', () => {
        isDownloading = false;
        sendUpdateStatus('Installing update...');
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
        isDownloading = false;
        const errorMessage = err == null ? "unknown" : (err.message || err).toString();
        sendUpdateStatus('Update check failed', errorMessage);
        if (process.platform === 'linux') {
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Update Error',
                message: 'Automatic update failed.',
                detail: 'Would you like to manually download the latest version?',
                buttons: ['Open Download Page', 'Ignore']
            }).then(result => {
                if (result.response === 0) {
                    shell.openExternal('https://alinur1.github.io/LocalPDF_Studio_Website/');
                }
            });
        }
    });

    ipcMain.on('check-for-updates', () => {
        autoUpdater.checkForUpdates();
    });

    ipcMain.handle('get-update-status', () => {
        return lastUpdateStatus;
    });

    setTimeout(() => autoUpdater.checkForUpdates(), 60000);
}

if (!gotTheLock) {
    console.log("LocalPDF Studio is already running.");
    // app.whenReady().then(() => {
    //     dialog.showMessageBoxSync({
    //         type: 'info',
    //         buttons: ['OK'],
    //         title: 'Already Running',
    //         message: 'LocalPDF Studio is already running.'
    //     });
    // });
    app.quit();
} else {
    app.on('second-instance', (event, argv, workingDirectory) => {
        // On Windows/Linux a second-instance event may include file paths in argv
        try {
            if (argv && Array.isArray(argv)) {
                // Look for PDF files in argv
                for (const arg of argv) {
                    if (typeof arg === 'string' && /\.(pdf|md)$/i.test(arg)) {
                        const resolvedPath = path.resolve(workingDirectory, arg);
                        console.log('Opening PDF from second-instance:', resolvedPath);
                        queueOrSendOpenFile(resolvedPath);
                        //break;  // Only process the first PDF
                    }
                }
            }
        } catch (err) {
            console.error('Error processing second-instance args:', err);
        }

        // Bring window to focus
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            cleanupTaskFolder(); // Clean up any orphaned files from previous session
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

// Provide queued PDF files to renderer on demand (renderer-pull instead of main-push)
ipcMain.handle('get-queued-files', async () => {
    if (openFileQueue.length === 0) return [];

    console.log(`Providing ${openFileQueue.length} queued PDF file(s) to renderer`);
    const filesToSend = [...openFileQueue];
    openFileQueue = []; // Clear queue after sending
    return filesToSend;
});

// Helper function to ensure LocalPDF_Studio_Task folder exists
function ensureTaskFolderExists() {
    const taskFolder = getTaskFolderPath();
    if (!fs.existsSync(taskFolder)) {
        try {
            fs.mkdirSync(taskFolder, { recursive: true });
            console.log(`Created LocalPDF_Studio_Task folder at: ${taskFolder}`);
        } catch (err) {
            console.error(`Failed to create LocalPDF_Studio_Task folder:`, err);
            throw err;
        }
    }
    return taskFolder;
}

// Helper function to clean up all files in the LocalPDF_Studio_Task folder
function cleanupTaskFolder() {
    try {
        const taskFolder = getTaskFolderPath();
        if (fs.existsSync(taskFolder)) {
            const files = fs.readdirSync(taskFolder);
            files.forEach(file => {
                const filePath = path.join(taskFolder, file);
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up orphaned file: ${filePath}`);
                }
            });
        }
    } catch (err) {
        console.error('Error cleaning up task folder:', err);
    }
}

// Helper function to get the LocalPDF_Studio_Task folder path in Downloads
function getTaskFolderPath() {
    let basePath;

    // Handle Snap with strict confinement
    if (process.platform === 'linux' && process.env.SNAP) {
        // Use snap-specific path for confined snaps
        basePath = process.env.SNAP_USER_DATA || process.env.HOME;
        console.log('Snap detected: using SNAP_USER_DATA for task folder');
    } else {
        // Use Downloads folder for Windows, macOS, and unconfined Linux
        basePath = app.getPath('downloads');
    }

    return path.join(basePath, 'LocalPDF_Studio_Task');
}

// When mainWindow finishes loading its content, flush queued files
app.on('browser-window-created', (event, window) => {
    // Queued files will be fetched by renderer when ready
});

app.on('window-all-closed', () => {
    if (apiProcess) {
        try {
            apiProcess.kill();
            console.log('Backend process stopped.');
        } catch (err) {
            console.error('Error killing backend process:', err);
        } finally {
            apiProcess = null;
            apiPort = null;
        }
    }

    setTimeout(() => app.quit(), 200);
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

// IPC handler to check if running as Snap
ipcMain.handle('is-snap', () => {
    return process.platform === 'linux' && !!process.env.SNAP;
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

ipcMain.handle('select-pdf-and-image-files', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'PDF and Image Files', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'bmp'] },
            { name: 'PDF Files', extensions: ['pdf'] },
            { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }
        ]
    });
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-markdown-files', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Markdown Files', extensions: ['md', 'markdown', 'txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('read-markdown-file', async (event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content;
    } catch (err) {
        console.error('Error reading markdown file:', err);
        throw err;
    }
});

ipcMain.handle('save-markdown-file-direct', async (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (err) {
        console.error('Error saving markdown file:', err);
        throw err;
    }
});

ipcMain.handle('export-markdown-to-pdf', async (event, { html, title, options = {} }) => {
    let tempHtmlPath = null;
    try {
        const { BrowserWindow } = require('electron');
        const path = require('path');
        const fs = require('fs');
        const os = require('os');
        const mdDir = options.mdFilePath ? path.dirname(options.mdFilePath) : os.tmpdir();
        tempHtmlPath = path.join(mdDir, `.localpdf-export-${Date.now()}.html`);

        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        });

        const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath();
        const cssPath = `file://${path.join(appPath, 'assets', 'css', 'github-markdown.css')}`;

        const fullHtml = `<!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <title>${title || 'Document'}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="${cssPath}">
            <style>
                body { padding: 0; margin: 0; background: #fff !important; }
                .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
                @media print {
                .markdown-body { padding: 20mm; max-width: 100%; }
                a { color: inherit; text-decoration: none; }
                pre, code { white-space: pre-wrap; word-break: break-word; }
                }
            </style>
            </head>
            <body>
            <article class="markdown-body">${html}</article>
            </body>
            </html>`;

        // Write temp HTML (fallback to os.tmpdir() if directory is read-only)
        try {
            fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8');
        } catch (writeErr) {
            console.warn('Could not write to markdown directory, falling back to temp folder:', writeErr.message);
            tempHtmlPath = path.join(os.tmpdir(), `.localpdf-export-${Date.now()}.html`);
            fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8');
        }

        await printWindow.loadFile(tempHtmlPath);
        await printWindow.webContents.insertCSS(`body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`);
        await new Promise(resolve => setTimeout(resolve, 800));

        const pdfBuffer = await printWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: options.pageSize || 'A4',
            margins: { marginType: 'default' },
            preferCSSPageSize: true
        });

        printWindow.close();
        return { success: true, data: Array.from(pdfBuffer) };
    } catch (err) {
        console.error('export-markdown-to-pdf error:', err);
        return { success: false, error: err.message };
    } finally {
        if (tempHtmlPath) {
            try { fs.unlinkSync(tempHtmlPath); } catch (_) { }
        }
    }
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
    let cleanFileName = filename;
    if (filename.includes('/') || filename.includes('\\')) {
        cleanFileName = filename.split(/[/\\]/).pop();
    }
    if (!cleanFileName) {
        cleanFileName = 'untitled_document.pdf';
    }
    let safeDefaultPath;
    try {
        safeDefaultPath = path.join(app.getPath('documents'), cleanFileName);
    } catch (e) {
        safeDefaultPath = path.join(app.getPath('downloads'), cleanFileName);
    }

    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: safeDefaultPath,
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
        console.error("Failed to save file across platform:", err);
        return null;
    }
});

ipcMain.handle('save-text-file', async (event, { filename, text }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });

    if (canceled || !filePath) {
        return { success: false };
    }

    try {
        // Convert text string to buffer if needed
        let nodeBuffer;
        if (typeof text === 'string') {
            nodeBuffer = Buffer.from(text, 'utf-8');
        } else if (Buffer.isBuffer(text)) {
            nodeBuffer = text;
        } else if (text instanceof ArrayBuffer) {
            nodeBuffer = Buffer.from(new Uint8Array(text));
        } else if (ArrayBuffer.isView(text)) {
            nodeBuffer = Buffer.from(text.buffer, text.byteOffset, text.byteLength);
        } else {
            throw new Error("Unsupported data type for text file");
        }

        fs.writeFileSync(filePath, nodeBuffer);
        return { success: true, path: filePath };
    } catch (err) {
        console.error("Failed to save text file:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('save-markdown-file', async (event, { filename, text }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    });

    if (canceled || !filePath) {
        return { success: false };
    }

    try {
        fs.writeFileSync(filePath, Buffer.from(text, 'utf-8'));
        return { success: true, path: filePath };
    } catch (err) {
        console.error("Failed to save markdown file:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('select-output-folder', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
});

ipcMain.handle('save-json-file', async (event, { filename, json }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return null;

    try {
        fs.writeFileSync(filePath, json, 'utf-8');
        return filePath;
    } catch (err) {
        console.error('Failed to save JSON file:', err);
        return null;
    }
});

ipcMain.handle('select-json-file', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
});

ipcMain.handle('read-json-file', async (event, filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        console.error('Failed to read JSON file:', err);
        return null;
    }
});

ipcMain.handle('save-pdf-with-metadata', async (event, { filePath, metadata }) => {
    try {
        const ext = path.extname(filePath);
        const base = path.basename(filePath, ext);
        const defaultName = `${base}_edited_metadata${ext}`;

        const { filePath: savedPath, canceled } = await dialog.showSaveDialog({
            defaultPath: defaultName,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (canceled || !savedPath) return { success: false, error: 'Cancelled' };

        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // Remove XMP metadata (XML streams)
        const entries = pdfDoc.context.enumerateIndirectObjects();
        for (const [ref, obj] of entries) {
            if (obj instanceof PDFRawStream) {
                const type = obj.dict.get(PDFName.of('Type'));
                const subtype = obj.dict.get(PDFName.of('Subtype'));
                if (subtype === PDFName.of('XML') && type === PDFName.of('Metadata')) {
                    pdfDoc.context.delete(ref);
                }
            }
        }

        pdfDoc.setTitle(metadata.title || '');
        pdfDoc.setAuthor(metadata.author || '');
        pdfDoc.setSubject(metadata.subject || '');
        pdfDoc.setCreator(metadata.creator || '');
        pdfDoc.setProducer(metadata.producer || '');

        if (metadata.keywords) {
            pdfDoc.setKeywords(metadata.keywords.split(',').map(k => k.trim()));
        } else {
            pdfDoc.setKeywords([]);
        }

        if (!metadata.title && !metadata.author && !metadata.creator && !metadata.producer) {
            pdfDoc.setCreationDate(new Date(0));
            pdfDoc.setModificationDate(new Date(0));
            const infoDict = pdfDoc.getInfoDict();
            infoDict.delete(PDFName.of('CreationDate'));
            infoDict.delete(PDFName.of('ModDate'));
        }

        const modifiedPdfBytes = await pdfDoc.save();
        fs.writeFileSync(savedPath, modifiedPdfBytes);

        return { success: true, path: savedPath };
    } catch (err) {
        console.error("Failed to save metadata:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('is-app-packaged', () => app.isPackaged);

ipcMain.handle('save-dropped-file', async (event, { name, buffer }) => {
    try {
        const taskFolder = ensureTaskFolderExists();
        const filePath = path.join(taskFolder, name);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        console.log(`Saved dropped file to: ${filePath}`);
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error('Failed to save dropped file:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-file', async (event, filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file: ${filePath}`);
            return { success: true };
        }
        return { success: true }; // File doesn't exist, consider it success
    } catch (err) {
        console.error('Failed to delete file:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('perform-tesseract-ocr', async (event, { imagePath, language, options = {} }) => {
    try {
        console.log(`Starting Tesseract OCR for: ${imagePath}, language: ${language}`);

        // MODERN v7 API: Language is specified when creating the worker
        const worker = await Tesseract.createWorker(language, 1, options);

        // Perform recognition
        const result = await worker.recognize(imagePath);

        // Terminate the worker
        await worker.terminate();

        return {
            success: true,
            text: result.data.text,
            confidence: result.data.confidence,
            blocks: result.data.blocks,
            lines: result.data.lines,
            words: result.data.words
        };
    } catch (error) {
        console.error('Tesseract OCR failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('perform-tesseract-pdf-ocr', async (event, { pages, language, options = {} }) => {
    try {
        console.log(`Starting PDF OCR for ${pages.length} pages, language: ${language}`);
        const worker = await Tesseract.createWorker(language, 1, options);
        const results = [];

        try {
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                try {
                    const result = await worker.recognize(page.imageData);

                    results.push({
                        page: page.pageNumber,
                        success: true,
                        text: result.data.text,
                        confidence: result.data.confidence,
                        blocks: result.data.blocks,
                        lines: result.data.lines,
                        words: result.data.words
                    });

                    event.sender.send('tesseract-progress', {
                        current: i + 1,
                        total: pages.length,
                        page: page.pageNumber
                    });

                } catch (pageError) {
                    console.error(`Page ${page.pageNumber} OCR failed:`, pageError);
                    results.push({
                        page: page.pageNumber,
                        success: false,
                        error: pageError.message
                    });
                }
            }

            await worker.terminate();
            return { success: true, results };

        } catch (error) {
            await worker.terminate();
            throw error;
        }
    } catch (error) {
        console.error('PDF OCR failed:', error);
        return {
            success: false,
            error: error.message,
            results: []
        };
    }
});

ipcMain.handle('perform-tesseract-pdf-ocr-optimized', async (event, { pages, language, options = {} }) => {
    let worker = null;

    try {
        console.log(`Starting optimized PDF OCR for ${pages.length} pages, language: ${language}`);

        // Create worker once
        worker = await Tesseract.createWorker(language, 1, options);
        const results = [];

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            try {
                const result = await worker.recognize(page.imageData);

                results.push({
                    page: page.pageNumber,
                    success: true,
                    text: result.data.text,
                    confidence: result.data.confidence
                });

                // Progress update
                event.sender.send('tesseract-progress', {
                    current: i + 1,
                    total: pages.length,
                    page: page.pageNumber
                });

            } catch (pageError) {
                console.error(`Page ${page.pageNumber} OCR failed:`, pageError);
                results.push({
                    page: page.pageNumber,
                    success: false,
                    error: pageError.message
                });
            }
        }

        // Terminate worker after all pages
        if (worker) {
            await worker.terminate();
        }

        return { success: true, results };

    } catch (error) {
        // Clean up on error
        if (worker) {
            await worker.terminate();
        }

        console.error('Optimized PDF OCR failed:', error);
        return {
            success: false,
            error: error.message,
            results: []
        };
    }
});

// IPC handler to get available Tesseract languages
ipcMain.handle('get-tesseract-languages', async () => {
    try {
        const availableLanguages = [
            { code: "eng", name: "English" },
            { code: "por", name: "Portuguese" },
            { code: "afr", name: "Afrikaans" },
            { code: "sqi", name: "Albanian" },
            { code: "amh", name: "Amharic" },
            { code: "ara", name: "Arabic" },
            { code: "asm", name: "Assamese" },
            { code: "aze", name: "Azerbaijani" },
            { code: "aze_cyrl", name: "Azerbaijani - Cyrillic" },
            { code: "eus", name: "Basque" },
            { code: "bel", name: "Belarusian" },
            { code: "ben", name: "Bengali" },
            { code: "bos", name: "Bosnian" },
            { code: "bul", name: "Bulgarian" },
            { code: "mya", name: "Burmese" },
            { code: "cat", name: "Catalan; Valencian" },
            { code: "ceb", name: "Cebuano" },
            { code: "khm", name: "Central Khmer" },
            { code: "chr", name: "Cherokee" },
            { code: "chi_sim", name: "Chinese - Simplified" },
            { code: "chi_tra", name: "Chinese - Traditional" },
            { code: "hrv", name: "Croatian" },
            { code: "ces", name: "Czech" },
            { code: "dan", name: "Danish" },
            { code: "nld", name: "Dutch; Flemish" },
            { code: "dzo", name: "Dzongkha" },
            { code: "enm", name: "English, Middle (1100-1500)", },
            { code: "epo", name: "Esperanto" },
            { code: "est", name: "Estonian" },
            { code: "fin", name: "Finnish" },
            { code: "fra", name: "French" },
            { code: "frm", name: "French, Middle (ca. 1400-1600)" },
            { code: "glg", name: "Galician" },
            { code: "kat", name: "Georgian" },
            { code: "deu", name: "German" },
            { code: "frk", name: "German Fraktur" },
            { code: "ell", name: "Greek, Modern (1453-)" },
            { code: "grc", name: "Greek, Ancient (-1453)" },
            { code: "guj", name: "Gujarati" },
            { code: "hat", name: "Haitian; Haitian Creole" },
            { code: "heb", name: "Hebrew" },
            { code: "hin", name: "Hindi" },
            { code: "hun", name: "Hungarian" },
            { code: "isl", name: "Icelandic" },
            { code: "ind", name: "Indonesian" },
            { code: "iku", name: "Inuktitut" },
            { code: "gle", name: "Irish" },
            { code: "ita", name: "Italian" },
            { code: "jpn", name: "Japanese" },
            { code: "jav", name: "Javanese" },
            { code: "kan", name: "Kannada" },
            { code: "kaz", name: "Kazakh" },
            { code: "kir", name: "Kirghiz; Kyrgyz" },
            { code: "kor", name: "Korean" },
            { code: "kur", name: "Kurdish" },
            { code: "lao", name: "Lao" },
            { code: "lat", name: "Latin" },
            { code: "lav", name: "Latvian" },
            { code: "lit", name: "Lithuanian" },
            { code: "mkd", name: "Macedonian" },
            { code: "msa", name: "Malay" },
            { code: "mal", name: "Malayalam" },
            { code: "mlt", name: "Maltese" },
            { code: "mar", name: "Marathi" },
            { code: "nep", name: "Nepali" },
            { code: "nor", name: "Norwegian" },
            { code: "ori", name: "Oriya" },
            { code: "pan", name: "Panjabi; Punjabi", },
            { code: "fas", name: "Persian" },
            { code: "pol", name: "Polish" },
            { code: "pus", name: "Pushto; Pashto" },
            { code: "ron", name: "Romanian; Moldavian; Moldovan" },
            { code: "rus", name: "Russian" },
            { code: "san", name: "Sanskrit" },
            { code: "srp", name: "Serbian" },
            { code: "srp_latn", name: "Serbian - Latin" },
            { code: "sin", name: "Sinhala; Sinhalese" },
            { code: "slk", name: "Slovak" },
            { code: "slv", name: "Slovenian" },
            { code: "spa", name: "Spanish; Castilian" },
            { code: "swa", name: "Swahili" },
            { code: "swe", name: "Swedish" },
            { code: "syr", name: "Syriac" },
            { code: "tgl", name: "Tagalog" },
            { code: "tgk", name: "Tajik" },
            { code: "tam", name: "Tamil" },
            { code: "tel", name: "Telugu" },
            { code: "tha", name: "Thai" },
            { code: "bod", name: "Tibetan" },
            { code: "tir", name: "Tigrinya" },
            { code: "tur", name: "Turkish" },
            { code: "uig", name: "Uighur; Uyghur" },
            { code: "ukr", name: "Ukrainian" },
            { code: "urd", name: "Urdu" },
            { code: "uzb", name: "Uzbek" },
            { code: "uzb_cyrl", name: "Uzbek - Cyrillic" },
            { code: "vie", name: "Vietnamese" },
            { code: "cym", name: "Welsh" },
            { code: "yid", name: "Yiddish" },
        ];

        return { success: true, languages: availableLanguages };
    } catch (error) {
        console.error('Failed to get languages:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-image-file', async (event, { filename, buffer }) => {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const filterMap = {
        jpg: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }],
        jpeg: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }],
        png: [{ name: 'PNG Image', extensions: ['png'] }],
        webp: [{ name: 'WebP Image', extensions: ['webp'] }],
        bmp: [{ name: 'BMP Image', extensions: ['bmp'] }],
    };
    const filters = filterMap[ext] || [{ name: 'Image File', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }];
    filters.push({ name: 'All Files', extensions: ['*'] });

    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: filters
    });

    if (result.canceled || !result.filePath) return null;

    const uint8 = Buffer.from(buffer);
    fs.writeFileSync(result.filePath, uint8);
    return result.filePath;
});

ipcMain.handle('build-fillable-pdf', async (event, { mode, pages, existingPdfPath, fillable, pageBackgroundColor }) => {
    try {
        const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
        const fontkit = require('@pdf-lib/fontkit');

        let pdfDoc;
        if (mode === 'existing' && existingPdfPath) {
            const pdfBytes = fs.readFileSync(existingPdfPath);
            pdfDoc = await PDFDocument.load(pdfBytes);
        } else {
            pdfDoc = await PDFDocument.create();
            for (const page of pages) {
                pdfDoc.addPage([page.width, page.height]);
            }
        }

        pdfDoc.registerFontkit(fontkit);
        const pdfPages = pdfDoc.getPages();

        // Embed fonts
        let fontRegular, fontBold, fontCJK;

        try {
            const basePath = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath());
            const regularBytes = fs.readFileSync(path.join(basePath, 'assets', 'fonts', 'GoNotoKurrent-Regular.ttf'));
            fontRegular = await pdfDoc.embedFont(regularBytes, { subset: false });
        } catch (err) {
            console.warn('GoNotoKurrent-Regular not found, falling back to Helvetica:', err.message);
            fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }

        try {
            const basePath = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath());
            const boldBytes = fs.readFileSync(path.join(basePath, 'assets', 'fonts', 'GoNotoKurrent-Bold.ttf'));
            fontBold = await pdfDoc.embedFont(boldBytes, { subset: false });
        } catch (err) {
            console.warn('GoNotoKurrent-Bold not found, falling back to Helvetica-Bold:', err.message);
            fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        }

        try {
            const basePath = app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath());
            const cjkBytes = fs.readFileSync(path.join(basePath, 'assets', 'fonts', 'GoNotoCJKCore.ttf'));
            fontCJK = await pdfDoc.embedFont(cjkBytes, { subset: false });
        } catch (err) {
            console.warn('GoNotoCJKCore not found, CJK text may not render:', err.message);
            fontCJK = fontRegular;
        }

        // Pick the right font for given text and weight
        function pickFont(text, bold) {
            const hasCJK = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(text || '');
            if (hasCJK) return fontCJK;
            return bold ? fontBold : fontRegular;
        }

        // Draw background color for blank mode
        if (mode === 'blank' && pageBackgroundColor) {
            const hex = pageBackgroundColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            pdfPages.forEach(p => {
                const { width, height } = p.getSize();
                p.drawRectangle({ x: 0, y: 0, width, height, color: rgb(r, g, b) });
            });
        }

        if (fillable) {
            const form = pdfDoc.getForm();

            for (let pi = 0; pi < pages.length; pi++) {
                const page = pages[pi];
                const pdfPage = pdfPages[pi];
                if (!pdfPage) continue;
                const { height: pageH } = pdfPage.getSize();

                for (const field of page.fields) {
                    const pdfX = field.x;
                    const pdfY = pageH - field.y - field.height;
                    const w = field.width;
                    const h = field.height;

                    // Labels are always static text — never AcroForm fields
                    if (field.type === 'label') {
                        const content = (field.labelContent || '').trim();
                        if (content) {
                            const isBold = field.labelWeight === 'bold';
                            pdfPage.drawText(content, {
                                x: pdfX + 2,
                                y: pdfY + (h / 2) - ((field.fontSize || 12) / 2),
                                size: field.fontSize || 12,
                                font: pickFont(content, isBold),
                                color: rgb(0, 0, 0),
                                maxWidth: w - 4,
                            });
                        }
                        continue;
                    }

                    const safeName = sanitizeName(field.name || `field_${field.id}`);

                    try {
                        switch (field.type) {
                            case 'text':
                            case 'date': {
                                const tf = form.createTextField(safeName);
                                tf.setText(field.defaultValue || '');
                                tf.addToPage(pdfPage, { x: pdfX, y: pdfY, width: w, height: h, font: fontRegular, fontSize: field.fontSize || 12 });
                                tf.setFontSize(field.fontSize || 12);
                                if (field.required) tf.enableRequired();
                                if (field.readonly) tf.enableReadOnly();
                                break;
                            }
                            case 'textarea': {
                                const tf = form.createTextField(safeName);
                                tf.setText(field.defaultValue || '');
                                tf.enableMultiline();
                                tf.addToPage(pdfPage, { x: pdfX, y: pdfY, width: w, height: h, font: fontRegular, fontSize: field.fontSize || 12 });
                                tf.setFontSize(field.fontSize || 12);
                                if (field.required) tf.enableRequired();
                                if (field.readonly) tf.enableReadOnly();
                                break;
                            }
                            case 'checkbox': {
                                const cb = form.createCheckBox(safeName);
                                cb.addToPage(pdfPage, { x: pdfX, y: pdfY, width: w, height: h });
                                if (field.required) cb.enableRequired();
                                if (field.readonly) cb.enableReadOnly();
                                break;
                            }
                            case 'radio': {
                                const groupName = sanitizeName(field.radioGroupName || safeName);
                                let rg;
                                try { rg = form.getRadioGroup(groupName); }
                                catch { rg = form.createRadioGroup(groupName); }
                                rg.addOptionToPage(safeName, pdfPage, { x: pdfX, y: pdfY, width: w, height: h });
                                break;
                            }
                            case 'dropdown': {
                                const dd = form.createDropdown(safeName);
                                const opts = (field.options || ['Option 1']).filter(Boolean);
                                dd.setOptions(opts);
                                if (opts.length > 0) dd.select(opts[0]);
                                dd.addToPage(pdfPage, { x: pdfX, y: pdfY, width: w, height: h, font: fontRegular, fontSize: field.fontSize || 12 });
                                if (field.required) dd.enableRequired();
                                if (field.readonly) dd.enableReadOnly();
                                break;
                            }
                            case 'signature': {
                                const sf = form.createTextField(safeName);
                                sf.setText('');
                                sf.addToPage(pdfPage, { x: pdfX, y: pdfY, width: w, height: h, font: fontRegular, fontSize: field.fontSize || 12 });
                                sf.setFontSize(field.fontSize || 12);
                                pdfPage.drawText('Sign here', {
                                    x: pdfX + 4, y: pdfY + 4,
                                    size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5)
                                });
                                break;
                            }
                        }
                    } catch (fieldErr) {
                        console.log(`Skipping field "${safeName}":`, fieldErr.message);
                    }
                }
            }
        } else {
            // Flattened: draw visual field outlines
            for (let pi = 0; pi < pages.length; pi++) {
                const page = pages[pi];
                const pdfPage = pdfPages[pi];
                if (!pdfPage) continue;
                const { height: pageH } = pdfPage.getSize();

                for (const field of page.fields) {
                    const pdfX = field.x;
                    const pdfY = pageH - field.y - field.height;
                    const w = field.width;
                    const h = field.height;

                    // Labels are always static text — never rectangles
                    if (field.type === 'label') {
                        const content = (field.labelContent || '').trim();
                        if (content) {
                            const isBold = field.labelWeight === 'bold';
                            pdfPage.drawText(content, {
                                x: pdfX + 2,
                                y: pdfY + (h / 2) - ((field.fontSize || 12) / 2),
                                size: field.fontSize || 12,
                                font: pickFont(content, isBold),
                                color: rgb(0, 0, 0),
                                maxWidth: w - 4,
                            });
                        }
                        continue;
                    }

                    switch (field.type) {
                        case 'checkbox':
                        case 'radio': {
                            pdfPage.drawRectangle({ x: pdfX, y: pdfY, width: w, height: h, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1, color: rgb(1, 1, 1) });
                            break;
                        }
                        case 'signature': {
                            pdfPage.drawRectangle({ x: pdfX, y: pdfY, width: w, height: h, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 1, color: rgb(0.97, 0.97, 0.97) });
                            pdfPage.drawText('Signature', { x: pdfX + 4, y: pdfY + h / 2 - 4, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
                            break;
                        }
                        default: {
                            pdfPage.drawRectangle({ x: pdfX, y: pdfY, width: w, height: h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1, color: rgb(1, 1, 1) });
                            break;
                        }
                    }
                }
            }
        }

        const pdfBytes = await pdfDoc.save();
        return { success: true, data: Array.from(pdfBytes) };

    } catch (err) {
        console.log('build-fillable-pdf error:', err);
        return { success: false, error: err.message };
    }
});

function sanitizeName(name) {
    return (name || 'field').replace(/[^a-zA-Z0-9_\-.]/g, '_').substring(0, 64);
}

// Save the full tab state sent from the renderer
ipcMain.handle('pdf-tabs-save', (event, { tabs, activeTabId }) => {
    return pdfTabsService.saveTabs(tabs, activeTabId);
});

// Return saved tabs + active tab id for session restore
ipcMain.handle('pdf-tabs-load', () => {
    return pdfTabsService.loadTabs();
});

// Wipe all saved tabs (called when user disables "Restore Session")
ipcMain.handle('pdf-tabs-clear', () => {
    return pdfTabsService.clearTabs();
});

// Record that a file was opened (insert or increment open_count)
ipcMain.handle('search-add-entry', (event, filePath) => {
    return pdfTabsService.addSearchEntry(filePath);
});

// Query the index — returns rows sorted by name-match then recency
ipcMain.handle('search-query', (event, query) => {
    return pdfTabsService.searchFiles(query);
});

// Return every indexed entry (used during migration)
ipcMain.handle('search-get-all', () => {
    return pdfTabsService.getAllSearchEntries();
});

// Wipe the search index
ipcMain.handle('search-clear', () => {
    return pdfTabsService.clearSearchIndex();
});

ipcMain.handle('select-pdf-and-markdown-files', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'PDF & Markdown', extensions: ['pdf', 'md'] }
        ]
    });
    return result.canceled ? [] : result.filePaths;
});