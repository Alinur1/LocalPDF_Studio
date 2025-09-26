// src/renderer/app.js
import TabManager from './tabs/tabManager.js';
import { renderPDF } from './viewers/pdfViewer.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');

    // Sidebar buttons (unchanged)
    document.querySelectorAll('#sidebar button').forEach((btn) => {
        btn.addEventListener('click', () => {
            const featureId = `feature:${btn.dataset.feature}`;
            let content = document.createElement('div');
            content.innerHTML = `<h2>${btn.textContent}</h2><p>This is ${btn.textContent} page.</p>`;
            tabManager.openTab({
                id: featureId,
                type: 'feature',
                title: btn.textContent,
                content,
                closable: false
            });
        });
    });

    // Replace dummy button with real "Open PDF"
    const openPdfBtn = document.createElement('button');
    openPdfBtn.textContent = 'Open PDF(s)';
    openPdfBtn.style.margin = '1rem';

    openPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (!files || files.length === 0) return;

        files.forEach(async (filePath) => {
            const tabId = `pdf:${filePath}:${Date.now()}`;
            const container = document.createElement('div');
            container.classList.add('pdf-container');
            container.style.height = '100%';
            container.style.overflow = 'auto';

            let pdfInstance = null;

            tabManager.openTab({
                id: tabId,
                type: 'pdf',
                title: filePath.split(/[\\/]/).pop(),
                content: container,
                closable: true,
                onClose: () => {
                    if (pdfInstance) {
                        pdfInstance.destroy(); // 👈 free memory!
                        pdfInstance = null;
                    }
                    // Extra canvas cleanup
                    const canvas = container.querySelector('canvas');
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                        }
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                    container.innerHTML = ''; // finally remove from DOM
                }
            });

            pdfInstance = await renderPDF(filePath, container);
        });
    });



    document.querySelector('#main').prepend(openPdfBtn);
});
