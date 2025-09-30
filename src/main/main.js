// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron/main');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let apiProcess = null;
let apiPort = null;

// Start the ASP.NET Core backend
function startBackend() {
    return new Promise((resolve, reject) => {
        // Path to your published backend executable
        // Adjust this path based on your build output
        const backendPath = path.join(
            app.getAppPath(),
            './assets/backend_windows',
            'tooldeck_api.exe' // or 'tooldeck_api' on Linux/Mac
        );

        apiProcess = spawn(backendPath);

        apiProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Backend:', output);

            // Look for the port output
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
                reject(new Error('Backend failed to start within timeout'));
            }
        }, 10000);
    });
}

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

app.whenReady().then(async () => {
    try {
        // Start backend and wait for port
        await startBackend();

        // Create window after backend is ready
        createWindow();
    } catch (err) {
        console.error('Failed to initialize app:', err);
        dialog.showErrorBox('Startup Error', 'Failed to start the application backend.');
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Kill the backend process
    if (apiProcess) {
        apiProcess.kill();
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Ensure backend is killed on quit
    if (apiProcess) {
        apiProcess.kill();
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
