// src/renderer/donate/donate.js

import customAlert from '../utils/customAlert.js';

class DonationManager {
    constructor() {
        this.initialized = false;
        this.init();
    }

    init() {
        if (this.initialized) return;

        this.setupEventListeners();
        this.initialized = true;
        console.log('DonationManager initialized');
    }

    setupEventListeners() {
        this.setupDonationHandlers();
        this.setupSupportHandlers();
        this.setupQRModal();
    }

    setupDonationHandlers() {
        const bkashBtn = document.getElementById('show-bkash-qr');
        if (bkashBtn) {
            bkashBtn.addEventListener('click', () => this.showBkashQR());
        }
        const gumroadBtn = document.getElementById('gumroad-donate');
        if (gumroadBtn) {
            gumroadBtn.addEventListener('click', () => this.openGumroad());
        }
    }

    setupSupportHandlers() {
        const actions = {
            'alt-star': () => this.openExternal('https://github.com/Alinur1/LocalPDF_Studio'),
            'alt-share': () => this.shareApp(),
            'alt-report': () => this.openExternal('https://github.com/Alinur1/LocalPDF_Studio/issues'),
            'alt-suggest': () => this.openExternal('https://github.com/Alinur1/LocalPDF_Studio/issues/new?template=feature_request.md')
        };

        Object.entries(actions).forEach(([id, action]) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', action);
            }
        });
    }

    setupQRModal() {
        const qrModal = document.getElementById('bkash-qr-modal');
        if (!qrModal) return;

        const closeHandlers = [
            document.getElementById('qr-close'),
            document.getElementById('bkash-modal-close'),
            document.getElementById('bkash-modal-overlay')
        ];

        closeHandlers.forEach(handler => {
            if (handler) {
                handler.addEventListener('click', () => this.hideBkashQR());
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && qrModal && !qrModal.classList.contains('hidden')) {
                this.hideBkashQR();
            }
        });
    }

    showBkashQR() {
        const modal = document.getElementById('bkash-qr-modal');
        if (modal) {
            modal.classList.remove('hidden');
            console.log('bKash QR modal shown');
        }
    }

    hideBkashQR() {
        const modal = document.getElementById('bkash-qr-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    openGumroad() {
        this.openExternal('https://alinur3.gumroad.com/coffee');
    }

    async shareApp() {
        const shareText = 'Check out LocalPDF Studio - A complete offline PDF toolkit! Free, open source, and privacy-focused.';
        const shareUrl = 'https://github.com/Alinur1/LocalPDF_Studio';

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'LocalPDF Studio',
                    text: shareText,
                    url: shareUrl
                });
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
            this.showAlert('Success', 'Share link copied to clipboard! 📋\n\nYou can now paste it anywhere to share.\n\nLink: https://github.com/Alinur1/LocalPDF_Studio', ['OK']);
        } catch (err) {
            this.showAlert('Share', `Share this link:\n\n${text}\n\nCopy and share with others!`, ['OK']);
        }
    }

    openExternal(url) {
        if (window.electronAPI?.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
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
