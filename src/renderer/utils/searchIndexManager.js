/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


// src/renderer/utils/searchIndexManager.js

export class SearchIndexManager {
    constructor() {
        this.index = {
            enabled: false,
            files: []
        };
        this.loadIndex();
    }

    loadIndex() {
        try {
            const saved = localStorage.getItem('pdfSearchIndex');
            if (saved) {
                this.index = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load search index:', error);
            this.index = { enabled: false, files: [] };
        }
    }

    saveIndex() {
        try {
            localStorage.setItem('pdfSearchIndex', JSON.stringify(this.index));
        } catch (error) {
            console.error('Failed to save search index:', error);
        }
    }

    setEnabled(enabled) {
        this.index.enabled = enabled;
        this.saveIndex();
    }

    isEnabled() {
        return this.index.enabled;
    }

    addFile(filePath) {
        if (!this.index.enabled) return;

        const fileName = filePath.split(/[\\/]/).pop();
        const existingIndex = this.index.files.findIndex(file => file.filePath === filePath);

        if (existingIndex >= 0) {
            this.index.files[existingIndex].lastOpened = new Date().toISOString();
            this.index.files[existingIndex].openCount += 1;
        } else {
            this.index.files.push({
                filePath,
                fileName,
                lastOpened: new Date().toISOString(),
                openCount: 1
            });
        }
        if (this.index.files.length > 100) {
            this.index.files = this.index.files
                .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
                .slice(0, 100);
        }

        this.saveIndex();
    }

    search(query) {
        if (!this.index.enabled || !query.trim()) return [];

        const searchTerm = query.toLowerCase();
        return this.index.files
            .filter(file =>
                file.fileName.toLowerCase().includes(searchTerm) ||
                file.filePath.toLowerCase().includes(searchTerm)
            )
            .sort((a, b) => {
                const aNameMatch = a.fileName.toLowerCase().includes(searchTerm);
                const bNameMatch = b.fileName.toLowerCase().includes(searchTerm);

                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;

                return new Date(b.lastOpened) - new Date(a.lastOpened);
            });
    }

    clearHistory() {
        this.index.files = [];
        this.saveIndex();
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
