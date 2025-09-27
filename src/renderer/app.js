// src/renderer/app.js
import TabManager from './tabs/tabManager.js';
import PdfViewer from './viewers/PdfViewer.js';

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

    const openPdfBtn = document.getElementById('open-pdf-btn');

    openPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (!files || files.length === 0) return;

        for (const filePath of files) {
            const tabId = `pdf:${filePath}:${Date.now()}`;
            const container = document.createElement('div');
            container.classList.add('pdf-container');
            container.style.height = '100%';
            container.style.overflow = 'auto';

            // create viewer instance
            const viewer = new PdfViewer(container, {
                scale: 1.0,            // default scale multiplier
                preRenderAdjacent: 1, // render neighbors
                unloadDistance: 3
            });

            // open tab with onClose cleanup that destroys viewer
            tabManager.openTab({
                id: tabId,
                type: 'pdf',
                title: filePath.split(/[\\/]/).pop(),
                content: container,
                closable: true,
                onClose: async () => {
                    try {
                        await viewer.destroy();
                    } catch (e) {
                        console.warn('Error destroying viewer', e);
                    }
                }
            });

            // load the PDF (async)
            viewer.load(filePath).catch(err => {
                console.error('Failed to load PDF', filePath, err);
                container.textContent = 'Failed to load PDF';
            });
        }
    });

    document.querySelector('#main').prepend(openPdfBtn);
});
