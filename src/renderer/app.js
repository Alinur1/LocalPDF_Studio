// src/renderer/app.js
import TabManager from './tabs/tabManager.js';

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

            const iframe = document.createElement('iframe');
            iframe.src = `../pdf/web/viewer.html?file=file://${filePath}`;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';

            tabManager.openTab({
                id: tabId,
                type: 'pdf',
                title: filePath.split(/[\\/]/).pop(),
                content: iframe,
                closable: true
            });
        }
    });


    document.querySelector('#main').prepend(openPdfBtn);
});
