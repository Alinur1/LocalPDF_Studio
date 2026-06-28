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
        const base = window.location.origin.replace(/\/$/, '');
        return `${base}/assets/${relativePath}`;
    };

    const loadMarked = async () => {
        if (window.marked) { markedReady = true; return; }
        const scriptUrl = await getAssetPath('js/marked.umd.js');
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                window.marked.setOptions({ gfm: true, breaks: true, headerIds: true, mangle: false });
                markedReady = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load marked.js'));
            document.head.appendChild(script);
        });
    };

    let activeCssLink = null;
    const loadGithubCss = async (theme) => {
        if (activeCssLink?.parentNode) activeCssLink.parentNode.removeChild(activeCssLink);
        let cssFile = 'github-markdown.css';
        if (theme === 'light') cssFile = 'github-markdown-light.css';
        else if (theme === 'dark') cssFile = 'github-markdown-dark.css';
        const cssUrl = await getAssetPath(`css/${cssFile}`);
        activeCssLink = document.createElement('link');
        activeCssLink.rel = 'stylesheet';
        activeCssLink.href = cssUrl;
        document.head.appendChild(activeCssLink);
    };

    await loadMarked();

    // ─── Container ───────────────────────────────────────────────────────────
    const container = document.createElement('div');
    container.className = 'markdown-container';
    container.style.cssText = `width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--bg-secondary);`;

    // ─── Toolbar ─────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-toolbar';
    toolbar.style.cssText = `display: flex; gap: 8px; padding: 12px; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color); flex-wrap: wrap; align-items: center;`;

    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    saveBtn.setAttribute('data-tooltip', 'Save file');
    saveBtn.className = 'markdown-btn tooltip-left';

    const exportPdfBtn = document.createElement('button');
    exportPdfBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    exportPdfBtn.setAttribute('data-tooltip', 'Export to PDF');
    exportPdfBtn.className = 'markdown-btn tooltip-left';

    const toggleEditorBtn = document.createElement('button');
    toggleEditorBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    toggleEditorBtn.setAttribute('data-tooltip', 'Toggle Editor');
    toggleEditorBtn.className = 'markdown-btn tooltip-left';

    const layoutBtn = document.createElement('button');
    layoutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>';
    layoutBtn.setAttribute('data-tooltip', 'Toggle layout');
    layoutBtn.className = 'markdown-btn tooltip-left';

    const syncToggleBtn = document.createElement('button');
    syncToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';
    syncToggleBtn.setAttribute('data-tooltip', 'Toggle sync scroll');
    syncToggleBtn.className = 'markdown-btn tooltip-left';
    syncToggleBtn.style.background = 'var(--accent-color)';
    syncToggleBtn.style.color = 'white';

    const zoomContainer = document.createElement('div');
    zoomContainer.style.cssText = `display: flex; gap: 4px; align-items: center; margin-left: 12px; border-left: 1px solid var(--border-color); padding-left: 12px;`;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>';
    zoomOutBtn.setAttribute('data-tooltip', 'Zoom out');
    zoomOutBtn.className = 'markdown-btn';

    const zoomLevel = document.createElement('span');
    zoomLevel.textContent = '100%';
    zoomLevel.style.cssText = `font-size: 12px; color: var(--text-secondary); min-width: 40px; text-align: center;`;

    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>';
    zoomInBtn.setAttribute('data-tooltip', 'Zoom in');
    zoomInBtn.className = 'markdown-btn';

    zoomContainer.append(zoomOutBtn, zoomLevel, zoomInBtn);

    // ─── Search bar ──────────────────────────────────────────────────────────
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `display: none; align-items: center; gap: 4px; margin-left: 12px; border-left: 1px solid var(--border-color); padding-left: 12px;`;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Find in editor…';
    searchInput.style.cssText = `background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 13px; outline: none; width: 180px;`;

    const searchCaseSensitiveBtn = document.createElement('button');
    searchCaseSensitiveBtn.textContent = 'Aa';
    searchCaseSensitiveBtn.setAttribute('data-tooltip', 'Case sensitive');
    searchCaseSensitiveBtn.className = 'markdown-btn';
    searchCaseSensitiveBtn.style.cssText = `font-size: 11px; font-weight: bold; padding: 3px 6px; min-width: 26px;`;
    let searchCaseSensitive = false;

    const searchMatchCount = document.createElement('span');
    searchMatchCount.style.cssText = `font-size: 12px; color: var(--text-secondary); white-space: nowrap; min-width: 54px; text-align: center;`;
    searchMatchCount.textContent = 'No results';

    const searchPrevBtn = document.createElement('button');
    searchPrevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
    searchPrevBtn.setAttribute('data-tooltip', 'Previous (Shift+Enter)');
    searchPrevBtn.className = 'markdown-btn';

    const searchNextBtn = document.createElement('button');
    searchNextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    searchNextBtn.setAttribute('data-tooltip', 'Next (Enter)');
    searchNextBtn.className = 'markdown-btn';

    const searchCloseBtn = document.createElement('button');
    searchCloseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    searchCloseBtn.setAttribute('data-tooltip', 'Close (Esc)');
    searchCloseBtn.className = 'markdown-btn';

    searchContainer.append(searchInput, searchCaseSensitiveBtn, searchMatchCount, searchPrevBtn, searchNextBtn, searchCloseBtn);

    const statusIndicator = document.createElement('span');
    statusIndicator.style.cssText = `margin-left: auto; font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; cursor: help;`;
    statusIndicator.setAttribute('data-tooltip', 'File Status');

    toolbar.append(saveBtn, exportPdfBtn, toggleEditorBtn, layoutBtn, syncToggleBtn, zoomContainer, searchContainer, statusIndicator);

    // ─── Content area ────────────────────────────────────────────────────────
    const contentArea = document.createElement('div');
    contentArea.className = 'markdown-content';
    contentArea.style.cssText = `display: flex; flex: 1; overflow: hidden; gap: 1px; background: var(--border-color);`;

    // ── Editor pane: wrapper holds the overlay + textarea stacked ────────────
    const editorPane = document.createElement('div');
    editorPane.className = 'markdown-editor-pane';
    editorPane.style.cssText = `flex: 1; display: flex; flex-direction: column; background: var(--bg-secondary); min-width: 300px;`;

    // The editorWrapper is the positioning context for the overlay
    const editorWrapper = document.createElement('div');
    editorWrapper.style.cssText = `position: relative; flex: 1; display: flex; overflow: hidden;`;

    // ── Highlight overlay (sits BEHIND the textarea) ─────────────────────────
    // Must share identical font/padding/sizing with the textarea so characters
    // land in exactly the same pixel positions.
    const highlightOverlay = document.createElement('div');
    highlightOverlay.setAttribute('aria-hidden', 'true');
    highlightOverlay.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        padding: 16px;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        pointer-events: none;
        color: transparent;
        background: transparent;
        box-sizing: border-box;
        z-index: 0;
    `;

    // ── Textarea sits on top, fully transparent background so overlay shows ──
    const editor = document.createElement('textarea');
    editor.className = 'markdown-editor';
    editor.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        padding: 16px;
        background: transparent;
        color: var(--text-primary);
        caret-color: var(--text-primary);
        border: none; outline: none;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
        width: 100%; height: 100%;
        box-sizing: border-box;
        z-index: 1;
    `;
    editor.spellcheck = true;

    editorWrapper.append(highlightOverlay, editor);
    editorPane.appendChild(editorWrapper);

    // ── Preview pane ─────────────────────────────────────────────────────────
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

    // ─── Preview renderer ─────────────────────────────────────────────────────
    let previewTimeout;
    function updatePreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(() => {
            try {
                let htmlContent;
                if (window.marked) {
                    htmlContent = window.marked.parse(editor.value, { gfm: true, breaks: true });
                } else {
                    htmlContent = typeof simpleMarkdownParser === 'function'
                        ? simpleMarkdownParser(editor.value)
                        : `<pre><code>${editor.value}</code></pre>`;
                }
                htmlContent = resolveImagePaths(htmlContent, currentFilePath);
                preview.innerHTML = htmlContent;
                invalidateBlockCache();
                scheduleReinjectSentinels();
            } catch (err) {
                preview.innerHTML = `<p style="color: #e74c3c;">Error parsing markdown: ${err.message}</p>`;
            }
        }, 150);
    }

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
            let htmlContent;
            if (window.marked) {
                htmlContent = window.marked.parse(editor.value, { gfm: true, breaks: true });
            } else {
                htmlContent = markdownParser(editor.value);
            }
            const result = await window.electronAPI.exportMarkdownToPdf(htmlContent, title, { mdFilePath: currentFilePath });
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
    });

    let previewVisible = true;
    toggleEditorBtn.addEventListener('click', () => {
        editorVisible = !editorVisible;
        editorPane.style.display = editorVisible ? 'flex' : 'none';
        toggleEditorBtn.style.background = editorVisible ? 'var(--accent-color)' : 'var(--bg-secondary)';
        toggleEditorBtn.style.color = editorVisible ? 'white' : 'var(--text-primary)';
        if (!editorVisible) closeSearch();
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

    function resolveImagePaths(html, mdFilePath) {
        const normPath = mdFilePath.replace(/\\/g, '/');
        const dirPath = normPath.slice(0, normPath.lastIndexOf('/') + 1);
        const baseUrl = `file:///${dirPath.replace(/^\/+/, '')}`;
        return html.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
            if (/^(https?:|data:|file:)/i.test(src)) return match;
            try {
                const absoluteUrl = new URL(src, baseUrl).href;
                return `${prefix}${absoluteUrl}${suffix}`;
            } catch { return match; }
        });
    }

    function updateZoom() {
        zoomLevel.textContent = Math.round(editorZoom) + '%';
        const editorFontSize = (14 * editorZoom / 100) + 'px';
        editor.style.fontSize = editorFontSize;
        highlightOverlay.style.fontSize = editorFontSize; // keep overlay in sync
        preview.style.fontSize = (16 * previewZoom / 100) + 'px';
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
        if (ctrlOrCmd) {
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomInBtn.click(); }
            else if (e.key === '-') { e.preventDefault(); zoomOutBtn.click(); }
            else if (e.key === '0') { e.preventDefault(); editorZoom = previewZoom = 100; updateZoom(); }
        }
    });

    editor.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click(); }
    });
    previewPane.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click(); }
    });

    updatePreview();
    updateStatusIndicator();

    // ─── Synchronized Scrolling ───────────────────────────────────────────────
    let syncEnabled = true;
    let syncSource = null;

    let _cachedLineHeight = null;
    function getLineHeight() {
        if (_cachedLineHeight === null) {
            _cachedLineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 21;
        }
        return _cachedLineHeight;
    }
    function invalidateMeasureCache() {
        _cachedLineHeight = null;
        scheduleReinjectSentinels();
    }

    const _zoomBtns = [zoomInBtn, zoomOutBtn];
    _zoomBtns.forEach(btn => btn.addEventListener('click', () => {
        invalidateMeasureCache();
        invalidateBlockCache();
    }));

    let _blockPositionCache = null;
    function getBlockPositions() {
        if (_blockPositionCache) return _blockPositionCache;
        const blocks = Array.from(preview.querySelectorAll('[data-sync-line]'));
        _blockPositionCache = blocks.map(block => ({
            line: parseInt(block.dataset.syncLine, 10),
            top: blockScrollTop(block)
        }));
        return _blockPositionCache;
    }
    function invalidateBlockCache() { _blockPositionCache = null; }

    function injectSentinels() {
        const lines = editor.value.split('\n');
        const blocks = preview.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, blockquote, ul, ol, table, hr');
        let lineIndex = 0;
        blocks.forEach(block => {
            const blockText = block.textContent.trim().slice(0, 60);
            let found = lineIndex;
            for (let i = lineIndex; i < lines.length; i++) {
                const stripped = lines[i].replace(/^#{1,6}\s*/, '').replace(/[*_`~[\]]/g, '').trim();
                if (stripped.length > 4 && blockText.startsWith(stripped.slice(0, Math.min(stripped.length, 40)))) {
                    found = i; lineIndex = i; break;
                }
            }
            block.dataset.syncLine = found;
        });
    }

    let _sentinelReinjectTimer = null;
    function scheduleReinjectSentinels() {
        clearTimeout(_sentinelReinjectTimer);
        _sentinelReinjectTimer = setTimeout(() => { injectSentinels(); invalidateBlockCache(); }, 250);
    }

    editor.addEventListener('input', scheduleReinjectSentinels);
    setTimeout(() => { injectSentinels(); invalidateBlockCache(); }, 400);

    function blockScrollTop(block) {
        const paneRect = previewPane.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        return blockRect.top - paneRect.top + previewPane.scrollTop;
    }
    function editorScrollToLine() { return editor.scrollTop / getLineHeight(); }

    function lineToPreviewScrollTop(targetLine) {
        const positions = getBlockPositions();
        if (positions.length === 0) {
            const editorMax = editor.scrollHeight - editor.clientHeight;
            const previewMax = previewPane.scrollHeight - previewPane.clientHeight;
            return editorMax > 0 ? (editor.scrollTop / editorMax) * previewMax : 0;
        }
        const totalLines = editor.value.split('\n').length;
        let before = null, after = null;
        for (const pos of positions) {
            if (pos.line <= targetLine) before = pos;
            else { after = pos; break; }
        }
        if (!before) {
            const first = positions[0];
            return first.line > 0 ? Math.min(targetLine / first.line, 1) * first.top : 0;
        }
        if (!after) {
            const previewMax = previewPane.scrollHeight - previewPane.clientHeight;
            const tail = totalLines > before.line ? (targetLine - before.line) / (totalLines - before.line) : 0;
            return before.top + tail * (previewMax - before.top);
        }
        const fraction = after.line > before.line ? (targetLine - before.line) / (after.line - before.line) : 0;
        return before.top + fraction * (after.top - before.top);
    }

    function previewScrollToEditorScrollTop(previewScrollTop) {
        const positions = getBlockPositions();
        if (positions.length === 0) {
            const editorMax = editor.scrollHeight - editor.clientHeight;
            const previewMax = previewPane.scrollHeight - previewPane.clientHeight;
            return previewMax > 0 ? (previewScrollTop / previewMax) * editorMax : 0;
        }
        const lineHeight = getLineHeight();
        const totalLines = editor.value.split('\n').length;
        let before = null, after = null;
        for (const pos of positions) {
            if (pos.top <= previewScrollTop) before = pos;
            else { after = pos; break; }
        }
        let targetLine;
        if (!before) {
            const first = positions[0];
            targetLine = first.top > 0 ? (previewScrollTop / first.top) * first.line : 0;
        } else if (!after) {
            const previewMax = previewPane.scrollHeight - previewPane.clientHeight;
            const tail = previewMax > before.top ? (previewScrollTop - before.top) / (previewMax - before.top) : 0;
            targetLine = before.line + tail * (totalLines - before.line);
        } else {
            const fraction = after.top > before.top ? (previewScrollTop - before.top) / (after.top - before.top) : 0;
            targetLine = before.line + fraction * (after.line - before.line);
        }
        return Math.max(0, targetLine * lineHeight);
    }

    // Keep overlay scrolled in sync with textarea
    editor.addEventListener('scroll', () => {
        highlightOverlay.scrollTop = editor.scrollTop;
        highlightOverlay.scrollLeft = editor.scrollLeft;

        if (!syncEnabled || syncSource === 'preview') return;
        syncSource = 'editor';
        previewPane.scrollTop = lineToPreviewScrollTop(editorScrollToLine());
        requestAnimationFrame(() => { if (syncSource === 'editor') syncSource = null; });
    });

    previewPane.addEventListener('scroll', () => {
        if (!syncEnabled || syncSource === 'editor') return;
        syncSource = 'preview';
        editor.scrollTop = previewScrollToEditorScrollTop(previewPane.scrollTop);
        requestAnimationFrame(() => { if (syncSource === 'preview') syncSource = null; });
    });

    syncToggleBtn.addEventListener('click', () => {
        syncEnabled = !syncEnabled;
        syncToggleBtn.style.background = syncEnabled ? 'var(--accent-color)' : 'var(--bg-secondary)';
        syncToggleBtn.style.color = syncEnabled ? 'white' : 'var(--text-primary)';
        syncToggleBtn.setAttribute('data-tooltip', syncEnabled ? 'Sync scroll ON' : 'Sync scroll OFF');
    });

    // ─── Search — overlay-based highlighting ──────────────────────────────────
    // How it works:
    //   1. The highlightOverlay <div> mirrors the textarea's text as plain text
    //      nodes, with identical font/padding so characters align pixel-perfect.
    //   2. When a search runs, we rebuild the overlay content: plain text outside
    //      matches, <mark> spans for every match, and a special .search-current
    //      class on the active match.
    //   3. The textarea sits on top with a transparent background so the coloured
    //      <mark> spans show through — the user types normally, highlights appear.
    //   4. We never call editor.focus() during navigation so the cursor stays in
    //      the search input and keystrokes never accidentally edit matched text.

    let searchMatches = [];
    let searchCurrent = -1;
    let searchActive = false;

    // Escape text for insertion into the overlay div
    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Rebuild the overlay with all matches highlighted.
    // currentIdx = which match gets the "active" highlight colour.
    function renderHighlightOverlay(text, matches, currentIdx) {
        if (!matches || matches.length === 0) {
            // No search active — just keep overlay clear (invisible)
            highlightOverlay.innerHTML = '';
            return;
        }

        let html = '';
        let pos = 0;
        matches.forEach((m, i) => {
            // Text before this match
            if (m.start > pos) {
                html += escapeHtml(text.slice(pos, m.start));
            }
            const isCurrent = i === currentIdx;
            // All matches: yellow. Active match: orange + slightly darker so it stands out.
            const bg = isCurrent
                ? 'background:#f97316; color:#fff; border-radius:2px; outline:2px solid #ea580c;'
                : 'background:#fde68a; color:#1e1e1e; border-radius:2px;';
            html += `<mark style="${bg}">${escapeHtml(text.slice(m.start, m.end))}</mark>`;
            pos = m.end;
        });
        // Remaining text after last match
        if (pos < text.length) {
            html += escapeHtml(text.slice(pos));
        }

        highlightOverlay.innerHTML = html;
        // Keep overlay scroll in sync
        highlightOverlay.scrollTop = editor.scrollTop;
    }

    function clearHighlightOverlay() {
        highlightOverlay.innerHTML = '';
    }

    function runSearch() {
        const query = searchInput.value;
        searchMatches = [];
        searchCurrent = -1;

        if (!query) {
            clearHighlightOverlay();
            updateSearchCount();
            return;
        }

        const text = editor.value;
        const flags = searchCaseSensitive ? 'g' : 'gi';
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, flags);

        let match;
        while ((match = regex.exec(text)) !== null) {
            searchMatches.push({ start: match.index, end: match.index + match[0].length });
            if (match[0].length === 0) regex.lastIndex++;
        }

        if (searchMatches.length > 0) {
            // Jump to the nearest match to the current cursor position
            const cursorPos = editor.selectionStart;
            let nearest = 0, nearestDist = Infinity;
            searchMatches.forEach((m, i) => {
                const dist = Math.abs(m.start - cursorPos);
                if (dist < nearestDist) { nearestDist = dist; nearest = i; }
            });
            goToMatch(nearest);
        } else {
            clearHighlightOverlay();
            updateSearchCount();
        }
    }

    function goToMatch(index) {
        if (searchMatches.length === 0) return;
        searchCurrent = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
        const match = searchMatches[searchCurrent];

        // Scroll the editor so the active match is vertically centred
        const textBefore = editor.value.slice(0, match.start);
        const linesBefore = textBefore.split('\n').length - 1;
        const lineHeight = getLineHeight();
        const targetScroll = linesBefore * lineHeight;
        const visibleLines = editor.clientHeight / lineHeight;

        if (
            targetScroll < editor.scrollTop ||
            targetScroll > editor.scrollTop + editor.clientHeight - lineHeight * 2
        ) {
            editor.scrollTop = Math.max(0, targetScroll - (visibleLines / 2) * lineHeight);
        }

        // Draw all highlights; active match gets a different colour
        renderHighlightOverlay(editor.value, searchMatches, searchCurrent);

        // Keep focus in the search bar — NEVER move it to the editor
        searchInput.focus();

        updateSearchCount();
    }

    function updateSearchCount() {
        const total = searchMatches.length;
        if (!searchInput.value) {
            searchMatchCount.textContent = 'No results';
            searchMatchCount.style.color = 'var(--text-secondary)';
        } else if (total === 0) {
            searchMatchCount.textContent = 'No results';
            searchMatchCount.style.color = '#e74c3c';
        } else {
            searchMatchCount.textContent = `${searchCurrent + 1} / ${total}`;
            searchMatchCount.style.color = 'var(--text-secondary)';
        }
    }

    function openSearch() {
        searchActive = true;
        searchContainer.style.display = 'flex';
        // Pre-fill with any selected text (VS Code style)
        const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
        if (sel && !sel.includes('\n') && sel.length < 200) {
            searchInput.value = sel;
        }
        searchInput.focus();
        searchInput.select();
        runSearch();
    }

    function closeSearch() {
        searchActive = false;
        searchContainer.style.display = 'none';
        searchMatches = [];
        searchCurrent = -1;
        clearHighlightOverlay();
        updateSearchCount();
        if (editorVisible) editor.focus();
    }

    searchInput.addEventListener('input', runSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.shiftKey ? goToMatch(searchCurrent - 1) : goToMatch(searchCurrent + 1);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSearch();
        }
    });

    searchNextBtn.addEventListener('click', () => goToMatch(searchCurrent + 1));
    searchPrevBtn.addEventListener('click', () => goToMatch(searchCurrent - 1));
    searchCloseBtn.addEventListener('click', closeSearch);

    searchCaseSensitiveBtn.addEventListener('click', () => {
        searchCaseSensitive = !searchCaseSensitive;
        searchCaseSensitiveBtn.style.background = searchCaseSensitive ? 'var(--accent-color)' : '';
        searchCaseSensitiveBtn.style.color = searchCaseSensitive ? 'white' : '';
        runSearch();
    });

    // Ctrl+F — only when the editor pane is visible
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
        if (ctrlOrCmd && e.key === 'f' && editorVisible) {
            e.preventDefault();
            e.stopPropagation();
            searchActive ? closeSearch() : openSearch();
        }
    });

    // Re-run search on editor changes so highlights stay accurate
    editor.addEventListener('input', () => {
        if (searchActive && searchInput.value) {
            runSearch();
        }
    });

    // ─── Register tab ─────────────────────────────────────────────────────────
    tabManager.openTab({
        id: tabId,
        title: title,
        content: container,
        onClose: () => {
            if (forceClose) { themeObserver.disconnect(); return true; }
            if (isDirty) {
                window.customAlert.confirm(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to close this tab?'
                ).then(choice => {
                    if (choice === 1) { forceClose = true; tabManager.closeTab(tabId); }
                });
                return false;
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