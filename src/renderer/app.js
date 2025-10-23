// src/renderer/app.js

import TabManager from './tabs/tabManager.js';
import createPdfTab from './utils/createPdfTab.js';
import customAlert from './utils/customAlert.js';
import { ClockManager } from './utils/clockManager.js';
import { SearchIndexManager } from './utils/searchIndexManager.js';
import { SearchBar } from './utils/searchBar.js';

window.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager('#tab-bar', '#tab-content');
    const clockManager = new ClockManager();
    const searchIndexManager = new SearchIndexManager();
    const searchBar = new SearchBar(searchIndexManager, tabManager);
    const emptyState = document.getElementById('empty-state');
    const openPdfBtn = document.getElementById('open-pdf-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const modal = document.getElementById('settings-modal');
    const saveBtn = document.getElementById('settings-save');
    const cancelBtn = document.getElementById('settings-cancel');
    const radios = document.querySelectorAll('input[name="restore-tabs"]');
    const clockCheckbox = document.getElementById('clock-enabled');
    const searchEnabledCheckbox = document.getElementById('search-enabled');
    const clearHistoryBtn = document.getElementById('clear-search-history');
    const toolsDropdown = document.querySelector('.tools-dropdown');

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

    searchBar.setVisible(searchIndexManager.isEnabled());

    restoreTabs(tabManager);
    updateEmptyState();

    let isDialogOpen = false;

    openPdfBtn.addEventListener('click', async () => {
        if (isDialogOpen) return;

        isDialogOpen = true;
        openPdfBtn.disabled = true;
        openPdfBtn.textContent = 'Selecting...';

        try {
            const files = await window.electronAPI.selectPdfs();

            if (files && files.length > 0) {
                for (const filePath of files) {
                    createPdfTab(filePath, tabManager);
                    searchIndexManager.addFile(filePath);
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

    window.addEventListener('message', (event) => {
        if (event.data?.type === 'open-external') {
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(event.data.url);
            } else {
                window.open(event.data.url, '_blank');
            }
        }
    });

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

    function saveTabs(manager) {
        const state = {
            activeTabId: manager.activeTabId,
            tabOrder: manager.getTabOrder(),
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
                // Disable saving during restoration
                const originalOnTabChange = manager.onTabChange;
                const originalOnTabReorder = manager.onTabReorder;
                manager.onTabChange = null;
                manager.onTabReorder = null;

                for (const tab of state.tabs) {
                    createPdfTab(tab.filePath, manager, tab.id);
                }
                if (state.tabOrder && Array.isArray(state.tabOrder)) {
                    manager.restoreTabOrder(state.tabOrder);
                }
                if (state.activeTabId) {
                    manager.switchTab(state.activeTabId);
                }

                // Re-enable saving and save the final state
                manager.onTabChange = originalOnTabChange;
                manager.onTabReorder = originalOnTabReorder;
                saveTabs(manager); // Save the correct state once everything is restored
            }
        } catch (err) {
            console.error('Failed to restore tabs:', err);
        }
    }

    const savedSetting = localStorage.getItem('restoreTabs') || 'restore';
    radios.forEach(r => {
        r.checked = (r.value === savedSetting);
    });

    let originalSettings = {};

    settingsBtn.addEventListener('click', () => {
        originalSettings = {
            restoreTabs: localStorage.getItem('restoreTabs') || 'restore',
            clockEnabled: localStorage.getItem('clockEnabled') !== 'false',
            searchEnabled: searchIndexManager.isEnabled()
        };
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.getElementById('clock-enabled').checked = originalSettings.clockEnabled;
        document.getElementById('search-enabled').checked = originalSettings.searchEnabled;

        modal.classList.remove('hidden');
    });

    document.getElementById('modal-overlay').addEventListener('click', () => {
        restoreOriginalSettings();
        modal.classList.add('hidden');
    });

    document.getElementById('modal-close').addEventListener('click', () => {
        restoreOriginalSettings();
        modal.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            restoreOriginalSettings();
            modal.classList.add('hidden');
        }
    });

    cancelBtn.addEventListener('click', () => {
        restoreOriginalSettings();
        modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const selectedRestore = document.querySelector('input[name="restore-tabs"]:checked').value;
        const clockEnabled = document.getElementById('clock-enabled').checked;
        const searchEnabled = document.getElementById('search-enabled').checked;
        localStorage.setItem('restoreTabs', selectedRestore);
        localStorage.setItem('clockEnabled', clockEnabled.toString());
        clockManager.setEnabled(clockEnabled);
        searchIndexManager.setEnabled(searchEnabled);
        searchBar.setVisible(searchEnabled);

        modal.classList.add('hidden');
    });

    function restoreOriginalSettings() {
        localStorage.setItem('restoreTabs', originalSettings.restoreTabs);
        localStorage.setItem('clockEnabled', originalSettings.clockEnabled.toString());
        searchIndexManager.setEnabled(originalSettings.searchEnabled);
        searchBar.setVisible(originalSettings.searchEnabled);
        clockManager.setEnabled(originalSettings.clockEnabled);
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.getElementById('clock-enabled').checked = originalSettings.clockEnabled;
        document.getElementById('search-enabled').checked = originalSettings.searchEnabled;
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            searchIndexManager.clearHistory();
            if (customAlert) {
                customAlert.alert('Search History Cleared', 'All search history has been removed.');
            }
        });
    }

    document.getElementById('about-btn').addEventListener('click', () => {
        window.location.href = './about/about.html';
    });

    document.getElementById('donate-btn').addEventListener('click', () => {
        window.location.href = './donate/donate.html';
    });

    tabManager.onTabChange = () => saveTabs(tabManager);
    tabManager.onTabClose = () => saveTabs(tabManager);
    tabManager.onTabReorder = () => saveTabs(tabManager);
});
