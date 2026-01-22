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
        content: iframe,
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
