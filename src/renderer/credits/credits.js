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

// src/renderer/credits/credits.js

import i18n from '../utils/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    setupCreditLinks();
    fixImagePaths();
});

function setupCreditLinks() {
    // Core Technologies
    document.getElementById('nodejs-link')?.addEventListener('click', () => 
        openExternalLink('https://nodejs.org/en'));
    
    document.getElementById('electron-link')?.addEventListener('click', () => 
        openExternalLink('https://www.electronjs.org/'));
    
    document.getElementById('electron-builder-link')?.addEventListener('click', () => 
        openExternalLink('https://www.npmjs.com/package/electron-builder'));
    
    document.getElementById('electron-updater-link')?.addEventListener('click', () => 
        openExternalLink('https://www.npmjs.com/package/electron-updater'));

    // PDF & Image Processing
    document.getElementById('ghostscript-link')?.addEventListener('click', () => 
        openExternalLink('https://ghostscript.com/'));
    
    document.getElementById('pdfsharpcore-link')?.addEventListener('click', () => 
        openExternalLink('https://www.nuget.org/packages/PdfSharpCore'));
    
    document.getElementById('imagesharp-link')?.addEventListener('click', () => 
        openExternalLink('https://www.nuget.org/packages/sixlabors.imagesharp/'));

    // .NET Ecosystem
    document.getElementById('dotnet-link')?.addEventListener('click', () => 
        openExternalLink('https://dotnet.microsoft.com/en-us/download/dotnet/8.0'));

    document.getElementById('python-link')?.addEventListener('click', () => 
        openExternalLink('https://www.python.org/'));
    
    document.getElementById('cliwrap-link')?.addEventListener('click', () => 
        openExternalLink('https://www.nuget.org/packages/CLIWrap'));
    
    document.getElementById('bouncycastle-link')?.addEventListener('click', () => 
        openExternalLink('https://www.nuget.org/packages/Portable.BouncyCastle'));

    document.getElementById('tesseract-link')?.addEventListener('click', () => 
        openExternalLink('https://tesseract.projectnaptha.com/'));

    document.getElementById('pdfjs-link')?.addEventListener('click', () => 
        openExternalLink('https://mozilla.github.io/pdf.js/'));

    document.getElementById('pymupdf-link')?.addEventListener('click', () => 
        openExternalLink('https://github.com/pymupdf/PyMuPDF'));
}

async function fixImagePaths() {
    if (!window.electronAPI?.resolveAsset) return;
    const images = document.querySelectorAll('img[data-local-asset]');
    for (const img of images) {
        const relativePath = img.getAttribute('data-local-asset');
        if (!relativePath) continue;

        try {
            const resolvedPath = await window.electronAPI.resolveAsset(relativePath);
            if (resolvedPath) {
                img.src = resolvedPath;
            } else {
                console.warn(`Could not resolve asset: ${relativePath}`);
            }
        } catch (err) {
            console.error(`Error resolving asset: ${relativePath}`, err);
        }
    }
}

function openExternalLink(url) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}

function addButtonTooltips() {
    const buttonUrls = {
        'nodejs-link': 'https://nodejs.org/en',
        'electron-link': 'https://www.electronjs.org/',
        'electron-builder-link': 'https://www.npmjs.com/package/electron-builder',
        'electron-updater-link': 'https://www.npmjs.com/package/electron-updater',
        'ghostscript-link': 'https://ghostscript.com/',
        'pdfsharpcore-link': 'https://www.nuget.org/packages/PdfSharpCore',
        'imagesharp-link': 'https://www.nuget.org/packages/sixlabors.imagesharp/',
        'dotnet-link': 'https://dotnet.microsoft.com/en-us/',
        'python-link': 'https://www.python.org/',
        'cliwrap-link': 'https://www.nuget.org/packages/CLIWrap',
        'bouncycastle-link': 'https://www.nuget.org/packages/Portable.BouncyCastle',
        'tesseract-link': 'https://tesseract.projectnaptha.com/',
        'pdfjs-link': 'https://mozilla.github.io/pdf.js/',
        'pymupdf-link': 'https://github.com/pymupdf/PyMuPDF',
    };

    Object.entries(buttonUrls).forEach(([id, url]) => {
        const button = document.getElementById(id);
        if (button) {
            button.title = url;
            button.setAttribute('aria-label', `Open ${url}`);
        }
    });
}

// Then call it in DOMContentLoaded:
document.addEventListener('DOMContentLoaded', () => {
    fixImagePaths();
    addButtonTooltips(); // Add this line
});