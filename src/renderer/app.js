// src/renderer/app.js
import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';

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
            createPdfTab(filePath, tabManager);
        }
    });


    window.addEventListener('message', (event) => {
        if (event.data?.type === 'open-external') {
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(event.data.url);
            } else {
                // fallback: open in new tab if running in browser
                window.open(event.data.url, '_blank');
            }
        }
    });



    document.querySelector('#main').prepend(openPdfBtn);
});
