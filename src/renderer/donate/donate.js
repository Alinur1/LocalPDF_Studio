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


// src/renderer/donate/donate.js

import customAlert from '../utils/customAlert.js';

class DonationManager {
    constructor() {
        this.initialized = false;
        this.init();
    }

    async init() {
        if (this.initialized) return;
        await this.fixImagePaths();
        this.setupEventListeners();
        this.initialized = true;
        console.log('DonationManager initialized');
    }

    async fixImagePaths() {
        if (!window.electronAPI?.resolveAsset) {
            console.error('electronAPI.resolveAsset is not available');
            return;
        }

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

    setupEventListeners() {
        this.setupDonationHandlers();
        this.setupSupportHandlers();
        this.setupQRModal();
    }

    setupDonationHandlers() {
        const bkashBtn = document.getElementById('show-bkash-qr');
        if (bkashBtn) bkashBtn.addEventListener('click', () => this.showBkashQR());

        const gumroadBtn = document.getElementById('gumroad-donate');
        if (gumroadBtn) gumroadBtn.addEventListener('click', () => this.openGumroad());
    }

    setupSupportHandlers() {
        const actions = {
            'alt-star': () => this.openExternal('https://github.com/Alinur1/LocalPDF_Studio'),
            'alt-share': () => this.shareApp(),
            'alt-report': () => this.openExternal('https://github.com/Alinur1/LocalPDF_Studio/issues'),
            'alt-suggest': () =>
                this.openExternal('https://github.com/Alinur1/LocalPDF_Studio/issues/new?template=feature_request.md'),
        };

        Object.entries(actions).forEach(([id, action]) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener('click', action);
        });
    }

    setupQRModal() {
        const qrModal = document.getElementById('bkash-qr-modal');
        if (!qrModal) return;

        const closeHandlers = [
            document.getElementById('qr-close'),
            document.getElementById('bkash-modal-close'),
            document.getElementById('bkash-modal-overlay'),
        ];

        closeHandlers.forEach(handler => {
            if (handler) handler.addEventListener('click', () => this.hideBkashQR());
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && qrModal && !qrModal.classList.contains('hidden')) {
                this.hideBkashQR();
            }
        });
    }

    showBkashQR() {
        const modal = document.getElementById('bkash-qr-modal');
        if (modal) modal.classList.remove('hidden');
    }

    hideBkashQR() {
        const modal = document.getElementById('bkash-qr-modal');
        if (modal) modal.classList.add('hidden');
    }

    openGumroad() {
        this.openExternal('https://alinur3.gumroad.com/coffee');
    }

    async shareApp() {
        const shareText =
            'Check out LocalPDF Studio - A complete offline PDF toolkit! Free, open source, and privacy-focused.';
        const shareUrl = 'https://github.com/Alinur1/LocalPDF_Studio';

        if (navigator.share) {
            try {
                await navigator.share({ title: 'LocalPDF Studio', text: shareText, url: shareUrl });
                return;
            } catch (err) {
                console.log('Share cancelled:', err);
            }
        }

        await this.copyToClipboard(`${shareText} ${shareUrl}`);
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showAlert(
                'Success',
                'Share link copied to clipboard! 📋\n\nYou can now paste it anywhere to share.\n\nLink: https://github.com/Alinur1/LocalPDF_Studio'
            );
        } catch (err) {
            this.showAlert('Share', `Share this link:\n\n${text}\n\nCopy and share with others!`);
        }
    }

    async openExternal(url) {
        try {
            if (window.electronAPI?.openExternal) {
                await window.electronAPI.openExternal(url);
            } else {
                window.open(url, '_blank');
            }
        } catch (err) {
            console.error('Failed to open external URL:', err);
            window.open(url, '_blank');
        }
    }

    showAlert(title, message, buttons = ['OK']) {
        if (customAlert && typeof customAlert.alert === 'function') {
            customAlert.alert(title, message, buttons);
        } else {
            alert(`${title}\n\n${message}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DonationManager();
});

window.DonationManager = DonationManager;
