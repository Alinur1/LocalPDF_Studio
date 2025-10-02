export default class TabManager {
    constructor(tabBarSelector, tabContentSelector) {
        this.tabBar = document.querySelector(tabBarSelector);
        this.tabContent = document.querySelector(tabContentSelector);
        this.tabs = new Map();
        this.activeTabId = null;

        // Callbacks for persistence
        this.onTabChange = null;
        this.onTabClose = null;

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

    openTab({ id, title, content, onClose }) {
        if (this.tabs.has(id)) {
            this.switchTab(id);
            return;
        }

        // Tab button
        const tabButton = document.createElement('div');
        tabButton.classList.add('tab');
        tabButton.dataset.tabId = id;
        tabButton.addEventListener('click', () => this.switchTab(id));

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

        if (this.activeTabId === id) {
            const remaining = Array.from(this.tabs.keys());
            if (remaining.length > 0) {
                this.switchTab(remaining[0]);
            } else {
                this.activeTabId = null;
            }
        }

        if (this.onTabClose) this.onTabClose();
    }
}
