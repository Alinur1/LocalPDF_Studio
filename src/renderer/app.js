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
import TabContextMenu from './tabs/tabContext.js';
import { ClockManager } from './utils/clockManager.js';
import createPdfTab from './utils/createPdfTab.js';
import createMarkdownTab from './utils/createMarkdownTab.js';
import customAlert from './utils/customAlert.js';
import i18n from './utils/i18n.js';
import { SearchBar } from './utils/searchBar.js';
import { SearchIndexManager } from './utils/searchIndexManager.js';

window.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();

    const themeRadios = document.querySelectorAll('input[name="theme-mode"]');
    const tabManager = new TabManager('#tab-bar', '#tab-content');
    const tabContextMenu = new TabContextMenu(tabManager);
    const clockManager = new ClockManager();
    const searchIndexManager = new SearchIndexManager();
    const searchBar = new SearchBar(searchIndexManager, tabManager);
    const emptyState = document.getElementById('empty-state');
    const openFilesBtn = document.getElementById('open-files-btn');
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
    const toolsBtn = document.getElementById('tools-btn');
    const toolsMenu = document.getElementById('tools-menu');
    let toolsMenuOpen = false;

    emptyState.classList.add('hidden');

    toolsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsMenuOpen = !toolsMenuOpen;

        if (toolsMenuOpen) {
            toolsMenu.classList.add('open');
            toolsBtn.setAttribute('aria-expanded', 'true');
            // Keep empty-state transparency if menu is open
            if (emptyState && !emptyState.classList.contains('hidden')) {
                emptyState.classList.add('transparent');
            }
        } else {
            toolsMenu.classList.remove('open');
            toolsBtn.setAttribute('aria-expanded', 'false');
            if (emptyState && !emptyState.classList.contains('hidden')) {
                emptyState.classList.remove('transparent');
            }
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (toolsMenuOpen && !toolsDropdown.contains(e.target)) {
            toolsMenu.classList.remove('open');
            toolsBtn.setAttribute('aria-expanded', 'false');
            toolsMenuOpen = false;
            if (emptyState && !emptyState.classList.contains('hidden')) {
                emptyState.classList.remove('transparent');
            }
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && toolsMenuOpen) {
            e.preventDefault();
            toolsMenu.classList.remove('open');
            toolsBtn.setAttribute('aria-expanded', 'false');
            toolsMenuOpen = false;
            toolsBtn.focus();
            if (emptyState && !emptyState.classList.contains('hidden')) {
                emptyState.classList.remove('transparent');
            }
        }
    });

    // 200ms delay prevents accidental opens
    let mouseHoverTimeout;
    toolsDropdown.addEventListener('mouseenter', () => {
        if (!toolsMenuOpen && !('ontouchstart' in window)) {
            mouseHoverTimeout = setTimeout(() => {
                toolsMenu.classList.add('open');
                toolsBtn.setAttribute('aria-expanded', 'true');
            }, 200);
        }
    });

    toolsDropdown.addEventListener('mouseleave', () => {
        clearTimeout(mouseHoverTimeout);
        if (!toolsMenuOpen) {
            toolsMenu.classList.remove('open');
            toolsBtn.setAttribute('aria-expanded', 'false');
        }
    });

    toolsMenu.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            setTimeout(() => {
                toolsMenu.classList.remove('open');
                toolsBtn.setAttribute('aria-expanded', 'false');
                toolsMenuOpen = false;
                if (emptyState && !emptyState.classList.contains('hidden')) {
                    emptyState.classList.remove('transparent');
                }
            }, 100);
        }
    });

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

    async function migrateLocalStorageToJson() {
        try {
            const oldTabsRaw = localStorage.getItem('pdfTabs');
            const oldIndexRaw = localStorage.getItem('pdfSearchIndex');
            if (oldTabsRaw) {
                const oldState = JSON.parse(oldTabsRaw);
                if (oldState.tabs && Array.isArray(oldState.tabs) && oldState.tabs.length > 0) {
                    const tabs = (oldState.tabOrder || []).map((tabId, idx) => {
                        const found = oldState.tabs.find(t => t.id === tabId);
                        return found ? {
                            tabId: found.id,
                            filePath: found.filePath,
                            title: found.title,
                            tabOrder: idx
                        } : null;
                    }).filter(Boolean);

                    await window.pdfTabsAPI.save(tabs, oldState.activeTabId || null);
                    console.log(`Migration: moved ${tabs.length} tab(s) from localStorage to Json`);
                }
                localStorage.removeItem('pdfTabs');
            }
            if (oldIndexRaw) {
                const oldIndex = JSON.parse(oldIndexRaw);
                if (oldIndex.files && Array.isArray(oldIndex.files) && oldIndex.files.length > 0) {
                    for (const file of oldIndex.files) {
                        await window.searchAPI.addEntry(file.filePath);
                    }
                    console.log(`Migration: moved ${oldIndex.files.length} search entry/entries from localStorage to Json`);
                }
                if (typeof oldIndex.enabled === 'boolean') {
                    localStorage.setItem('searchEnabled', oldIndex.enabled.toString());
                }
                localStorage.removeItem('pdfSearchIndex');
            }
        } catch (err) {
            console.error('migrateLocalStorageToJson error:', err);
        }
    }

    await migrateLocalStorageToJson();
    await restoreTabs(tabManager);
    updateEmptyState();

    let isDialogOpen = false;

    // Helper function to open PDF files
    async function openPdfFiles(filePaths) {
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
            createPdfTab(filePath, tabManager);
            searchIndexManager.addFile(filePath);
        }
        await saveTabs(tabManager);
    }

    openFilesBtn.addEventListener('click', async () => {
        if (isDialogOpen) return;

        isDialogOpen = true;
        openFilesBtn.disabled = true;
        openFilesBtn.textContent = i18n.t('nav.selecting');

        try {
            const files = await window.electronAPI.selectPdfAndMarkdown();

            if (files && files.length > 0) {
                for (const filePath of files) {
                    if (/\.md$/i.test(filePath)) {
                        await createMarkdownTab(filePath, tabManager);
                    } else {
                        createPdfTab(filePath, tabManager);
                    }
                    searchIndexManager.addFile(filePath);
                }
                await saveTabs(tabManager);
            }
        } catch (error) {
            console.error('Error opening files:', error);
        } finally {
            isDialogOpen = false;
            openFilesBtn.disabled = false;
            openFilesBtn.textContent = 'Open PDF/Markdown viewer';
        }
    });

    // Handle files opened via OS "Open with LocalPDF Studio" or second-instance events
    if (window.electronAPI && window.electronAPI.onOpenFile) {
        window.electronAPI.onOpenFile(async (filePath) => {
            try {
                if (!filePath) return;
                if (/\.md$/i.test(filePath)) {
                    await createMarkdownTab(filePath, tabManager);
                    searchIndexManager.addFile(filePath);
                    await saveTabs(tabManager);
                } else {
                    await openPdfFiles([filePath]);
                }
            } catch (err) {
                console.error('Error opening file from OS:', err);
            }
        });
    }

    // Request any queued PDF files that were opened before app was ready
    try {
        if (window.electronAPI && window.electronAPI.getQueuedFiles) {
            const queuedFiles = await window.electronAPI.getQueuedFiles();
            if (queuedFiles && queuedFiles.length > 0) {
                console.log(`Received ${queuedFiles.length} queued PDF file(s)`);
                for (const filePath of queuedFiles) {
                    if (/\.md$/i.test(filePath)) {
                        await createMarkdownTab(filePath, tabManager);
                        searchIndexManager.addFile(filePath);
                    } else {
                        await openPdfFiles([filePath]);
                    }
                }
                await saveTabs(tabManager);
            }
        }
    } catch (err) {
        console.error('Error retrieving queued PDF files:', err);
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

        // Receive keystrokes from PDF.js
        // Close active tabs = CTRL/CMD+W
        if (event.data?.type === 'close-active-tab') {
            if (tabManager.activeTabId) {
                tabManager.closeTab(tabManager.activeTabId);
            }
        }

        // Switch between tabs = Ctrl/Cmd+Tab & Ctrl/Cmd+Shift+Tab
        if (event.data?.type === 'switch-tab') {
            if (event.data.direction === 'next') {
                tabManager.switchToNextTab();
            } else if (event.data.direction === 'previous') {
                tabManager.switchToPreviousTab();
            }
        }

        // Toggle sidebar = Ctrl/Cmd+B
        if (event.data?.type === 'toggle-sidebar') {
            const isVisible = tabBar.style.display !== 'none';
            updateSidebarState(!isVisible);
        }
    });

    const tabBar = document.getElementById('tab-bar');
    const resizer = document.getElementById('resizer');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    tabBar.style.width = '220px';
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        tabBar.style.width = savedWidth;
    }

    // Sidebar visibility toggle
    const sidebarVisible = localStorage.getItem('sidebarVisible') !== 'false';
    
    function updateSidebarState(visible) {
        if (visible) {
            tabBar.classList.remove('sidebar-hidden');
            resizer.classList.remove('sidebar-hidden');
            tabBar.style.display = 'flex';
            localStorage.setItem('sidebarVisible', 'true');
        } else {
            tabBar.classList.add('sidebar-hidden');
            resizer.classList.add('sidebar-hidden');
            tabBar.style.display = 'none';
            localStorage.setItem('sidebarVisible', 'false');
        }
    }

    // Initialize sidebar visibility
    updateSidebarState(sidebarVisible);

    // Toggle sidebar on button click
    sidebarToggleBtn.addEventListener('click', () => {
        const isVisible = tabBar.style.display !== 'none';
        updateSidebarState(!isVisible);
    });

    // Toggle sidebar with Ctrl+B (Windows/Linux) or Cmd+B (macOS)
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

        if (ctrlOrCmd && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            const isVisible = tabBar.style.display !== 'none';
            updateSidebarState(!isVisible);
        }
    });

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';

        const handleMouseMove = (e) => {
            const sidebarWidth = e.clientX;
            if (sidebarWidth >= 100 && sidebarWidth <= 600) {
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

    async function saveTabs(manager) {
        try {
            const tabOrder = manager.getTabOrder();

            const tabs = Array.from(manager.tabs.entries()).map(([id, tab]) => {
                let filePath = '';
                let type = 'pdf'; // default filetype

                // Markdown tabs
                if (tab.type === 'markdown' && tab.filePath) {
                    filePath = tab.filePath;
                    type = 'markdown';
                } else {
                    // PDF tabs
                    const rawSrc = tab.content.querySelector('iframe')?.src || '';
                    filePath = decodeURIComponent(
                        rawSrc.replace(/^.*file:\/\//, '').replace(/\?.*$/, '')
                    );
                    if (/^\/[A-Za-z]:[\\/]/.test(filePath)) {
                        filePath = filePath.slice(1);
                    }
                    type = 'pdf';
                }

                return {
                    tabId: id,
                    filePath: filePath,
                    title: tab.tabButton.querySelector('.tab-title')?.textContent || 'Untitled',
                    tabOrder: tabOrder.indexOf(id),
                    type: type
                };
            });

            await window.pdfTabsAPI.save(tabs, manager.activeTabId);
        } catch (err) {
            console.error('saveTabs error:', err);
        }
    }

    async function restoreTabs(manager) {
        const restoreSetting = localStorage.getItem('restoreTabs') || 'restore';
        if (restoreSetting !== 'restore') return;

        try {
            const { tabs, activeTabId } = await window.pdfTabsAPI.load();
            if (!tabs || tabs.length === 0) return;

            const originalOnTabChange = manager.onTabChange;
            const originalOnTabReorder = manager.onTabReorder;
            manager.onTabChange = null;
            manager.onTabReorder = null;

            for (const tab of tabs) {
                if (tab.file_path) {
                    const tabType = tab.type || 'pdf';
                    if (tabType === 'markdown') {
                        await createMarkdownTab(tab.file_path, manager, tab.tab_id);
                    } else {
                        createPdfTab(tab.file_path, manager, tab.tab_id);
                    }
                }
            }

            if (activeTabId && manager.tabs.has(activeTabId)) {
                manager.switchTab(activeTabId);
            }

            manager.onTabChange = originalOnTabChange;
            manager.onTabReorder = originalOnTabReorder;
            await saveTabs(manager);
        } catch (err) {
            console.error('restoreTabs error:', err);
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
            theme: localStorage.getItem('theme') || 'system',
            wallpaper: localStorage.getItem('activeWallpaper') || 'none'
        };
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.querySelectorAll('.wallpaper-option').forEach(opt => { opt.classList.toggle('selected', opt.dataset.wallpaper === originalSettings.wallpaper); });
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

    // Send keystroke to the PDF.js
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

        if (ctrlOrCmd && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'f' || e.key === '0' ||
            e.key === '+' || e.key === '=' || e.key === '-')) {
            e.preventDefault();

            if (tabManager.activeTabId && window.pdfIframes) {
                const iframe = window.pdfIframes.get(tabManager.activeTabId);
                if (iframe && iframe.contentWindow) {
                    let messageType = 'pdf-print';
                    const keyLower = e.key.toLowerCase();
                    if (keyLower === 's') {
                        messageType = 'pdf-save';
                    } else if (keyLower === 'f') {
                        messageType = 'pdf-find';
                    } else if (e.key === '0') {
                        messageType = 'pdf-zoom-reset';
                    } else if (e.key === '+' || e.key === '=') {
                        messageType = 'pdf-zoom-in';
                    } else if (e.key === '-') {
                        messageType = 'pdf-zoom-out';
                    }
                    iframe.contentWindow.postMessage({
                        type: messageType
                    }, '*');
                }
            }
        }
    }, true);

    cancelBtn.addEventListener('click', () => {
        restoreOriginalSettings();
        modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', async () => {
        const selectedRestore = document.querySelector('input[name="restore-tabs"]:checked').value;
        const clockEnabled = document.getElementById('clock-enabled').checked;
        const searchEnabled = document.getElementById('search-enabled').checked;
        const selectedLanguage = languageSelect.value;
        const selectedTheme = document.querySelector('input[name="theme-mode"]:checked')?.value || 'system';
        const selectedWallpaper = document.querySelector('.wallpaper-option.selected')?.dataset.wallpaper || 'none';
        localStorage.setItem('theme', selectedTheme);
        applyTheme(selectedTheme);
        localStorage.setItem('language', selectedLanguage);
        localStorage.setItem('restoreTabs', selectedRestore);
        localStorage.setItem('clockEnabled', clockEnabled.toString());
        localStorage.setItem('activeWallpaper', selectedWallpaper);
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
        localStorage.setItem('activeWallpaper', originalSettings.wallpaper);
        applyTheme(originalSettings.theme);
        applyWallpaper(originalSettings.wallpaper);
        searchIndexManager.setEnabled(originalSettings.searchEnabled);
        searchBar.setVisible(originalSettings.searchEnabled);
        clockManager.setEnabled(originalSettings.clockEnabled);
        document.querySelector(`input[name="restore-tabs"][value="${originalSettings.restoreTabs}"]`).checked = true;
        document.getElementById('clock-enabled').checked = originalSettings.clockEnabled;
        document.getElementById('search-enabled').checked = originalSettings.searchEnabled;
        document.querySelector(`input[name="theme-mode"][value="${originalSettings.theme}"]`).checked = true;
        document.querySelectorAll('.wallpaper-option').forEach(opt => { opt.classList.toggle('selected', opt.dataset.wallpaper === originalSettings.wallpaper); });
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

    tabManager.onTabChange = () => saveTabs(tabManager).catch(console.error);
    tabManager.onTabClose = () => saveTabs(tabManager).catch(console.error);
    tabManager.onTabReorder = () => saveTabs(tabManager).catch(console.error);

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
    const savedWallpaper = localStorage.getItem('activeWallpaper') || 'none';

    // Apply theme
    applyTheme(savedTheme);
    applyWallpaper(savedWallpaper);

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

    function applyWallpaper(wallpaperId) {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        if (wallpaperId === 'none' || !wallpaperId) {
            emptyState.style.backgroundImage = 'none';
        } else {
            emptyState.style.backgroundImage = `url('./wallpapers/${wallpaperId}.jpg')`;
        }
    }

    document.querySelectorAll('.wallpaper-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.wallpaper-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            applyWallpaper(btn.dataset.wallpaper);
        });
    });
});
