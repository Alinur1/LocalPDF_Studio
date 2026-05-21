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


// src/renderer/utils/createPdfTab.js

export default function createPdfTab(filePath, tabManager, existingId = null) {
    const tabId = existingId || `pdf:${filePath}:${Date.now()}`;
    const title = filePath.split(/[\\/]/).pop();

    // Get current app theme
    const getAppTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'system';
        if (savedTheme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return savedTheme;
    };

    const iframe = document.createElement('iframe');
    iframe.src = `../pdf/web/viewer.html?file=file://${filePath}`;
    iframe.style.width = '90%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.margin = 'auto';
    iframe.style.display = 'block';
    iframe.dataset.appTheme = getAppTheme();

    // Create a wrapper for iframe and buttons
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'center';
    wrapper.appendChild(iframe);

    // Create floating control buttons
    const controlsContainer = document.createElement('div');
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.right = '-8px';
    controlsContainer.style.top = '70px';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.gap = '8px';
    controlsContainer.style.zIndex = '1000';

    // Define color filters
    const filters = [
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sunset-icon lucide-sunset"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>',
            name: 'The Golden Sunset', filter: 'invert(80%) sepia(50%) hue-rotate(300deg) contrast(80%) brightness(100%)'
        },
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon-icon lucide-moon"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>',
            name: 'Midnight Charcoal', filter: 'invert(92%) hue-rotate(180deg) brightness(95%) contrast(85%) sepia(10%)'
        },
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil-icon lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
            name: 'Soft Graphite', filter: 'invert(85%) hue-rotate(180deg) brightness(100%) contrast(90%)'
        },
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open-icon lucide-book-open"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
            name: 'Vintage Book', filter: 'sepia(40%) brightness(90%) contrast(90%)'
        },
        {
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-snowflake-icon lucide-snowflake"><path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/></svg>',
            name: 'Nordic Frost', filter: 'invert(90%) hue-rotate(160deg) brightness(90%) contrast(90%) saturate(70%)'
        }
    ];

    let activeFilterBtn = null;

    // Create filter buttons
    filters.forEach((filterConfig) => {
        const btn = document.createElement('button');
        if (filterConfig.icon.startsWith('<svg')) {
            btn.innerHTML = filterConfig.icon;
        } else {
            btn.textContent = filterConfig.icon;
        }
        btn.setAttribute('data-tooltip', filterConfig.name);
        btn.className = 'pdf-control-btn';
        btn.style.position = 'relative';
        btn.dataset.filter = filterConfig.filter;

        btn.addEventListener('click', () => {
            const iframeWin = iframe.contentWindow;
            const viewer = iframeWin.document.getElementById('viewer');

            if (viewer) {
                // If clicking the same button, toggle off
                if (activeFilterBtn === btn) {
                    viewer.style.filter = '';
                    btn.classList.remove('active');
                    activeFilterBtn = null;
                } else {
                    // Remove active state from previous button
                    if (activeFilterBtn) {
                        activeFilterBtn.classList.remove('active');
                    }
                    // Apply new filter
                    viewer.style.filter = filterConfig.filter;
                    btn.classList.add('active');
                    activeFilterBtn = btn;
                }
            }
        });

        controlsContainer.appendChild(btn);
    });

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
    resetBtn.setAttribute('data-tooltip', 'Reset color inversion');
    resetBtn.className = 'pdf-control-btn';
    resetBtn.style.position = 'relative';

    resetBtn.addEventListener('click', () => {
        const iframeWin = iframe.contentWindow;
        const viewer = iframeWin.document.getElementById('viewer');

        if (viewer) {
            viewer.style.filter = '';
            // Remove active state from all filter buttons
            if (activeFilterBtn) {
                activeFilterBtn.classList.remove('active');
                activeFilterBtn = null;
            }
        }
    });

    controlsContainer.appendChild(resetBtn);
    wrapper.appendChild(controlsContainer);

    iframe.addEventListener('load', () => {
        const iframeWin = iframe.contentWindow;
        const iframeDoc = iframeWin.document;

        // Override matchMedia in iframe to force it to respect app theme
        const overrideMatchMedia = (appTheme) => {
            const originalMatchMedia = iframeWin.matchMedia;

            iframeWin.matchMedia = function (query) {
                // If querying for color-scheme preference, return app theme instead of OS theme
                if (query === '(prefers-color-scheme: dark)') {
                    const isDark = appTheme === 'dark';
                    return {
                        matches: isDark,
                        media: query,
                        onchange: null,
                        addEventListener: () => { },
                        removeEventListener: () => { },
                        addListener: () => { },
                        removeListener: () => { }
                    };
                }
                // For all other queries, use the original matchMedia
                return originalMatchMedia.call(iframeWin, query);
            };

            // Also set color-scheme CSS property
            iframeDoc.documentElement.style.colorScheme = appTheme;
        };

        // Apply initial theme override
        overrideMatchMedia(iframe.dataset.appTheme);

        iframeWin.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            // Forward Ctrl+W
            if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                window.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'w', ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true
                }));
            }

            // Forward Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                e.stopImmediatePropagation();
                window.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Tab', ctrlKey: e.ctrlKey, metaKey: e.metaKey,
                    shiftKey: e.shiftKey, bubbles: true
                }));
            }
        });

        // External links → post to parent
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

        // Listen for theme changes from parent app and apply immediately
        const handleThemeChange = (event) => {
            if (event.data?.type === 'theme-change') {
                iframe.dataset.appTheme = event.data.theme;
                // Re-apply the matchMedia override with new theme
                overrideMatchMedia(event.data.theme);

                // Force PDF.js to re-detect and re-render with new theme
                // Dispatch multiple events that might trigger re-renders
                setTimeout(() => {
                    iframeWin.dispatchEvent(new Event('resize'));
                    iframeWin.dispatchEvent(new Event('orientationchange'));

                    // Also dispatch a custom event in case any listeners are waiting
                    iframeWin.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: event.data.theme } }));
                }, 0);
            }
        };

        iframeWin.addEventListener('message', handleThemeChange);
    });

    tabManager.openTab({
        id: tabId,
        type: 'pdf',
        title,
        content: wrapper,
        closable: true,
        onClose: () => {
            iframe.src = 'about:blank';
            iframe.remove();
        }
    });

    // Store iframe reference for theme updates
    if (!window.pdfIframes) {
        window.pdfIframes = new Map();
    }
    window.pdfIframes.set(tabId, iframe);
}
