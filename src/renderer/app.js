// src/renderer/app.js
import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';
import createMergePdfView from './tools/mergePdfView.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');

    const openPdfBtn = document.getElementById('open-pdf-btn');
    openPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (!files || files.length === 0) return;

        for (const filePath of files) {
            createPdfTab(filePath, tabManager);
        }
    });

    document.querySelectorAll('.tools-menu a').forEach(tool => {
        tool.addEventListener('click', (e) => {
            e.preventDefault();
            const toolName = e.target.dataset.tool;
            const featureId = `feature:${toolName}`;

            if (toolName === "merge-pdf") {
                const content = createMergePdfView();
                tabManager.openTab({
                    id: featureId,
                    type: 'feature',
                    title: e.target.textContent,
                    content,
                    closable: true
                });
                return;
            }

            // Default dummy tabs for other tools
            let content = document.createElement('div');
            content.innerHTML = `<h2>${e.target.textContent}</h2><p>This is ${e.target.textContent} page.</p>`;
            tabManager.openTab({
                id: featureId,
                type: 'feature',
                title: e.target.textContent,
                content,
                closable: true
            });
        });
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

    // Resizer logic
    const tabBar = document.getElementById('tab-bar');
    const resizer = document.getElementById('resizer');

    // Set initial width
    tabBar.style.width = '220px';

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';

        const handleMouseMove = (e) => {
            const sidebarWidth = e.clientX;
            if (sidebarWidth >= 220 && sidebarWidth <= 600) {
                tabBar.style.width = `${sidebarWidth}px`;
            }
        };

        const handleMouseUp = () => {
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });
});
