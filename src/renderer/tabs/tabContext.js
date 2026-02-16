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


// src/renderer/tabs/tabContext.js

import i18n from "../utils/i18n.js";

export default class TabContextMenu {
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.contextMenu = null;
        this.currentTabId = null;

        this.createContextMenu();
        this.attachContextMenuListeners();

        document.addEventListener('languageChanged', () => {
            this.updateTranslations();
        });
    }

    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'tab-context-menu hidden';
        this.contextMenu.innerHTML = this.getMenuHTML();
        document.body.appendChild(this.contextMenu);

        this.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleMenuAction(action, this.currentTabId);
                this.hideContextMenu();
            });
        });
    }

    getMenuHTML() {
        return `
            <div class="context-menu-item" data-action="close-this">${i18n.t('tabContext.closeThisTab')}</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-all-but-this">${i18n.t('tabContext.closeAllButThis')}</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-above">${i18n.t('tabContext.closeTheTabsAbove')}</div>
            <div class="context-menu-item" data-action="close-below">${i18n.t('tabContext.closeTheTabsBelow')}</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-all">${i18n.t('tabContext.closeAll')}</div>
        `;
    }

    updateTranslations() {
        // Recreate the menu with new translations
        this.contextMenu.innerHTML = this.getMenuHTML();

        // Attach click handlers to menu items
        this.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleMenuAction(action, this.currentTabId);
                this.hideContextMenu();
            });
        });
    }

    attachContextMenuListeners() {
        // Add right-click listeners to tab bar
        this.tabManager.tabBar.addEventListener('contextmenu', (e) => {
            const tab = e.target.closest('.tab');
            if (tab) {
                e.preventDefault();
                this.currentTabId = tab.dataset.tabId;
                this.updateTranslations();
                this.showContextMenu(e.clientX, e.clientY);
            }
        });

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', () => {
            this.hideContextMenu();
        });

        // Hide context menu on scroll
        this.tabManager.tabBar.addEventListener('scroll', () => {
            this.hideContextMenu();
        });

        // Hide context menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
            }
        });
    }

    showContextMenu(x, y) {
        this.contextMenu.classList.remove('hidden');
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';

        // Adjust position if menu goes outside viewport
        setTimeout(() => {
            const rect = this.contextMenu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                this.contextMenu.style.left = (x - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                this.contextMenu.style.top = (y - rect.height) + 'px';
            }
        }, 0);
    }

    hideContextMenu() {
        this.contextMenu.classList.add('hidden');
    }

    handleMenuAction(action, tabId) {
        const allTabs = Array.from(this.tabManager.tabBar.querySelectorAll('.tab'));
        const currentTabIndex = allTabs.findIndex(tab => tab.dataset.tabId === tabId);

        switch (action) {
            case 'close-this':
                this.tabManager.closeTab(tabId);
                break;

            case 'close-all-but-this':
                allTabs.forEach((tab, index) => {
                    if (index !== currentTabIndex) {
                        this.tabManager.closeTab(tab.dataset.tabId);
                    }
                });
                break;

            case 'close-above':
                allTabs.forEach((tab, index) => {
                    if (index < currentTabIndex) {
                        this.tabManager.closeTab(tab.dataset.tabId);
                    }
                });
                break;

            case 'close-below':
                allTabs.forEach((tab, index) => {
                    if (index > currentTabIndex) {
                        this.tabManager.closeTab(tab.dataset.tabId);
                    }
                });
                break;

            case 'close-all':
                allTabs.forEach((tab) => {
                    this.tabManager.closeTab(tab.dataset.tabId);
                });
                break;
        }
    }
}
