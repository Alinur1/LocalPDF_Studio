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


// src/main/services/wallpaperService.js

const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

const WALLPAPER_DIR_NAME = 'LocalPDF_Studio_Wallpaper';
const MAX_CUSTOM_WALLPAPERS = 10;
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_DIALOG_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

function getWallpaperDir() {
    // Snap strict confinement cannot reliably write to ~/Pictures,
    // so mirror the task-folder pattern and stay inside SNAP_USER_DATA.
    if (process.platform === 'linux' && process.env.SNAP) {
        const base = process.env.SNAP_USER_DATA || process.env.HOME;
        return path.join(base, WALLPAPER_DIR_NAME);
    }
    try {
        return path.join(app.getPath('pictures'), WALLPAPER_DIR_NAME);
    } catch (_) {
        return path.join(app.getPath('userData'), WALLPAPER_DIR_NAME);
    }
}

function ensureWallpaperDir() {
    const dir = getWallpaperDir();
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        // Pictures may be redirected/unavailable (e.g. OneDrive moved it).
        // Fall back to userData so the feature keeps working everywhere.
        const fallback = path.join(app.getPath('userData'), WALLPAPER_DIR_NAME);
        fs.mkdirSync(fallback, { recursive: true });
        return fallback;
    }
    return dir;
}

function toFileUrl(filePath) {
    let resolved = filePath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:/.test(resolved)) resolved = '/' + resolved;
    const encoded = resolved.split('/').map(s => encodeURIComponent(s)).join('/');
    return 'file://' + encoded.replace(/^\/([a-zA-Z])%3A/, '/$1:');
}

function sanitizeBase(name) {
    return (name || 'wallpaper').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 48) || 'wallpaper';
}

function validateSource(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
        return { ok: false, error: `Unsupported format "${ext}". Use JPG, JPEG, PNG or WebP.` };
    }
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch (_) {
        return { ok: false, error: 'Could not read the selected file.' };
    }
    if (!stats.isFile()) return { ok: false, error: 'Not a file.' };
    if (stats.size > MAX_FILE_BYTES) {
        return { ok: false, error: `File is ${(stats.size / 1048576).toFixed(1)}MB — limit is 40MB.` };
    }
    return { ok: true, ext, size: stats.size };
}

const wallpaperService = {
    dir() {
        return ensureWallpaperDir();
    },

    list() {
        const dir = ensureWallpaperDir();
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_) {
            return [];
        }
        return entries
            .filter(e => e.isFile() && ALLOWED_EXTS.has(path.extname(e.name).toLowerCase()))
            .map(e => {
                const filePath = path.join(dir, e.name);
                let size = 0, mtimeMs = 0;
                try {
                    const st = fs.statSync(filePath);
                    size = st.size; mtimeMs = st.mtimeMs;
                } catch (_) { /* file vanished — still list it, renderer falls back */ }
                return { id: `custom:${e.name}`, name: e.name, filePath, fileUrl: toFileUrl(filePath), size, mtimeMs };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    },

    count() {
        return this.list().length;
    },

    async addViaDialog(parentWindow) {
        const openOptions = {
            title: 'Choose wallpaper image',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Images (JPG, PNG, WebP)', extensions: ALLOWED_DIALOG_EXTS }]
        };
        // Parent keeps the dialog above the app window (see dialogParent in main.js).
        const { canceled, filePaths } = parentWindow
            ? await dialog.showOpenDialog(parentWindow, openOptions)
            : await dialog.showOpenDialog(openOptions);
        if (canceled || !filePaths || filePaths.length === 0) {
            return { success: false, canceled: true, added: [] };
        }
        const dir = ensureWallpaperDir();
        const existing = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
        const added = [];
        const errors = [];
        for (const src of filePaths) {
            if (existing.size + added.length >= MAX_CUSTOM_WALLPAPERS) {
                errors.push(`Limit reached: max ${MAX_CUSTOM_WALLPAPERS} custom wallpapers.`);
                break;
            }
            const v = validateSource(src);
            if (!v.ok) { errors.push(`${path.basename(src)}: ${v.error}`); continue; }
            const destName = `custom-${Date.now()}-${sanitizeBase(path.basename(src, v.ext))}${v.ext}`;
            try {
                fs.copyFileSync(src, path.join(dir, destName));
                added.push({ id: `custom:${destName}`, name: destName, filePath: path.join(dir, destName), fileUrl: toFileUrl(path.join(dir, destName)) });
            } catch (err) {
                errors.push(`${path.basename(src)}: ${err.message}`);
            }
        }
        return { success: added.length > 0, canceled: false, added, errors };
    },

    remove(name) {
        // Basename-only: blocks path traversal (../../) by design.
        const safe = path.basename(String(name || ''));
        if (!safe || !ALLOWED_EXTS.has(path.extname(safe).toLowerCase())) {
            return { success: false, error: 'Invalid wallpaper name.' };
        }
        const target = path.join(ensureWallpaperDir(), safe);
        try {
            if (fs.existsSync(target)) fs.unlinkSync(target);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

module.exports = wallpaperService;
