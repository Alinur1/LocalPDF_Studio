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

// src/renderer/utils/markdown/imageUrl.mjs

// Matches any absolute URI scheme (`http:`, `data:`, `javascript:`, …).
// Notably does NOT match bare `#fragments`. Windows drive paths (`C:\…`)
// DO match the single-letter `c:` "scheme" — see isWindowsAbsolutePath().
export function hasUriScheme(src) {
    return /^[a-z][a-z0-9+.-]*:/i.test(src);
}

// A Windows absolute path (`C:\…`, `D:/…`) is a local file, not a URI —
// resolve it to file:// so dropped/absolute image references render.
export function isWindowsAbsolutePath(src) {
    return /^[a-zA-Z]:[\\/]/.test(src);
}

// Prefer a path relative to the .md file so the document stays portable.
// Exact match only: on case-sensitive filesystems a case-insensitive guess
// would produce a broken reference, while the absolute fallback still
// renders (via toFileUrl). Returns the absolute path when unrelated.
export function relativizeImagePath(mdFilePath, imagePath) {
    const normMd = (mdFilePath || '').replace(/\\/g, '/');
    const normImg = (imagePath || '').replace(/\\/g, '/');
    const dir = normMd.includes('/') ? normMd.slice(0, normMd.lastIndexOf('/') + 1) : '';
    if (dir && normImg.startsWith(dir)) {
        return normImg.slice(dir.length);
    }
    return imagePath;
}

export function toFileUrl(windowsPath) {
    return 'file:///' + windowsPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

// Directory of the .md file as a file:// base URL (null when unparseable).
// A path with no directory falls back to `file:///`.
export function buildFileBaseUrl(mdFilePath) {
    const normPath = (mdFilePath || '').replace(/\\/g, '/');
    const dirPath = normPath.includes('/')
        ? normPath.slice(0, normPath.lastIndexOf('/') + 1)
        : '';
    try {
        return new URL(dirPath ? `file:///${dirPath.replace(/^\/+/, '')}` : 'file:///');
    } catch {
        return null;
    }
}

// Resolve one schemeless relative src against the base; identity on failure.
export function resolveRelativeSrc(src, baseUrl) {
    try {
        return new URL(src, baseUrl).href;
    } catch {
        return src;
    }
}
