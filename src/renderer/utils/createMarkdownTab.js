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
    const text = editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    
    const statusText = isDirty ? 'Modified' : 'Saved';
    const statusColor = isDirty ? '#f39c12' : '#2ecc71';
    
    statusIndicator.innerHTML = `
        <span style="color: var(--text-secondary); font-size: 11px; margin-right: 8px;">
            ${words} words &middot; ${chars} chars
        </span>
        <span style="color: ${statusColor};">● ${statusText}</span>
    `;
}

function wrapSelection(prefix, suffix) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.slice(start, end);
    
    // Trim whitespace from selection for cleaner formatting
    const trimmedText = selectedText.trim();
    const leadingSpace = selectedText.match(/^\s*/)[0];
    const trailingSpace = selectedText.match(/\s*$/)[0];
    
    // If selection is only whitespace, don't apply formatting
    if (!trimmedText) {
        editor.focus();
        return;
    }
    
    // Check if already wrapped (to toggle off)
    const before = text.slice(Math.max(0, start - prefix.length), start);
    const after = text.slice(end, end + suffix.length);
    
    if (before === prefix && after === suffix) {
        // Remove wrapper - keep the trimmed text only
        editor.value = text.slice(0, start - prefix.length) + trimmedText + text.slice(end + suffix.length);
        editor.selectionStart = start - prefix.length + leadingSpace.length;
        editor.selectionEnd = end - prefix.length - trailingSpace.length;
    } else {
        // Add wrapper around trimmed text, preserving spaces outside
        const newText = text.slice(0, start) + leadingSpace + prefix + trimmedText + suffix + trailingSpace + text.slice(end);
        editor.value = newText;
        
        // Position cursor after the formatted text
        const newStart = start + leadingSpace.length + prefix.length;
        const newEnd = newStart + trimmedText.length;
        editor.selectionStart = newStart;
        editor.selectionEnd = newEnd;
    }
    editor.dispatchEvent(new Event('input')); // Trigger preview update
    editor.focus();
}

function insertMarkdownLink() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.slice(start, end);
    
    const linkText = selectedText || 'link text';
    const insertion = `[${linkText}](url)`;
    
    editor.value = text.slice(0, start) + insertion + text.slice(end);
    
    // Automatically select the 'url' part so the user can start typing immediately
    const urlStart = start + linkText.length + 3; 
    editor.selectionStart = urlStart;
    editor.selectionEnd = urlStart + 3;
    editor.focus();
    editor.dispatchEvent(new Event('input'));
}

    // ─── Formatting Toolbar (Visual Buttons) ─────────────────────────────────
    // Helper to handle multi-line prefixes (like Lists and Blockquotes)
    function prefixLines(prefix) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = text.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = text.length;
        
        const lines = text.slice(lineStart, lineEnd).split('\n');
        const allPrefixed = lines.filter(l => l.trim()).every(line => line.startsWith(prefix));
        
        const newLines = allPrefixed 
            ? lines.map(line => line.startsWith(prefix) ? line.slice(prefix.length) : line).join('\n')
            : lines.map(line => line.trim() ? prefix + line : line).join('\n');
            
        editor.value = text.slice(0, lineStart) + newLines + text.slice(lineEnd);
        editor.selectionStart = lineStart;
        editor.selectionEnd = lineStart + newLines.length;
        editor.dispatchEvent(new Event('input'));
        editor.focus();
    }

    // Create the toolbar container
    const formattingToolbar = document.createElement('div');
    formattingToolbar.className = 'markdown-formatting-toolbar';
    formattingToolbar.style.cssText = `
        display: flex; gap: 4px; padding: 6px 12px; 
        background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color);
        flex-wrap: wrap; align-items: center;
    `;

    // Helper to generate buttons
    function createFormatBtn(tooltip, iconSvg, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = iconSvg;
        btn.setAttribute('data-tooltip', tooltip);
        btn.className = 'markdown-btn';
        btn.style.cssText = `padding: 4px 8px; min-width: 28px;`;
        btn.addEventListener('mousedown', (e) => e.preventDefault()); // Prevents editor from losing focus
        btn.addEventListener('click', () => { onClick(); editor.focus(); });
        return btn;
    }

    // SVG Icons (Feather style)
    // const icons = {
    //     bold: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
    //     italic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
    //     code: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    //     link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    //     quote: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>',
    //     list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    // };

    // ─── Advanced Formatting Helpers ─────────────────────────────────────────
    
    // Helper for Headings (Toggles between H1, H2, H3, or plain text)
    function insertHeading(level) {
        const start = editor.selectionStart;
        const text = editor.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', start);
        const actualEnd = lineEnd === -1 ? text.length : lineEnd;
        
        const lineText = text.slice(lineStart, actualEnd);
        const cleanLine = lineText.replace(/^#{1,6}\s*/, ''); // Remove existing headings
        const prefix = '#'.repeat(level) + ' ';
        
        editor.value = text.slice(0, lineStart) + prefix + cleanLine + text.slice(actualEnd);
        editor.selectionStart = editor.selectionEnd = lineStart + prefix.length + cleanLine.length;
        editor.dispatchEvent(new Event('input'));
        editor.focus();
    }

    // Helper for inserting a Markdown Table
    function insertTable() {
        const start = editor.selectionStart;
        const text = editor.value;
        const tableMarkdown = `\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n`;
        editor.value = text.slice(0, start) + tableMarkdown + text.slice(start);
        editor.selectionStart = editor.selectionEnd = start + tableMarkdown.length;
        editor.dispatchEvent(new Event('input'));
        editor.focus();
    }

    // Helper to create visual dividers in the toolbar
    function createDivider() {
        const span = document.createElement('span');
        span.style.cssText = 'width: 1px; height: 20px; background: var(--border-color); margin: 0 4px; display: inline-block;';
        return span;
    }

    // Helper to create Heading buttons (Text looks cleaner than SVGs for H1/H2/H3)
    function createHeadingBtn(level) {
        const btn = document.createElement('button');
        btn.innerHTML = `H${level}`;
        btn.setAttribute('data-tooltip', `Heading ${level}`);
        btn.className = 'markdown-btn';
        btn.style.cssText = `padding: 4px 8px; min-width: 28px; font-weight: bold; font-size: 12px;`;
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => { insertHeading(level); editor.focus(); });
        return btn;
    }

    // Add new icons
    const icons = {
        bold: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
        italic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
        strikethrough: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
        code: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        quote: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>',
        list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
        table: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>'
    };

    // Wire up the fully upgraded toolbar
    formattingToolbar.append(
        createHeadingBtn(1),
        createHeadingBtn(2),
        createHeadingBtn(3),
        createDivider(),
        createFormatBtn('Bold (Ctrl+B)', icons.bold, () => wrapSelection('**', '**')),
        createFormatBtn('Italic (Ctrl+I)', icons.italic, () => wrapSelection('*', '*')),
        createFormatBtn('Strikethrough', icons.strikethrough, () => wrapSelection('~~', '~~')),
        createFormatBtn('Inline Code (Ctrl+`)', icons.code, () => wrapSelection('`', '`')),
        createDivider(),
        createFormatBtn('Link (Ctrl+K)', icons.link, insertMarkdownLink),
        createFormatBtn('Blockquote', icons.quote, () => prefixLines('> ')),
        createFormatBtn('Bullet List', icons.list, () => prefixLines('- ')),
        createFormatBtn('Insert Table', icons.table, insertTable)
    );

    // Inject the toolbar at the very top of the editor pane
    editorPane.prepend(formattingToolbar);

