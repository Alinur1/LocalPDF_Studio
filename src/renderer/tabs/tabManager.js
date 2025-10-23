// src/renderer/tabs/tabManager.js

export default class TabManager {
    constructor(tabBarSelector, tabContentSelector) {
        this.tabBar = document.querySelector(tabBarSelector);
        this.tabContent = document.querySelector(tabContentSelector);
        this.tabs = new Map();
        this.activeTabId = null;
        this.navigationHistory = [];
        this.onTabChange = null;
        this.onTabClose = null;
        this.onTabReorder = null;

        // Enable tab reordering
        this.enableTabReordering();

        // Close active tab with Ctrl/Cmd+W
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                if (this.activeTabId) {
                    this.closeTab(this.activeTabId);
                }
            }
        });
    }

    enableTabReordering() {
        // Make all tabs draggable
        this.tabBar.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('tab') || e.target.closest('.tab')) {
                const tab = e.target.classList.contains('tab') ? e.target : e.target.closest('.tab');
                tab.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';

                // Set drag image to the tab itself for better visual feedback
                e.dataTransfer.setDragImage(tab, 20, 20);
            }
        });

        this.tabBar.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = this.tabBar.querySelector('.dragging');
            if (!dragging) return;

            // Remove any existing drag-over indicators
            this.tabBar.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
                el.classList.remove('drag-over-above', 'drag-over-below');
            });

            const afterElement = this.getDragAfterElement(this.tabBar, e.clientY);

            if (afterElement == null) {
                // Dragging to the bottom
                const lastTab = this.tabBar.lastElementChild;
                if (lastTab && lastTab !== dragging) {
                    lastTab.classList.add('drag-over-below');
                }
            } else {
                // Dragging above an element
                afterElement.classList.add('drag-over-above');
            }
        });

        this.tabBar.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });

        this.tabBar.addEventListener('dragleave', (e) => {
            // Only remove indicators if leaving the tab bar entirely
            if (!e.relatedTarget || !this.tabBar.contains(e.relatedTarget)) {
                this.tabBar.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
                    el.classList.remove('drag-over-above', 'drag-over-below');
                });
            }
        });

        this.tabBar.addEventListener('drop', (e) => {
            e.preventDefault();
            const dragging = this.tabBar.querySelector('.dragging');
            if (!dragging) return;

            // Clear all drag indicators
            this.tabBar.querySelectorAll('.drag-over-above, .drag-over-below').forEach(el => {
                el.classList.remove('drag-over-above', 'drag-over-below');
            });

            const afterElement = this.getDragAfterElement(this.tabBar, e.clientY);

            if (afterElement == null) {
                this.tabBar.appendChild(dragging);
            } else {
                this.tabBar.insertBefore(dragging, afterElement);
            }

            dragging.classList.remove('dragging');
            this.updateTabOrder();

            if (this.onTabReorder) this.onTabReorder();
        });

        this.tabBar.addEventListener('dragend', (e) => {
            // Clear all drag states
            this.tabBar.querySelectorAll('.dragging, .drag-over-above, .drag-over-below').forEach(el => {
                el.classList.remove('dragging', 'drag-over-above', 'drag-over-below');
            });
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.tab:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    updateTabOrder() {
        // Update internal tab order based on DOM order
        const orderedTabs = [...this.tabBar.querySelectorAll('.tab')].map(tab =>
            tab.dataset.tabId
        );

        // Reorder the tabs map to match DOM order
        const newTabs = new Map();
        orderedTabs.forEach(tabId => {
            if (this.tabs.has(tabId)) {
                newTabs.set(tabId, this.tabs.get(tabId));
            }
        });
        this.tabs = newTabs;
    }

    openTab({ id, title, content, onClose }) {
        if (this.tabs.has(id)) {
            this.switchTab(id);
            return;
        }

        // Tab button
        const tabButton = document.createElement('div');
        tabButton.classList.add('tab');
        tabButton.dataset.tabId = id;
        tabButton.draggable = true; // Enable dragging
        tabButton.addEventListener('click', (e) => {
            // Don't switch tabs if user is trying to drag
            if (!e.target.classList.contains('tab-close')) {
                this.switchTab(id);
            }
        });

        const tabTitle = document.createElement('span');
        tabTitle.classList.add('tab-title');
        tabTitle.textContent = title;
        tabButton.appendChild(tabTitle);

        const closeBtn = document.createElement('span');
        closeBtn.classList.add('tab-close');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(id);
        });
        tabButton.appendChild(closeBtn);

        // Tab content
        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('tab-content');
        contentWrapper.dataset.tabId = id;
        contentWrapper.appendChild(content);

        this.tabBar.appendChild(tabButton);
        this.tabContent.appendChild(contentWrapper);

        this.tabs.set(id, { tabButton, contentWrapper, content, onClose });
        this.switchTab(id);
        if (this.onTabChange) this.onTabChange();
    }

    switchTab(id) {
        if (!this.tabs.has(id)) return;

        // Update navigation history
        this.navigationHistory = this.navigationHistory.filter(tabId => tabId !== id);
        this.navigationHistory.push(id);

        for (const [_, tab] of this.tabs) {
            tab.tabButton.classList.remove('active');
            tab.contentWrapper.style.display = 'none';
        }
        const targetTab = this.tabs.get(id);
        targetTab.tabButton.classList.add('active');
        targetTab.contentWrapper.style.display = 'block';
        this.activeTabId = id;
        if (this.onTabChange) this.onTabChange();
    }

    closeTab(id) {
        if (!this.tabs.has(id)) return;
        const tab = this.tabs.get(id);

        if (tab.onClose) {
            try { tab.onClose(); } catch (err) { console.error(err); }
        }

        tab.tabButton.remove();
        tab.contentWrapper.remove();
        this.tabs.delete(id);

        // Remove from history
        this.navigationHistory = this.navigationHistory.filter(tabId => tabId !== id);

        if (this.activeTabId === id) {
            if (this.navigationHistory.length > 0) {
                // Switch to the last tab in the history
                this.switchTab(this.navigationHistory[this.navigationHistory.length - 1]);
            } else {
                // Fallback to the first remaining tab if history is empty
                const remaining = Array.from(this.tabs.keys());
                if (remaining.length > 0) {
                    this.switchTab(remaining[0]);
                } else {
                    this.activeTabId = null;
                }
            }
        }

        if (this.onTabClose) this.onTabClose();
    }

    // New method to get current tab order for persistence
    getTabOrder() {
        return [...this.tabBar.querySelectorAll('.tab')].map(tab => tab.dataset.tabId);
    }

    // New method to restore tab order
    restoreTabOrder(orderedTabIds) {
        orderedTabIds.forEach(tabId => {
            const tab = this.tabs.get(tabId);
            if (tab) {
                this.tabBar.appendChild(tab.tabButton);
            }
        });
        this.updateTabOrder();
    }
}