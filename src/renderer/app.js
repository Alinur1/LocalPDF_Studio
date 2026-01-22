/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


// src/renderer/app.js

import TabManager from './tabs/tabManager.js';
import { ClockManager } from './utils/clockManager.js';
import createPdfTab from './utils/createPdfTab.js';
import customAlert from './utils/customAlert.js';
import i18n from './utils/i18n.js';
import { SearchBar } from './utils/searchBar.js';
import { SearchIndexManager } from './utils/searchIndexManager.js';

window.addEventListener('DOMContentLoaded', async() => {

    await i18n.init();

    const themeRadios = document.querySelectorAll('input[name="theme-mode"]');
    const tabManager = new TabManager('#tab-bar', '#tab-content');
    const clockManager = new ClockManager();
    const searchIndexManager = new SearchIndexManager();
    const searchBar = new SearchBar(searchIndexManager, tabManager);
    const emptyState = document.getElementById('empty-state');
    const openPdfBtn = document.getElementById('open-pdf-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const donateBtn = document.getElementById('donate-btn');
    const modal = document.getElementById('settings-modal');
    const saveBtn = document.getElementById('settings-save');
    const cancelBtn = document.getElementById('settings-cancel');
    const radios = document.querySelectorAll('input[name="restore-tabs"]');
    const clockCheckbox = document.getElementById('clock-enabled');
    const searchEnabledCheckbox = document.getElementById('search-enabled');
    const clearHistoryBtn = document.getElementById('clear-search-history');
    const toolsDropdown = document.querySelector('.tools-dropdown');
    const languageSelect = document.getElementById('language-select');

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

    // Helper function to open PDF files
    async function openPdfFiles(filePaths) {
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
            createPdfTab(filePath, tabManager);
            searchIndexManager.addFile(filePath);
        }
        saveTabs(tabManager);
    }

    openPdfBtn.addEventListener('click', async () => {
        if (isDialogOpen) return;

        isDialogOpen = true;
        openPdfBtn.disabled = true;
        // openPdfBtn.textContent = 'Selecting...';
        openPdfBtn.textContent =  i18n.t('nav.selecting');

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
            // openPdfBtn.textContent = 'Open PDF Reader';
            openPdfBtn.textContent = i18n.t('nav.open-pdf-btn');
        }
    });

    // Handle files opened via OS "Open with LocalPDF Studio" or second-instance events
    if (window.electronAPI && window.electronAPI.onOpenFile) {
        window.electronAPI.onOpenFile(async (filePath) => {
            try {
                if (filePath) {
                    await openPdfFiles([filePath]);
                }
            } catch (err) {
                console.error('Error opening file from OS:', err);
            }
        });
    }

    setInterval(() => {
        donateBtn.classList.add('glowing');
        setTimeout(() => {
            donateBtn.classList.remove('glowing');
        }, 600);
    }, 3600000);

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

    // Initialize language from localStorage or default to 'en'
    const savedLanguage = localStorage.getItem('language') || 'en';
    languageSelect.value = savedLanguage;
    
    const savedSetting = localStorage.getItem('restoreTabs') || 'restore';
    radios.forEach(r => {
        r.checked = (r.value === savedSetting);
    });

    let originalSettings = {};

    const updateStatusMessage = document.getElementById('update-status-message');

    async function updateStatusUI() {
        if (window.electronAPI && window.electronAPI.getUpdateStatus) {
            const { status, details } = await window.electronAPI.getUpdateStatus();
            let message = status;
            if (details) {
                message += ` (${details})`;
            }
            updateStatusMessage.textContent = message;
        }
    }

    settingsBtn.addEventListener('click', () => {
        originalSettings = {
            restoreTabs: localStorage.getItem('restoreTabs') || 'restore',
            clockEnabled: localStorage.getItem('clockEnabled') !== 'false',
            searchEnabled: searchIndexManager.isEnabled(),
            language: localStorage.getItem('language') || 'en',
            theme: localStorage.getItem('theme') || 'system'
        };
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.getElementById('clock-enabled').checked = originalSettings.clockEnabled;
        document.getElementById('search-enabled').checked = originalSettings.searchEnabled;
        languageSelect.value = originalSettings.language;

        updateStatusUI(); // Fetch current status when modal opens

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

    saveBtn.addEventListener('click', async() => {
        const selectedRestore = document.querySelector('input[name="restore-tabs"]:checked').value;
        const clockEnabled = document.getElementById('clock-enabled').checked;
        const searchEnabled = document.getElementById('search-enabled').checked;
        const selectedLanguage = languageSelect.value;
        const selectedTheme = document.querySelector('input[name="theme-mode"]:checked')?.value || 'system';
        localStorage.setItem('theme', selectedTheme);
        applyTheme(selectedTheme);
        localStorage.setItem('language', selectedLanguage);
        localStorage.setItem('restoreTabs', selectedRestore);
        localStorage.setItem('clockEnabled', clockEnabled.toString());
        clockManager.setEnabled(clockEnabled);
        searchIndexManager.setEnabled(searchEnabled);
        searchBar.setVisible(searchEnabled);


        // Apply language change
        await i18n.setLanguage(selectedLanguage);
        modal.classList.add('hidden');
    });

    async function restoreOriginalSettings() {
        localStorage.setItem('language', originalSettings.language || 'en');
        localStorage.setItem('restoreTabs', originalSettings.restoreTabs);
        localStorage.setItem('clockEnabled', originalSettings.clockEnabled.toString());
        localStorage.setItem('theme', originalSettings.theme);
        applyTheme(originalSettings.theme);
        searchIndexManager.setEnabled(originalSettings.searchEnabled);
        searchBar.setVisible(originalSettings.searchEnabled);
        clockManager.setEnabled(originalSettings.clockEnabled);
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.getElementById('clock-enabled').checked = originalSettings.clockEnabled;
        document.getElementById('search-enabled').checked = originalSettings.searchEnabled;
        document.querySelector(`input[name="theme-mode"][value="${originalSettings.theme}"]`).checked = true;
        languageSelect.value = originalSettings.language;

        await i18n.setLanguage(originalSettings.language);
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            searchIndexManager.clearHistory();
            if (customAlert) {
                // customAlert.alert('Search History Cleared', 'All search history has been removed.');
                customAlert.alert(i18n.t('history-lang.history-cleared-title'), i18n.t('history-lang.history-cleared-msg')
                );
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

    // Auto-update UI
    const checkForUpdatesBtn = document.getElementById('check-for-updates-btn');

    if (window.electronAPI && window.electronAPI.onUpdateStatus) {
        window.electronAPI.onUpdateStatus(({ status, details }) => {
            let message = status;
            if (details) {
                message += ` (${details})`;
            }
            updateStatusMessage.textContent = message;
        });
    }

    checkForUpdatesBtn.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.checkForUpdates) {
            window.electronAPI.checkForUpdates();
        }
    });
    //  Handle language change in real-time (preview)
    languageSelect.addEventListener('change', async (e) => {
        await i18n.setLanguage(e.target.value);
        searchBar.updateLanguage();
    });

    // Theme Utility functions
    function applyTheme(theme) {
        document.body.classList.remove('light');

        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            // Only add 'light' class if system is light
            if (!isDark) document.body.classList.add('light');
        } else if (theme === 'light') {
            document.body.classList.add('light');
        }

        // Broadcast theme change to all open PDF iframes
        broadcastThemeToPdfIframes(theme === 'system' ? getSystemTheme() : theme);
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }

    // Broadcast theme changes to all open PDF viewers
    function broadcastThemeToPdfIframes(theme) {
        if (window.pdfIframes && window.pdfIframes.size > 0) {
            window.pdfIframes.forEach((iframe) => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage(
                        { type: 'theme-change', theme: theme },
                        '*'
                    );
                }
            });
        }
    }

// Initial Theme on startup

const savedTheme = localStorage.getItem('theme') || 'system';

// Apply theme
applyTheme(savedTheme);

// Set radio state
const themeRadio = document.querySelector(`input[name="theme-mode"][value="${savedTheme}"]`);
if (themeRadio) {
    themeRadio.checked = true;
}

themeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        localStorage.setItem('theme', selectedTheme);
        applyTheme(selectedTheme);
    });
});

window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
        const currentTheme = localStorage.getItem('theme') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
});
