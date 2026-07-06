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


// src/renderer/about/about.js

import i18n from '../utils/i18n.js';
import { ThemeManager } from '../utils/themeManager.js';

document.addEventListener('DOMContentLoaded', async () => {
    ThemeManager.init();
    await i18n.init();
    fixImagePaths();
    setupButtons();
    initializeTooltips();
});

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

function setupButtons() {
    const viewSourceBtn = document.getElementById('view-source');
    const facebookBtn = document.getElementById('facebook-btn');
    const instagramBtn = document.getElementById('instagram-btn');
    const currentlyWorkingOnBtn = document.getElementById('currently-working-on');
    const reportIssueBtn = document.getElementById('report-issue');
    const releaseNoteBtn = document.getElementById('release-note');

    if (viewSourceBtn) {
        viewSourceBtn.addEventListener('click', () => openExternalLink('https://github.com/Alinur1/LocalPDF_Studio'));
    }
    if (currentlyWorkingOnBtn) {
        currentlyWorkingOnBtn.addEventListener('click', () => openExternalLink('https://docs.google.com/document/d/1wcbxeCYDs7yDEdKZFABC8Jow5mxG0XUqfbuB_fO3-hI/edit?usp=sharing'));
    }
    if (reportIssueBtn) {
        reportIssueBtn.addEventListener('click', () => openExternalLink('https://github.com/Alinur1/LocalPDF_Studio/issues'));
    }
    if (releaseNoteBtn) {
        releaseNoteBtn.addEventListener('click', () => openExternalLink('https://alinur1.github.io/LocalPDF_Studio_Website/html/release_notes.html'));
    }
    if (facebookBtn) {
        facebookBtn.addEventListener('click', () => openExternalLink('https://www.facebook.com/share/1BvWDuLGU2/'));
    }
    if (instagramBtn) {
        instagramBtn.addEventListener('click', () => openExternalLink('https://www.instagram.com/localpdf_studio/'));
    }
}

function openExternalLink(url) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function initializeTooltips() {
    const tooltipItems = document.querySelectorAll('[data-tooltip]');
    tooltipItems.forEach(item => {
        item.addEventListener('click', e => e.preventDefault());
    });
}

function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}
