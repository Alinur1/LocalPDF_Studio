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

export default class TabContextMenu {
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.contextMenu = null;
        this.currentTabId = null;
        
        this.createContextMenu();
        this.attachContextMenuListeners();
    }

    createContextMenu() {
        // Create context menu container
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'tab-context-menu hidden';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="close-this">Close this tab</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-all-but-this">Close all but this</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-above">Close the tabs above</div>
            <div class="context-menu-item" data-action="close-below">Close the tabs below</div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" data-action="close-all">Close all</div>
        `;
        
        document.body.appendChild(this.contextMenu);

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
