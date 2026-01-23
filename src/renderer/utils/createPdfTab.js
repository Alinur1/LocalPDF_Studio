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
        { emoji: '🌅', name: 'The Golden Sunset', filter: 'invert(80%) sepia(50%) hue-rotate(300deg) contrast(80%) brightness(100%)' },
        { emoji: '🌙', name: 'Midnight Charcoal', filter: 'invert(92%) hue-rotate(180deg) brightness(95%) contrast(85%) sepia(10%)' },
        { emoji: '✏️', name: 'Soft Graphite', filter: 'invert(85%) hue-rotate(180deg) brightness(100%) contrast(90%)' },
        { emoji: '📖', name: 'Vintage Book', filter: 'sepia(40%) brightness(90%) contrast(90%)' },
        { emoji: '❄️', name: 'Nordic Frost', filter: 'invert(90%) hue-rotate(160deg) brightness(90%) contrast(90%) saturate(70%)' }
    ];

    let activeFilterBtn = null;

    // Create filter buttons
    filters.forEach((filterConfig) => {
        const btn = document.createElement('button');
        btn.textContent = filterConfig.emoji;
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
    resetBtn.textContent = '↻';
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

        // (1) Forward Ctrl+W to parent
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

        // (2) External links → post to parent
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

        // (3) Listen for theme changes from parent app and apply immediately
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
