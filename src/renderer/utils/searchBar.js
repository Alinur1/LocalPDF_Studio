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


// src/renderer/utils/searchBar.js

import i18n from "./i18n.js";

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
        this.setupThemeObserver(); // Add theme observer
    }

    createSearchBar() {
        this.container = document.createElement('div');
        this.container.className = 'search-container';
        this.container.innerHTML = `
            <div class="search-input-wrapper">
                <input type="text" id="pdf-search" placeholder="" class="search-input">
                <span class="search-icon">🔍</span>
            </div>
            <div class="search-results hidden"></div>
        `;

        this.input = this.container.querySelector('#pdf-search');
        this.results = this.container.querySelector('.search-results');
        const topBar = document.querySelector('.top-bar');
        topBar.appendChild(this.container);

        // Set initial placeholder
        this.updatePlaceholder();
        // Apply initial theme styles
        this.applyThemeStyles();
    }

    setupThemeObserver() {
        // Observe theme changes on body
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    this.applyThemeStyles();
                }
            });
        });

        observer.observe(document.body, { attributes: true });
    }

    applyThemeStyles() {
        // This will automatically use CSS variables defined in main.css
        // No additional styling needed here since we're using CSS variables
    }

    updatePlaceholder() {
        this.input.placeholder = i18n.t('search.placeholder');
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

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
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
            this.results.innerHTML = `<div class="search-no-results">${i18n.t('search.noResults')}</div>`;
            this.showResults();
            return;
        }

        for (const file of results.slice(0, 8)) {
            // Show max 8 results
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';

            const isValid = await this.searchIndexManager.validateFile(file.filePath);
            resultItem.classList.toggle('file-missing', !isValid);

            // Use CSS variables for inline styles
            resultItem.style.cssText = `
                border-bottom: 1px solid var(--border-color);
                color: var(--text-primary);
                transition: background-color 0.2s ease;
            `;

            resultItem.innerHTML = `
                <div class="search-result-content">
                    <div class="search-result-title" style="color: var(--text-primary);">${file.fileName}</div>
                    <div class="search-result-path" style="color: var(--text-secondary);">${file.filePath}</div>
                    <div class="search-result-meta" style="color: var(--text-tertiary);">
                        ${i18n.t('search.opened')} ${file.openCount} ${i18n.t('search.times')} • ${new Date(file.lastOpened).toLocaleDateString()}
                    </div>
                </div>
                ${!isValid ? `<div class="file-missing-badge" style="background: #e74c3c; color: white;">${i18n.t('search.fileNotFound')}</div>` : ''}
            `;

            if (isValid) {
                resultItem.addEventListener('click', () => {
                    this.openFile(file.filePath);
                });

                resultItem.addEventListener('mouseenter', () => {
                    resultItem.style.backgroundColor = 'var(--accent-color)';
                    resultItem.style.color = 'white';
                    resultItem.querySelector('.search-result-title').style.color = 'white';
                    resultItem.querySelector('.search-result-path').style.color = 'rgba(255, 255, 255, 0.9)';
                    resultItem.querySelector('.search-result-meta').style.color = 'rgba(255, 255, 255, 0.8)';
                });

                resultItem.addEventListener('mouseleave', () => {
                    resultItem.style.backgroundColor = '';
                    resultItem.style.color = 'var(--text-primary)';
                    resultItem.querySelector('.search-result-title').style.color = 'var(--text-primary)';
                    resultItem.querySelector('.search-result-path').style.color = 'var(--text-secondary)';
                    resultItem.querySelector('.search-result-meta').style.color = 'var(--text-tertiary)';
                });
            } else {
                resultItem.style.cursor = 'not-allowed';
                resultItem.addEventListener('mouseenter', () => {
                    resultItem.style.backgroundColor = '#e74c3c';
                });

                resultItem.addEventListener('mouseleave', () => {
                    resultItem.style.backgroundColor = '';
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
        // Ensure proper styling when showing results
        this.results.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-top: 4px;
            max-height: 400px;
            overflow-y: auto;
            box-shadow: 0 8px 24px var(--shadow-color);
            z-index: 1003;
        `;
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

    // Called when language changes to update dynamic text
    updateLanguage() {
        this.updatePlaceholder();
        // Re-display results with updated translations if search is active
        if (this.isOpen && this.input.value.trim()) {
            const results = this.searchIndexManager.search(this.input.value);
            this.displayResults(results);
        }
    }
}