// Update your existing editor keydown listener to include these:
editor.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (ctrlOrCmd) {
        if (e.key === 's') { e.preventDefault(); saveFile(); return; }
        
        let prefix = '', suffix = '';
        if (e.key === 'b') { prefix = '**'; suffix = '**'; }         // Bold
        else if (e.key === 'i') { prefix = '*'; suffix = '*'; }      // Italic
        else if (e.key === 'k') { e.preventDefault(); insertMarkdownLink(); return; } // Link
        else if (e.code === 'Backquote') { prefix = '`'; suffix = '`'; } // Inline Code (Ctrl + `)
        
        if (prefix) {
            e.preventDefault();
            wrapSelection(prefix, suffix);
        }
    }
});

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
        // Limit maximum zoom to 150%
        editorZoom = Math.min(200, editorZoom + 10);
        previewZoom = Math.min(200, previewZoom + 10);
        updateZoom();
    });
    
    zoomOutBtn.addEventListener('click', () => {
        // Limit minimum zoom to 100%
        editorZoom = Math.max(100, editorZoom - 10);
        previewZoom = Math.max(100, previewZoom - 10);
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

    document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
}, { passive: false });


    // ─── Notify main process when this markdown tab is active ────────────────
    // Uses IntersectionObserver on the container so we track actual visibility
    // (tab switching shows/hides the container). This tells main.js to stop
    // blocking Ctrl+/- so our renderer zoom handler can fire.
    const _visibilityObserver = new IntersectionObserver((entries) => {
        const isVisible = entries.some(e => e.isIntersecting && e.intersectionRatio > 0);
        if (window.electronAPI?.send) {
            window.electronAPI.send('markdown-tab-active', isVisible);
        }
    }, { threshold: 0.01 });
    _visibilityObserver.observe(container);


    // ─── Register tab ─────────────────────────────────────────────────────────
    tabManager.openTab({
        id: tabId,
        title: title,
        content: container,
        onClose: () => {
            if (forceClose) { themeObserver.disconnect(); _visibilityObserver.disconnect(); return true; }
            if (isDirty) {
                window.customAlert.confirm(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to close this tab?'
                ).then(choice => {
                    if (choice === 1) { forceClose = true; tabManager.closeTab(tabId); }
                });
                return false;
            }
            tthemeObserver.disconnect();
            _visibilityObserver.disconnect();
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