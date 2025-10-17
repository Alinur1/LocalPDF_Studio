// src/renderer/app.js

import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';
import { ClockManager } from './utils/clockManager.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');
    const clockManager = new ClockManager();
    const emptyState = document.getElementById('empty-state');
    const openPdfBtn = document.getElementById('open-pdf-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const modal = document.getElementById('settings-modal');
    const saveBtn = document.getElementById('settings-save');
    const cancelBtn = document.getElementById('settings-cancel');
    const radios = document.querySelectorAll('input[name="restore-tabs"]');
    const clockCheckbox = document.getElementById('clock-enabled');
    const toolsDropdown = document.querySelector('.tools-dropdown');

    // Initialize empty state as hidden by default
    emptyState.classList.add('hidden');

    toolsDropdown.addEventListener('mouseenter', () => {
        if (emptyState && !emptyState.classList.contains('hidden')) {
            emptyState.classList.add('transparent');
        }
    });

    toolsDropdown.addEventListener('mouseleave', () => {
        if (emptyState && !emptyState.classList.contains('hidden')) {
            emptyState.classList.remove('transparent');
        }
    });

    // Update empty state based on tabs
    function updateEmptyState() {
        if (tabManager.tabs.size === 0) {
            console.log('No tabs - showing empty state');
            emptyState.classList.remove('hidden');
            if (clockManager.isEnabled) {
                clockManager.start();
            }
        } else {
            console.log('Tabs present - hiding empty state');
            emptyState.classList.add('hidden');
            clockManager.stop();
        }
    }

    // Override tab manager methods to update empty state
    const originalOpenTab = tabManager.openTab.bind(tabManager);
    tabManager.openTab = function (...args) {
        const result = originalOpenTab(...args);
        updateEmptyState();
        return result;
    };

    const originalCloseTab = tabManager.closeTab.bind(tabManager);
    tabManager.closeTab = function (...args) {
        const result = originalCloseTab(...args);
        updateEmptyState();
        return result;
    };

    // Clock settings
    if (clockCheckbox) {
        clockCheckbox.checked = clockManager.isEnabled;
        clockCheckbox.addEventListener('change', (e) => {
            clockManager.setEnabled(e.target.checked);
            updateEmptyState();
        });
    }

    // Restore tabs and update empty state
    restoreTabs(tabManager);
    updateEmptyState();

    // Open PDF button with dialog state management
    let isDialogOpen = false;

    openPdfBtn.addEventListener('click', async () => {
        // Prevent multiple dialogs
        if (isDialogOpen) return;

        isDialogOpen = true;
        openPdfBtn.disabled = true;
        openPdfBtn.textContent = 'Selecting...';

        try {
            const files = await window.electronAPI.selectPdfs();

            if (files && files.length > 0) {
                for (const filePath of files) {
                    createPdfTab(filePath, tabManager);
                }
                saveTabs(tabManager);
            }
        } catch (error) {
            console.error('Error opening PDFs:', error);
        } finally {
            isDialogOpen = false;
            openPdfBtn.disabled = false;
            openPdfBtn.textContent = 'Open PDF Reader';
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
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        tabBar.style.width = savedWidth;
    }

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
            localStorage.setItem('sidebarWidth', tabBar.style.width);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    // --- Persistence helpers ---
    function saveTabs(manager) {
        const state = {
            activeTabId: manager.activeTabId,
            tabOrder: manager.getTabOrder(), // Save the current order
            tabs: Array.from(manager.tabs.entries()).map(([id, tab]) => ({
                id,
                filePath: decodeURIComponent(tab.content.src.replace(/^.*file:\/\//, '')),
                title: tab.tabButton.querySelector('.tab-title')?.textContent || 'PDF'
            }))
        };
        localStorage.setItem('pdfTabs', JSON.stringify(state));
    }

    function restoreTabs(manager) {
        const restoreSetting = localStorage.getItem('restoreTabs') || 'restore';
        const saved = localStorage.getItem('pdfTabs');
        if (!saved) return;

        try {
            const state = JSON.parse(saved);
            if (restoreSetting === 'restore' && state.tabs && Array.isArray(state.tabs)) {
                // First create all tabs
                for (const tab of state.tabs) {
                    createPdfTab(tab.filePath, manager);
                }

                // Then restore the order if available
                if (state.tabOrder && Array.isArray(state.tabOrder)) {
                    manager.restoreTabOrder(state.tabOrder);
                }

                // Finally switch to the active tab
                if (state.activeTabId) {
                    manager.switchTab(state.activeTabId);
                }
            }
        } catch (err) {
            console.error('Failed to restore tabs:', err);
        }
    }

    // Load saved setting (default = restore)
    const savedSetting = localStorage.getItem('restoreTabs') || 'restore';
    radios.forEach(r => {
        r.checked = (r.value === savedSetting);
    });

    settingsBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    document.getElementById('modal-overlay').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close modal when clicking close button
    document.getElementById('modal-close').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const selected = document.querySelector('input[name="restore-tabs"]:checked').value;
        localStorage.setItem('restoreTabs', selected);
        modal.classList.add('hidden');
    });

    document.getElementById('about-btn').addEventListener('click', () => {
        window.location.href = './about/about.html';
    });

    document.getElementById('donate-btn').addEventListener('click', () => {
        window.location.href = './donate/donate.html';
    });

    // Hook TabManager events
    tabManager.onTabChange = () => saveTabs(tabManager);
    tabManager.onTabClose = () => saveTabs(tabManager);
    tabManager.onTabReorder = () => saveTabs(tabManager);
});
