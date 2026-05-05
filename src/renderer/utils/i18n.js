/**
 * LocalPDF Studio - Internationalization (i18n) Manager
 * =====================================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 */

// src/renderer/utils/i18n.js

class I18n {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.loaded = false;
    }

    async loadLanguage(lang) {
        try {
            console.log(`Loading language: ${lang}`);

            // Determine base path based on current location
            const getBasePath = () => {
                const path = window.location.pathname;
                if (path.includes('/about/'))
                {
                    return '../';
                }
                if (path.includes('/donate/'))
                {
                    return '../';
                }
                if (path.includes('/credits/'))
                {
                    return '../';
                }
                if (path.includes('/tools/'))
                {
                    return '../../';
                }
                else
                {
                    return './';
                }
            };

            const basePath = getBasePath();
            const languageFiles = {
                'en': `${basePath}locales/en/en.json`,
                'bn': `${basePath}locales/bn/bn.json`,
                'jp': `${basePath}locales/jp/jp.json`,
                'chi': `${basePath}locales/chi/chi.json`,
            };

            const filePath = languageFiles[lang];
            if (!filePath) {
                console.error(`Language ${lang} not supported`);
                return false;
            }

            console.log(`Fetching language file: ${filePath}`);
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load language file: ${filePath}, Status: ${response.status}`);
            }

            this.translations[lang] = await response.json();
            return true;
        } catch (error) {
            console.error(`Error loading language ${lang}:`, error);
            return false;
        }
    }

    async init() {
        console.log('Initializing i18n with language:', this.currentLanguage);
        try {
            // Load the current language
            const success = await this.loadLanguage(this.currentLanguage);
            if (success) {
                console.log('i18n initialized successfully with language:', this.currentLanguage);
                this.loaded = true;
                this.updateUI();
                return true;
            } else {
                console.error('Failed to initialize i18n: Language loading failed');
                return false;
            }
        } catch (error) {
            console.error('Error initializing i18n:', error);
            return false;
        }
    }

    async setLanguage(lang) {
        // Load the language if not already loaded
        if (!this.translations[lang]) {
            const success = await this.loadLanguage(lang);
            if (!success) {
                console.error(`Failed to set language: ${lang}`);
                return;
            }
        }

        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        this.updateUI();
    }

    // t(key) {
    //     if (!this.translations[this.currentLanguage]) {
    //         return key;
    //     }
    //     return this.translations[this.currentLanguage][key] || key;
    // }
    t(key) {
        if (!this.translations[this.currentLanguage]) return key;

        // This allows you to use "tools.tool-merge" to access nested objects
        return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), this.translations[this.currentLanguage]) || key;
    }

    updateUI() {
        if (!this.loaded) return;

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);

            if (element.tagName === 'INPUT' && element.type === 'button') {
                element.value = translation;
            } else if (element.tagName === 'BUTTON') {
                // Preserve icons and update only text content
                const icon = element.querySelector('.btn-icon, .modal-icon, .category-icon, .note-icon');
                if (icon) {
                    element.childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            node.textContent = translation;
                        }
                    });
                } else {
                    element.textContent = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Update all elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });

        // Update language select options
        document.querySelectorAll('#language-select option').forEach(option => {
            const langKey = `history-lang.lang-${option.value}`;
            option.textContent = this.t(langKey);
        });
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// Create and export singleton instance
const i18n = new I18n();
export default i18n;