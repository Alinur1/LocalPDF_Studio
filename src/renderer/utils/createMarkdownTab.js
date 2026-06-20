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

// src/renderer/utils/createMarkdownTab.js
export default async function createMarkdownTab(filePath, tabManager, existingId = null, initialContent = null) {
    const tabId = existingId || `markdown:${filePath}:${Date.now()}`;
    const title = filePath.split(/[\\/]/).pop();
    let isDirty = false;
    let currentFilePath = filePath;
    let editorZoom = 100;
    let previewZoom = 100;
    let markedReady = false;
    let forceClose = false;

    const getAssetPath = async (relativePath) => {
        if (window.electronAPI?.resolveAsset) {
            return await window.electronAPI.resolveAsset(relativePath);
        }
        // Fallback for dev environment
        const base = window.location.origin.replace(/\/$/, '');
        return `${base}/assets/${relativePath}`;
    };

    // Load marked.umd.js locally
    const loadMarked = async () => {
        if (window.marked) {
            markedReady = true;
            return;
        }
        const scriptUrl = await getAssetPath('js/marked.umd.js');
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                // Configure GFM options once
                window.marked.setOptions({
                    gfm: true,
                    breaks: true,
                    headerIds: true,
                    mangle: false
                });
                markedReady = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load marked.js'));
            document.head.appendChild(script);
        });
    };

    // Load github-markdown-css with theme switching
    let activeCssLink = null;
    const loadGithubCss = async (theme) => {
        if (activeCssLink?.parentNode) activeCssLink.parentNode.removeChild(activeCssLink);

        let cssFile = 'github-markdown.css'; // auto-switching
        if (theme === 'light') cssFile = 'github-markdown-light.css';
        else if (theme === 'dark') cssFile = 'github-markdown-dark.css';

        const cssUrl = await getAssetPath(`css/${cssFile}`);
        activeCssLink = document.createElement('link');
        activeCssLink.rel = 'stylesheet';
        activeCssLink.href = cssUrl;
        document.head.appendChild(activeCssLink);
    };

    // Wait for marked to load before proceeding
    await loadMarked();

    // UI Creation
    const container = document.createElement('div');
    container.className = 'markdown-container';
    container.style.cssText = `
        width: 100%; height: 100%; display: flex; flex-direction: column;
        background: var(--bg-secondary);
    `;

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-toolbar';
    toolbar.style.cssText = `
        display: flex; gap: 8px; padding: 12px; background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color); flex-wrap: wrap; align-items: center;
    `;

    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    saveBtn.setAttribute('data-tooltip', 'Save file');
    saveBtn.className = 'markdown-btn';

    // Export PDF button
    const exportPdfBtn = document.createElement('button');
    exportPdfBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    exportPdfBtn.setAttribute('data-tooltip', 'Export to PDF');
    exportPdfBtn.className = 'markdown-btn';
    toolbar.appendChild(exportPdfBtn); // ← Place after saveBtn

    // Toggle Editor button (replaces Toggle Preview)
    const toggleEditorBtn = document.createElement('button');
    toggleEditorBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    toggleEditorBtn.setAttribute('data-tooltip', 'Toggle Editor');
    toggleEditorBtn.className = 'markdown-btn';

    const layoutBtn = document.createElement('button');
    layoutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>';
    layoutBtn.setAttribute('data-tooltip', 'Toggle layout (Ctrl+Shift+L)');
    layoutBtn.className = 'markdown-btn';

    const insertImageBtn = document.createElement('button');
    insertImageBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    insertImageBtn.setAttribute('data-tooltip', 'Insert image (Ctrl+I)');
    insertImageBtn.className = 'markdown-btn';

    const zoomContainer = document.createElement('div');
    zoomContainer.style.cssText = `display: flex; gap: 4px; align-items: center; margin-left: 12px; border-left: 1px solid var(--border-color); padding-left: 12px;`;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>';
    zoomOutBtn.setAttribute('data-tooltip', 'Zoom out (Ctrl+-)');
    zoomOutBtn.className = 'markdown-btn';

    const zoomLevel = document.createElement('span');
    zoomLevel.textContent = '100%';
    zoomLevel.style.cssText = `font-size: 12px; color: var(--text-secondary); min-width: 40px; text-align: center;`;

    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>';
    zoomInBtn.setAttribute('data-tooltip', 'Zoom in (Ctrl++)');
    zoomInBtn.className = 'markdown-btn';

    zoomContainer.append(zoomOutBtn, zoomLevel, zoomInBtn);

    const statusIndicator = document.createElement('span');
    statusIndicator.style.cssText = `margin-left: auto; font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;`;

    toolbar.append(saveBtn, toggleEditorBtn, layoutBtn, zoomContainer, statusIndicator);

    // Content Area
    const contentArea = document.createElement('div');
    contentArea.className = 'markdown-content';
    contentArea.style.cssText = `display: flex; flex: 1; overflow: hidden; gap: 1px; background: var(--border-color);`;

    const editorPane = document.createElement('div');
    editorPane.className = 'markdown-editor-pane';
    editorPane.style.cssText = `flex: 1; display: flex; flex-direction: column; background: var(--bg-secondary); min-width: 300px;`;

    const editor = document.createElement('textarea');
    editor.className = 'markdown-editor';
    editor.style.cssText = `flex: 1; padding: 16px; background: var(--bg-secondary); color: var(--text-primary); border: none; outline: none; font-family: 'Courier New', monospace; font-size: 14px; line-height: 1.5; resize: none;`;
    editor.spellcheck = true;
    editorPane.appendChild(editor);

    const previewPane = document.createElement('div');
    previewPane.className = 'markdown-preview-pane';
    previewPane.style.cssText = `flex: 1; overflow-y: auto; background: var(--bg-secondary); min-width: 300px; display: flex;`;

    const preview = document.createElement('article');
    preview.className = 'markdown-body';
    preview.style.cssText = `padding: 45px; width: 100%; box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto;`;
    previewPane.appendChild(preview);

    contentArea.append(editorPane, previewPane);
    container.append(toolbar, contentArea);

    let editorVisible = false;
    editorPane.style.display = 'none';

    preview.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
            const href = link.getAttribute('href');
            // Only intercept external HTTP/HTTPS URLs
            if (href && /^https?:\/\//i.test(href)) {
                e.preventDefault();
                if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(href);
                } else {
                    window.open(href, '_blank');
                }
            }
        }
    });

    // Load content
    if (!initialContent) {
        try {
            initialContent = await window.electronAPI.readMarkdownFile(filePath);
        } catch (err) {
            console.error('Error loading markdown file:', err);
            initialContent = '';
        }
    }
    editor.value = initialContent;

    // Marked renderer
    let previewTimeout;
    function updatePreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => {
            try {
                let htmlContent;
                if (window.marked) {
                    htmlContent = window.marked.parse(editor.value, { gfm: true, breaks: true });
                } else {
                    // Fallback to the simple parser if marked isn't loaded yet
                    htmlContent = typeof simpleMarkdownParser === 'function'
                        ? simpleMarkdownParser(editor.value)
                        : `<pre><code>${editor.value}</code></pre>`;
                }
                // Resolve relative image paths before rendering
                htmlContent = resolveImagePaths(htmlContent, currentFilePath);
                preview.innerHTML = htmlContent;
            } catch (err) {
                preview.innerHTML = `<p style="color: #e74c3c;">Error parsing markdown: ${err.message}</p>`;
            }
        }, 150);
    }

    // Theme sync
    const applyThemeToPreview = () => {
        const savedTheme = localStorage.getItem('theme') || 'system';
        let activeTheme = savedTheme;
        if (savedTheme === 'system') {
            activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        loadGithubCss(activeTheme);
    };
    applyThemeToPreview();

    const themeObserver = new MutationObserver(applyThemeToPreview);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    editor.addEventListener('input', () => {
        isDirty = true;
        updatePreview();
        updateStatusIndicator();
    });

    function updateStatusIndicator() {
        statusIndicator.innerHTML = isDirty
            ? '<span style="color: #f39c12;">●</span> Modified'
            : '<span style="color: #2ecc71;">●</span> Saved';
    }

    async function saveFile() {
        try {
            const content = editor.value;
            await window.electronAPI.saveMarkdownFile(currentFilePath, content);
            isDirty = false;
            updateStatusIndicator();
            const tabButton = tabManager.tabBar.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabButton) {
                const titleSpan = tabButton.querySelector('.tab-title');
                if (titleSpan) titleSpan.textContent = title;
            }
        } catch (err) {
            console.error('Error saving markdown file:', err);
            window.customAlert.error('Save Error', `Failed to save file: ${err.message}`);
        }
    }

    saveBtn.addEventListener('click', saveFile);

    exportPdfBtn.addEventListener('click', async () => {
        try {
            exportPdfBtn.disabled = true;
            exportPdfBtn.setAttribute('data-tooltip', 'Exporting...');
            exportPdfBtn.style.opacity = '0.6';

            // Generate HTML using marked (if loaded) or fallback parser
            let htmlContent;
            if (window.marked) {
                htmlContent = window.marked.parse(editor.value, { gfm: true, breaks: true });
            } else {
                htmlContent = markdownParser(editor.value);
            }

            const result = await window.electronAPI.exportMarkdownToPdf(htmlContent, title, {
                mdFilePath: currentFilePath
            });

            if (result?.success) {
                const defaultName = title.replace(/\.md$/i, '') + '.pdf';
                const savedPath = await window.electronAPI.savePdfFile(defaultName, new Uint8Array(result.data));

                if (savedPath) {
                    statusIndicator.innerHTML = '<span style="color: #2ecc71;">●</span> PDF Exported';
                    setTimeout(() => updateStatusIndicator(), 2500);
                }
            } else {
                window.customAlert.error('Export Failed', `Export failed: ${result?.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Export PDF error:', err);
            window.customAlert.error('Export Failed', `Export failed: ${err.message}`);
        } finally {
            exportPdfBtn.disabled = false;
            exportPdfBtn.setAttribute('data-tooltip', 'Export to PDF');
            exportPdfBtn.style.opacity = '1';
        }
    });

    editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            insertImageBtn.click();
        }
    });

    let previewVisible = true;
    toggleEditorBtn.addEventListener('click', () => {
        editorVisible = !editorVisible;
        editorPane.style.display = editorVisible ? 'flex' : 'none';
        toggleEditorBtn.style.background = editorVisible ? 'var(--accent-color)' : 'var(--bg-secondary)';
        toggleEditorBtn.style.color = editorVisible ? 'white' : 'var(--text-primary)';

        if (editorVisible) {
            editor.scrollTop = 0;
            editor.selectionStart = 0;
            editor.selectionEnd = 0;
            editor.focus();
        }
    });

    let isHorizontalLayout = true;
    layoutBtn.addEventListener('click', () => {
        isHorizontalLayout = !isHorizontalLayout;
        contentArea.style.flexDirection = isHorizontalLayout ? 'row' : 'column';
        layoutBtn.style.background = isHorizontalLayout ? 'var(--bg-secondary)' : 'var(--accent-color)';
        layoutBtn.style.color = isHorizontalLayout ? 'var(--text-primary)' : 'white';
    });

    insertImageBtn.addEventListener('click', async () => {
        try {
            const files = await window.electronAPI.selectPdfsAndImages();
            if (files?.length > 0) {
                const imagePath = files[0];
                const altText = imagePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
                const mdImg = `![${altText}](${imagePath})`;
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + mdImg + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + mdImg.length;
                isDirty = true;
                updateStatusIndicator();
                updatePreview();
            }
        } catch (err) {
            console.error('Error inserting image:', err);
        }
    });

    function resolveImagePaths(html, mdFilePath) {
        const normPath = mdFilePath.replace(/\\/g, '/');
        const dirPath = normPath.slice(0, normPath.lastIndexOf('/') + 1);
        const baseUrl = `file:///${dirPath.replace(/^\/+/, '')}`;

        return html.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
            // Skip absolute URLs & data URIs
            if (/^(https?:|data:|file:)/i.test(src)) return match;
            try {
                const absoluteUrl = new URL(src, baseUrl).href;
                return `${prefix}${absoluteUrl}${suffix}`;
            } catch {
                return match;
            }
        });
    }


    function updateZoom() {
        zoomLevel.textContent = Math.round(editorZoom) + '%';
        editor.style.fontSize = (14 * editorZoom / 100) + 'px';
        preview.style.fontSize = (14 * previewZoom / 100) + 'px';
    }

    zoomInBtn.addEventListener('click', () => {
        editorZoom = Math.min(200, editorZoom + 10);
        previewZoom = Math.min(200, previewZoom + 10);
        updateZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        editorZoom = Math.max(50, editorZoom - 10);
        previewZoom = Math.max(50, previewZoom - 10);
        updateZoom();
    });

    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

        // Zoom shortcuts (Ctrl/Cmd + + / - / 0)
        if (ctrlOrCmd) {
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomInBtn.click();
            }
            else if (e.key === '-') {
                e.preventDefault();
                zoomOutBtn.click();
            }
            else if (e.key === '0') {
                e.preventDefault();
                editorZoom = previewZoom = 100;
                updateZoom();
            }
        }
    });

    editor.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click();
        }
    });

    previewPane.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click();
        }
    });

    // Initial render
    updatePreview();
    updateStatusIndicator();

    // Register tab
    tabManager.openTab({
        id: tabId,
        title: title,
        content: container,
        onClose: () => {
            if (forceClose) {
                themeObserver.disconnect();
                return true; // Allow close on second attempt
            }

            if (isDirty) {
                // Block the current close attempt immediately
                window.customAlert.confirm(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to close this tab?'
                ).then(choice => {
                    if (choice === 1) { // User clicked "Yes"
                        forceClose = true;
                        tabManager.closeTab(tabId); // Re-trigger close, will pass the check
                    }
                });
                return false; // Cancel current close
            }

            themeObserver.disconnect();
            return true;
        },
        type: 'markdown'
    });

    const tab = tabManager.tabs.get(tabId);
    if (tab) {
        tab.filePath = currentFilePath;
        tab.type = 'markdown';
        tab.editor = editor;
        tab.isDirty = () => isDirty;
        tab.save = saveFile;
    }

    return { tabId, save: saveFile, isDirty: () => isDirty };
}