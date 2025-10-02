import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');

    // Restore saved tabs on startup
    restoreTabs(tabManager);

    // Open PDF button
    const openPdfBtn = document.getElementById('open-pdf-btn');
    openPdfBtn.addEventListener('click', async () => {
        const files = await window.electronAPI.selectPdfs();
        if (!files || files.length === 0) return;

        for (const filePath of files) {
            createPdfTab(filePath, tabManager);
            saveTabs(tabManager);
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

    // --- Persistence helpers ---
    function saveTabs(manager) {
        const state = {
            activeTabId: manager.activeTabId,
            tabs: Array.from(manager.tabs.entries()).map(([id, tab]) => ({
                id,
                filePath: tab.content.src.replace(/^.*file:\/\//, ''), // extract path
                title: tab.tabButton.querySelector('.tab-title')?.textContent || 'PDF'
            }))
        };
        localStorage.setItem('pdfTabs', JSON.stringify(state));
    }

    function restoreTabs(manager) {
        const saved = localStorage.getItem('pdfTabs');
        if (!saved) return;

        try {
            const state = JSON.parse(saved);
            if (state.tabs && Array.isArray(state.tabs)) {
                for (const tab of state.tabs) {
                    createPdfTab(tab.filePath, manager);
                }
            }
            if (state.activeTabId) {
                manager.switchTab(state.activeTabId);
            }
        } catch (err) {
            console.error('Failed to restore tabs:', err);
        }
    }

    // Hook TabManager events
    tabManager.onTabChange = () => saveTabs(tabManager);
    tabManager.onTabClose = () => saveTabs(tabManager);
});
