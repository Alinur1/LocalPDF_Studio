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


// src/renderer/utils/fileUrl.js

export function pathToFileURL(filePath) {
    const isWindows = filePath.includes('\\') || /^[a-zA-Z]:/.test(filePath);
    let resolvedPath = filePath.replace(/\\/g, '/');
    if (isWindows && /^[a-zA-Z]:/.test(resolvedPath)) {
        resolvedPath = '/' + resolvedPath;
    }
    const encodedSegments = resolvedPath.split('/').map(segment => encodeURIComponent(segment));
    let urlPath = encodedSegments.join('/');
    urlPath = urlPath.replace(/^\/([a-zA-Z])%3A/, '/$1:');
    return 'file://' + urlPath;
}

export function encodeFileUrlForQueryParam(filePath) {
    return encodeURIComponent(pathToFileURL(filePath));
}