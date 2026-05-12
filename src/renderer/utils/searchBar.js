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
import createPdfTab from "./createPdfTab.js";

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
                <span class="search-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-icon lucide-search"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
                </span>
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
        const observer = new MutationObserver(() => this.applyThemeStyles());
        observer.observe(document.body, { attributes: true });
    }

    applyThemeStyles() {
        // Intentionally empty — relies on CSS variables defined in main.css
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
        const results = await this.searchIndexManager.search(query);
        await this.displayResults(results);
    }

    async displayResults(results) {
        this.results.innerHTML = '';

        if (!results || results.length === 0) {
            this.results.innerHTML = `<div class="search-no-results">${i18n.t('search.noResults')}</div>`;
            this.showResults();
            return;
        }

        for (const file of results) {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';

            const filePath = file.file_path;
            const fileName = file.file_name;
            const openCount = file.open_count;
            const lastOpened = file.last_opened;

            const isValid = await this.searchIndexManager.validateFile(filePath);
            resultItem.classList.toggle('file-missing', !isValid);

            resultItem.style.cssText = `
                border-bottom: 1px solid var(--border-color);
                color: var(--text-primary);
            `;

            resultItem.innerHTML = `
                <div class="search-result-content">
                    <div class="search-result-title" style="color: var(--text-primary);">${fileName}</div>
                    <div class="search-result-path" style="color: var(--text-secondary);">${filePath}</div>
                    <div class="search-result-meta" style="color: var(--text-tertiary);">
                        ${i18n.t('search.opened')} ${openCount} ${i18n.t('search.times')} • ${new Date(lastOpened).toLocaleDateString()}
                    </div>
                </div>
                ${!isValid ? `<div class="file-missing-badge" style="background: #e74c3c; color: white;">${i18n.t('search.fileNotFound')}</div>` : ''}
            `;

            if (isValid) {
                resultItem.addEventListener('click', () => this.openFile(filePath));

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

    async openFile(filePath) {
        const ext = filePath.toLowerCase().split('.').pop();
        if (ext === 'md' || ext === 'markdown') {
            const { default: createMarkdownTab } = await import('./createMarkdownTab.js');
            await createMarkdownTab(filePath, this.tabManager);
        } else if (ext === 'pdf') {
            createPdfTab(filePath, this.tabManager);
        }
        this.searchIndexManager.addFile(filePath);
        this.input.value = '';
        this.hideResults();
        this.input.blur();
    }

    showResults() {
        this.results.classList.remove('hidden');
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

    updateLanguage() {
        this.updatePlaceholder();
        if (this.isOpen && this.input.value.trim()) {
            this.handleSearch(this.input.value);
        }
    }
}