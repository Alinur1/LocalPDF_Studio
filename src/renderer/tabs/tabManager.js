// src/renderer/tabs/tabManager.js

export default class TabManager {
    constructor(tabBarSelector, tabContentSelector) {
        this.tabBar = document.querySelector(tabBarSelector);
        this.tabContent = document.querySelector(tabContentSelector);
        this.tabs = new Map();
        this.activeTabId = null;

        window.addEventListener(
            'keydown',
            (e) => {
                const isMac = navigator.platform.toUpperCase().includes('MAC');
                const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
                if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
                    e.preventDefault();
                    if (this.activeTabId) {
                        this.closeTab(this.activeTabId);
                    }
                }
            },
            true // <-- use capture phase to intercept BEFORE iframe/PDF viewer
        );

        // Allow dropping on the tab bar empty space (append to end).
        // IMPORTANT: If the drop happens on a .tab, we do nothing here and let the tab's own drop handler run.
        this.tabBar.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.tabBar.addEventListener('drop', (e) => {
            e.preventDefault();
            // If drop occurred on a tab element, ignore here (the tab's drop handler will handle it).
            const dropOnTab = e.target.closest('.tab');
            if (dropOnTab) return;

            const draggedTabId = e.dataTransfer.getData('tab-id');
            if (draggedTabId && this.tabs.has(draggedTabId)) {
                const dragged = this.tabs.get(draggedTabId);

                // Append DOM node to end
                this.tabBar.appendChild(dragged.tabButton);

                // Move the entry to the end of the Map
                const entries = Array.from(this.tabs.entries());
                const draggedIndex = entries.findIndex(([id]) => id === draggedTabId);
                const [entry] = entries.splice(draggedIndex, 1);
                entries.push(entry);
                this.tabs = new Map(entries);
            }
        });
    }

    openTab(config) {
        if (config.type === 'feature' && this.tabs.has(config.id)) {
            this.switchTab(config.id);
            return;
        }

        const tabId = config.id;

        const tabButton = document.createElement('div');
        tabButton.classList.add('tab');
        tabButton.dataset.tabId = tabId;
        tabButton.addEventListener('click', () => this.switchTab(tabId));

        const tabTitle = document.createElement('span');
        tabTitle.classList.add('tab-title');
        tabTitle.textContent = config.title;
        tabButton.appendChild(tabTitle);

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.classList.add('tab-close');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });
        tabButton.appendChild(closeBtn);

        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('tab-content');
        contentWrapper.dataset.tabId = tabId;
        contentWrapper.appendChild(config.content);

        this.tabs.set(tabId, {
            ...config,
            tabButton,
            contentWrapper
        });

        // Make draggable
        tabButton.setAttribute('draggable', true);

        // Drag start: store dragged tab id
        tabButton.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('tab-id', tabId);
            e.dataTransfer.effectAllowed = 'move';
            // Optionally set a drag image:
            // e.dataTransfer.setDragImage(tabButton, 10, 10);
        });

        // Show visual when dragging over a tab
        tabButton.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            tabButton.classList.add('drag-over');
        });

        tabButton.addEventListener('dragleave', () => {
            tabButton.classList.remove('drag-over');
        });

        // Drop on a tab: decide before/after based on cursor x position
        tabButton.addEventListener('drop', (e) => {
            e.preventDefault();
            tabButton.classList.remove('drag-over');

            const draggedTabId = e.dataTransfer.getData('tab-id');
            if (!draggedTabId || draggedTabId === tabId) return;

            const rect = tabButton.getBoundingClientRect();
            const insertBefore = e.clientY < rect.top + rect.height / 2;
            this.reorderTabs(draggedTabId, tabId, insertBefore);
        });

        this.tabBar.appendChild(tabButton);
        this.tabContent.appendChild(contentWrapper);

        this.switchTab(tabId);
    }

    switchTab(tabId) {
        if (!this.tabs.has(tabId)) return;
        for (const [id, tab] of this.tabs) {
            tab.tabButton.classList.remove('active');
            tab.contentWrapper.style.display = 'none';
        }
        const targetTab = this.tabs.get(tabId);
        targetTab.tabButton.classList.add('active');
        targetTab.contentWrapper.style.display = 'block';
        this.activeTabId = tabId;
    }

    /**
     * Reorder tabs.
     * @param {string} draggedId
     * @param {string} targetId
     * @param {boolean} insertBefore - if true insert before target; else insert after target
     */
    reorderTabs(draggedId, targetId, insertBefore = true) {
        const dragged = this.tabs.get(draggedId);
        const target = this.tabs.get(targetId);

        if (!dragged || !target) return;

        // DOM reorder
        if (insertBefore) {
            this.tabBar.insertBefore(dragged.tabButton, target.tabButton);
        } else {
            this.tabBar.insertBefore(dragged.tabButton, target.tabButton.nextSibling);
        }

        // Map reorder (careful with indices when removing)
        const entries = Array.from(this.tabs.entries());
        const draggedIndex = entries.findIndex(([id]) => id === draggedId);
        let targetIndex = entries.findIndex(([id]) => id === targetId);

        // Remove dragged entry
        const [entry] = entries.splice(draggedIndex, 1);

        // If the dragged element was before the target, removing it shifts the target index left by 1
        if (draggedIndex < targetIndex) targetIndex--;

        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        entries.splice(insertIndex, 0, entry);

        this.tabs = new Map(entries);
    }

    closeTab(tabId) {
        if (!this.tabs.has(tabId)) return;
        const tab = this.tabs.get(tabId);

        // Call cleanup method on content if it exists (for memory leak prevention)
        if (tab.content && typeof tab.content.cleanup === 'function') {
            try {
                tab.content.cleanup();
                console.log(`Cleaned up tab: ${tabId}`);
            } catch (err) {
                console.error(`Error cleaning up tab ${tabId}:`, err);
            }
        }

        // Run legacy onClose callback if provided
        if (typeof tab.onClose === 'function') {
            try {
                tab.onClose();
            } catch (err) {
                console.error(`Error in onClose for tab ${tabId}:`, err);
            }
        }

        // Remove DOM elements
        tab.tabButton.remove();
        tab.contentWrapper.remove();

        // Delete from map
        this.tabs.delete(tabId);

        // Switch to another tab if this was active
        if (this.activeTabId === tabId) {
            const remaining = Array.from(this.tabs.keys());
            if (remaining.length > 0) {
                this.switchTab(remaining[0]);
            } else {
                this.activeTabId = null;
            }
        }

        // Hint for garbage collection
        if (window.gc) {
            window.gc();
        }
    }

    // Method to close all tabs (useful for complete cleanup)
    closeAllTabs() {
        const tabIds = Array.from(this.tabs.keys());
        tabIds.forEach(tabId => this.closeTab(tabId));
    }

    // Get number of open tabs
    getTabCount() {
        return this.tabs.size;
    }
}