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


// src/renderer/utils/searchIndexManager.js

export class SearchIndexManager {
    constructor() {
        this._enabled = localStorage.getItem('searchEnabled') === 'true';
    }

    isEnabled() {
        return this._enabled;
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        localStorage.setItem('searchEnabled', enabled.toString());
    }

    addFile(filePath) {
        if (!this._enabled) return;
        if (!filePath) return;

        window.searchAPI.addEntry(filePath).catch(err => {
            localpdfStudio.log("addFile error, searchIndexManager.js: " + err);
            console.error('searchIndexManager.addFile error:', err);
        });
    }

    async search(query) {
        if (!this._enabled || !query || !query.trim()) return [];

        try {
            return await window.searchAPI.query(query.trim());
        } catch (err) {
            localpdfStudio.log("search error, searchIndexManager.js: " + err);
            console.error('searchIndexManager.search error:', err);
            return [];
        }
    }

    async clearHistory() {
        try {
            await window.searchAPI.clear();
        } catch (err) {
            localpdfStudio.log("clearHistory error, searchIndexManager.js: " + err);
            console.error('searchIndexManager.clearHistory error:', err);
        }
    }

    async validateFile(filePath) {
        try {
            const fileInfo = await window.electronAPI.getFileInfo(filePath);
            return fileInfo.size > 0;
        } catch (error) {
            return false;
        }
    }
}
