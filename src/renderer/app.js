import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');

    // Open PDF button
    const openPdfBtn = document.getElementById('open-pdf-btn');
    openPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (!files || files.length === 0) return;

        for (const filePath of files) {
            createPdfTab(filePath, tabManager);
        }
    });

    // External links from PDF viewer
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'open-external') {
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(event.data.url);
            } else {
                window.open(event.data.url, '_blank');
            }
        }
    });

    // Resizer logic
    const tabBar = document.getElementById('tab-bar');
    const resizer = document.getElementById('resizer');

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
