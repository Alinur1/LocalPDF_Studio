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


// src/main/services/pdfTabsService.js

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const userData = app.getPath('userData');
const TABS_FILE = path.join(userData, 'pdf-tabs.json');
const SEARCH_FILE = path.join(userData, 'pdf-search-index.json');
const MAX_SEARCH_ENTRIES = 500;

function readJSON(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`pdfTabsService: failed to read ${filePath}:`, err);
        return defaultValue;
    }
}

function writeJSON(filePath, data) {
    const tmpPath = filePath + '.tmp';
    try {
        const json = JSON.stringify(data, null, 2);
        fs.writeFileSync(tmpPath, json, 'utf-8');
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        console.error(`pdfTabsService: failed to write ${filePath}:`, err);
        // Clean up the orphaned temp file if it was created
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) { }
        throw err;
    }
}

const pdfTabsService = {
    saveTabs(tabs, activeTabId) {
        try {
            const state = {
                activeTabId: activeTabId || null,
                tabs: (tabs || []).map(({ tabId, filePath, title, tabOrder }) => ({
                    tab_id: tabId,
                    file_path: filePath,
                    title: title,
                    tab_order: tabOrder
                }))
            };
            writeJSON(TABS_FILE, state);
            return true;
        } catch (err) {
            console.error('pdfTabsService.saveTabs error:', err);
            return false;
        }
    },

    loadTabs() {
        try {
            const state = readJSON(TABS_FILE, { tabs: [], activeTabId: null });
            const tabs = (state.tabs || []).sort((a, b) => a.tab_order - b.tab_order);
            return {
                tabs: tabs,
                activeTabId: state.activeTabId || null
            };
        } catch (err) {
            console.error('pdfTabsService.loadTabs error:', err);
            return { tabs: [], activeTabId: null };
        }
    },

    clearTabs() {
        try {
            writeJSON(TABS_FILE, { tabs: [], activeTabId: null });
            return true;
        } catch (err) {
            console.error('pdfTabsService.clearTabs error:', err);
            return false;
        }
    },

    addSearchEntry(filePath) {
        try {
            const fileName = filePath.split(/[\\/]/).pop();
            const lastOpened = new Date().toISOString();

            let entries = readJSON(SEARCH_FILE, []);

            const existingIdx = entries.findIndex(e => e.file_path === filePath);

            if (existingIdx >= 0) {
                entries[existingIdx].last_opened = lastOpened;
                entries[existingIdx].open_count += 1;
            } else {
                entries.push({
                    file_path: filePath,
                    file_name: fileName,
                    last_opened: lastOpened,
                    open_count: 1
                });
            }

            // Trim to MAX_SEARCH_ENTRIES most recently opened
            if (entries.length > MAX_SEARCH_ENTRIES) {
                entries.sort((a, b) => b.last_opened.localeCompare(a.last_opened));
                entries = entries.slice(0, MAX_SEARCH_ENTRIES);
            }

            writeJSON(SEARCH_FILE, entries);
            return true;
        } catch (err) {
            console.error('pdfTabsService.addSearchEntry error:', err);
            return false;
        }
    },

    searchFiles(query) {
        try {
            const entries = readJSON(SEARCH_FILE, []);
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');

            const matched = entries.filter(e =>
                regex.test(e.file_name) || regex.test(e.file_path)
            );

            // Filename matches bubble to the top, then sort by recency within each group
            matched.sort((a, b) => {
                const aName = regex.test(a.file_name);
                const bName = regex.test(b.file_name);
                if (aName && !bName) return -1;
                if (!aName && bName) return 1;
                return b.last_opened.localeCompare(a.last_opened);
            });

            return matched.slice(0, 8);
        } catch (err) {
            console.error('pdfTabsService.searchFiles error:', err);
            return [];
        }
    },

    getAllSearchEntries() {
        try {
            const entries = readJSON(SEARCH_FILE, []);
            return entries.sort((a, b) => b.last_opened.localeCompare(a.last_opened));
        } catch (err) {
            console.error('pdfTabsService.getAllSearchEntries error:', err);
            return [];
        }
    },

    clearSearchIndex() {
        try {
            writeJSON(SEARCH_FILE, []);
            return true;
        } catch (err) {
            console.error('pdfTabsService.clearSearchIndex error:', err);
            return false;
        }
    }
};

module.exports = pdfTabsService;