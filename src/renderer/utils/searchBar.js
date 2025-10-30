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


// src/renderer/utils/searchBar.js

export class SearchBar {
    constructor(searchIndexManager, tabManager) {
        this.searchIndexManager = searchIndexManager;
        this.tabManager = tabManager;
        this.container = null;
        this.input = null;
        this.results = null;
        this.isOpen = false;

        this.createSearchBar();
        this.setupEventListeners();
    }

    createSearchBar() {
        this.container = document.createElement('div');
        this.container.className = 'search-container';
        this.container.innerHTML = `
            <div class="search-input-wrapper">
                <input type="text" id="pdf-search" placeholder="Search opened PDFs..." class="search-input">
                <span class="search-icon">🔍</span>
            </div>
            <div class="search-results hidden"></div>
        `;

        this.input = this.container.querySelector('#pdf-search');
        this.results = this.container.querySelector('.search-results');
        const topBar = document.querySelector('.top-bar');
        topBar.appendChild(this.container);
    }

    setupEventListeners() {
        this.input.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        this.input.addEventListener('focus', () => {
            this.isOpen = true;
            this.handleSearch(this.input.value);
        });

        this.input.addEventListener('blur', () => {
            setTimeout(() => {
                this.isOpen = false;
                this.hideResults();
            }, 200);
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.input.blur();
                this.hideResults();
            }
        });
    }

    async handleSearch(query) {
        if (!query.trim()) {
            this.hideResults();
            return;
        }

        const results = this.searchIndexManager.search(query);
        await this.displayResults(results);
    }

    async displayResults(results) {
        this.results.innerHTML = '';

        if (results.length === 0) {
            this.results.innerHTML = '<div class="search-no-results">No matching PDFs found</div>';
            this.showResults();
            return;
        }

        for (const file of results.slice(0, 8)) {
            // Show max 8 results
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';

            const isValid = await this.searchIndexManager.validateFile(file.filePath);
            resultItem.classList.toggle('file-missing', !isValid);

            resultItem.innerHTML = `
                <div class="search-result-content">
                    <div class="search-result-title">${file.fileName}</div>
                    <div class="search-result-path">${file.filePath}</div>
                    <div class="search-result-meta">
                        Opened ${file.openCount} times • ${new Date(file.lastOpened).toLocaleDateString()}
                    </div>
                </div>
                ${!isValid ? '<div class="file-missing-badge">File not found</div>' : ''}
            `;

            if (isValid) {
                resultItem.addEventListener('click', () => {
                    this.openFile(file.filePath);
                });
            }

            this.results.appendChild(resultItem);
        }

        this.showResults();
    }

    openFile(filePath) {
        this.createPdfTab(filePath, this.tabManager);
        this.input.value = '';
        this.hideResults();
        this.input.blur();
    }

    createPdfTab(filePath, tabManager) {
        const tabId = `pdf:${filePath}:${Date.now()}`;
        const title = filePath.split(/[\\/]/).pop();

        const iframe = document.createElement('iframe');
        iframe.src = `../pdf/web/viewer.html?file=file://${filePath}`;
        iframe.style.width = '90%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.margin = 'auto';
        iframe.style.display = 'block';

        iframe.addEventListener('load', () => {
            const iframeWin = iframe.contentWindow;
            const iframeDoc = iframeWin.document;

            iframeWin.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
                    e.preventDefault();
                    const event = new KeyboardEvent('keydown', {
                        key: 'w',
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                        bubbles: true
                    });
                    window.dispatchEvent(event);
                }
            });

            iframeDoc.addEventListener('click', (e) => {
                const link = e.target.closest('a[href]');
                if (link && /^https?:/i.test(link.href)) {
                    e.preventDefault();
                    iframeWin.parent.postMessage(
                        { type: 'open-external', url: link.href },
                        '*'
                    );
                }
            });
        });

        tabManager.openTab({
            id: tabId,
            type: 'pdf',
            title,
            content: iframe,
            closable: true,
            onClose: () => {
                iframe.src = 'about:blank';
                iframe.remove();
            }
        });
    }

    showResults() {
        this.results.classList.remove('hidden');
    }

    hideResults() {
        this.results.classList.add('hidden');
    }

    setVisible(visible) {
        this.container.style.display = visible ? 'block' : 'none';

        if (!visible) {
            this.input.value = '';
            this.hideResults();
        }
    }
}