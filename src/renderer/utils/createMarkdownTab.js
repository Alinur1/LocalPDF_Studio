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
import i18n from './i18n.js';
import {
    wrapSelectionInText,
    insertLinkInText,
    isWebUrl,
    prefixLinesInText,
    insertHeadingInText,
    insertTableInText,
    insertNumberedListInText,
    insertImageInText,
    insertCodeBlockInText,
    indentInText,
    continueListInText,
} from './markdown/textTransforms.mjs';
import {
    lineToPreviewScrollTop as calcLineToPreview,
    previewScrollToEditorLine as calcPreviewToLine,
} from './markdown/scrollMath.mjs';
import { countWords, readMinutes } from './markdown/stats.mjs';
import { escapeHtml, renderMarkdownToHtml, resolvePreviewImages } from './markdown/render.mjs';
import { relativizeImagePath } from './markdown/imageUrl.mjs';
import { assignSyncLines } from './markdown/syncLines.mjs';


let sharedMarkdownCssLink = null;
let exportModalSeq = 0;
let markdownTabSeq = 0;

let overlayScrollbarStyle = null;
function ensureOverlayScrollbarStyle() {
    if (overlayScrollbarStyle?.parentNode) return;
    overlayScrollbarStyle = document.createElement('style');
    overlayScrollbarStyle.textContent = `.markdown-search-overlay::-webkit-scrollbar { display: none; }`;
    document.head.appendChild(overlayScrollbarStyle);
}

export default async function createMarkdownTab(filePath, tabManager, existingId = null, initialContent = null) {
    const tabId = existingId || `markdown:${filePath}:${Date.now()}:${++markdownTabSeq}`;
    const title = filePath.split(/[\\/]/).pop();
    let isDirty = false;
    let currentFilePath = filePath;
    let editorZoom = 100;
    let previewZoom = 100;
    let forceClose = false;
    const t = (key) => i18n.t(`markdownEditor.${key}`);
    const i18nBindings = [];
    function tooltipText(key, params) {
        let s = t(key);
        if (params) {
            for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
        }
        return s;
    }
    function applyTip(entry) {
        const text = tooltipText(entry.key, entry.params);
        entry.el.setAttribute('data-tooltip', text);
        if (entry.el instanceof HTMLButtonElement) entry.el.setAttribute('aria-label', text);
        if (entry.el.title) entry.el.title = text;
    }
    function bindTip(el, key, params) {
        const entry = { el, key, params };
        applyTip(entry);
        i18nBindings.push(entry);
        return entry;
    }
    function onLanguageChanged() {
        for (const entry of i18nBindings) {
            if (entry.el.isConnected) applyTip(entry);
        }
        if (searchInput.isConnected) searchInput.placeholder = t('searchPlaceholder');
        updateStatusIndicator();
        const warnText = container.querySelector('[data-warn-text]');
        if (warnText) warnText.textContent = t('degradedPreviewWarning');
        const loadText = loadBanner?.querySelector('[data-load-text]');
        if (loadText) loadText.textContent = t('loadFailedBanner');
        const loadRetry = loadBanner?.querySelector('[data-load-retry]');
        if (loadRetry) loadRetry.textContent = t('loadFailedRetry');
        const extText = externalBanner?.querySelector('[data-ext-text]');
        if (extText) extText.textContent = t('externalChangeBanner');
        const extReload = externalBanner?.querySelector('[data-ext-reload]');
        if (extReload) extReload.textContent = t('externalChangeReload');
        const extKeep = externalBanner?.querySelector('[data-ext-keep]');
        if (extKeep) extKeep.textContent = t('externalChangeKeep');
    }
    window.addEventListener('language-changed', onLanguageChanged);

    const getAssetPath = async (relativePath) => {
        if (window.electronAPI?.resolveAsset) {
            return await window.electronAPI.resolveAsset(relativePath);
        }
        const base = window.location.origin.replace(/\/$/, '');
        return `${base}/assets/${relativePath}`;
    };

    const loadMarked = async () => {
        if (window.marked) { return; }
        const scriptUrl = await getAssetPath('js/marked.umd.js');
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                // marked 18: only gfm/breaks are valid here (headerIds/mangle were removed).
                window.marked.setOptions({ gfm: true, breaks: true });
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load marked.js'));
            document.head.appendChild(script);
        });
    };

    const loadPurify = async () => {
        if (window.DOMPurify?.sanitize) { return; }
        const scriptUrl = await getAssetPath('js/purify.min.js');
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                if (window.DOMPurify?.sanitize) resolve();
                else reject(new Error('DOMPurify loaded but sanitize() is unavailable'));
            };
            script.onerror = () => reject(new Error('Failed to load purify.min.js'));
            document.head.appendChild(script);
        });
    };

    // Single shared <link> for all markdown tabs. Reused when
    // it already points at the right file; otherwise its href is updated.
    // Never removed per-tab — it belongs to the window, not the tab.
    const loadGithubCss = async (theme) => {
        let cssFile = 'github-markdown.css';
        if (theme === 'light') cssFile = 'github-markdown-light.css';
        else if (theme === 'dark') cssFile = 'github-markdown-dark.css';
        const cssUrl = await getAssetPath(`css/${cssFile}`);
        if (!sharedMarkdownCssLink?.parentNode) {
            sharedMarkdownCssLink = document.createElement('link');
            sharedMarkdownCssLink.rel = 'stylesheet';
            sharedMarkdownCssLink.id = 'markdown-github-css';
            document.head.appendChild(sharedMarkdownCssLink);
        }
        if (sharedMarkdownCssLink.getAttribute('href') !== cssUrl) {
            sharedMarkdownCssLink.href = cssUrl;
        }
    };

    // Guarded boot — a missing vendor lib degrades to safe fallback
    // rendering instead of killing the whole tab.
    let loadWarning = null;
    try {
        await loadMarked();
    } catch (err) {
        console.error('Markdown preview degraded: could not load marked.js:', err);
        loadWarning = 'marked';
    }
    try {
        await loadPurify();
    } catch (err) {
        console.error('Markdown preview degraded: could not load DOMPurify:', err);
        loadWarning = loadWarning ? 'marked+purify' : 'purify';
    }

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
    bindTip(saveBtn, 'saveTooltip');
    saveBtn.className = 'markdown-btn tooltip-left';

    const exportPdfBtn = document.createElement('button');
    exportPdfBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    bindTip(exportPdfBtn, 'exportTooltip');
    exportPdfBtn.className = 'markdown-btn tooltip-left';

    const toggleEditorBtn = document.createElement('button');
    toggleEditorBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
    bindTip(toggleEditorBtn, 'toggleEditorTooltip');
    toggleEditorBtn.setAttribute('aria-pressed', 'false');
    toggleEditorBtn.className = 'markdown-btn tooltip-left';

    const layoutBtn = document.createElement('button');
    layoutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>';
    bindTip(layoutBtn, 'toggleLayoutTooltip');
    layoutBtn.className = 'markdown-btn tooltip-left';

    const syncToggleBtn = document.createElement('button');
    syncToggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';
    const syncTip = bindTip(syncToggleBtn, 'syncScrollTooltip');
    syncToggleBtn.className = 'markdown-btn tooltip-left';
    // Toggle state lives in .is-active (markdown-tab.css) +
    // aria-pressed, not inline styles — inline colors fought the theme.
    syncToggleBtn.classList.add('is-active');
    syncToggleBtn.setAttribute('aria-pressed', 'true');

    const zoomContainer = document.createElement('div');
    zoomContainer.style.cssText = `display: flex; gap: 4px; align-items: center; margin-left: 12px; border-left: 1px solid var(--border-color); padding-left: 12px;`;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>';
    bindTip(zoomOutBtn, 'zoomOutTooltip');
    zoomOutBtn.className = 'markdown-btn';

    const zoomLevel = document.createElement('span');
    zoomLevel.textContent = '100%';
    zoomLevel.style.cssText = `font-size: 12px; color: var(--text-secondary); min-width: 40px; text-align: center;`;

    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>';
    bindTip(zoomInBtn, 'zoomInTooltip');
    zoomInBtn.className = 'markdown-btn';

    zoomContainer.append(zoomOutBtn, zoomLevel, zoomInBtn);

    // ─── Search bar ──────────────────────────────────────────────────────────
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `display: none; align-items: center; gap: 4px; margin-left: 12px; border-left: 1px solid var(--border-color); padding-left: 12px;`;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = t('searchPlaceholder');
    searchInput.style.cssText = `background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 13px; outline: none; width: 180px;`;

    const searchCaseSensitiveBtn = document.createElement('button');
    searchCaseSensitiveBtn.textContent = 'Aa';
    bindTip(searchCaseSensitiveBtn, 'caseSensitiveTooltip');
    searchCaseSensitiveBtn.setAttribute('aria-pressed', 'false');
    searchCaseSensitiveBtn.className = 'markdown-btn';
    searchCaseSensitiveBtn.style.cssText = `font-size: 11px; font-weight: bold; padding: 3px 6px; min-width: 26px;`;
    let searchCaseSensitive = false;

    const searchMatchCount = document.createElement('span');
    searchMatchCount.style.cssText = `font-size: 12px; color: var(--text-secondary); white-space: nowrap; min-width: 54px; text-align: center;`;
    searchMatchCount.textContent = t('noResults');

    const searchPrevBtn = document.createElement('button');
    searchPrevBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
    bindTip(searchPrevBtn, 'previousTooltip');
    searchPrevBtn.className = 'markdown-btn';

    const searchNextBtn = document.createElement('button');
    searchNextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
    bindTip(searchNextBtn, 'nextTooltip');
    searchNextBtn.className = 'markdown-btn';

    const searchCloseBtn = document.createElement('button');
    searchCloseBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    bindTip(searchCloseBtn, 'closeTooltip');
    searchCloseBtn.className = 'markdown-btn';

    searchContainer.append(searchInput, searchCaseSensitiveBtn, searchMatchCount, searchPrevBtn, searchNextBtn, searchCloseBtn);

    const statusIndicator = document.createElement('span');
    statusIndicator.style.cssText = `margin-left: auto; font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; cursor: help;`;
    bindTip(statusIndicator, 'fileStatusTooltip');

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
    // Must share identical font/padding/sizing/tab-size with the textarea so
    // characters land in exactly the same pixel positions. The
    // overlay scrolls identically (overflow auto, scrollbars hidden) and the
    // textarea reserves a stable scrollbar gutter so its content width never
    // oscillates as the scrollbar appears/disappears.
    const highlightOverlay = document.createElement('div');
    highlightOverlay.setAttribute('aria-hidden', 'true');
    highlightOverlay.className = 'markdown-search-overlay';
    ensureOverlayScrollbarStyle();
    highlightOverlay.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        padding: 16px;
        font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        tab-size: 4;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: auto;
        scrollbar-width: none;
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
        font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.5;
        tab-size: 4;
        scrollbar-gutter: stable;
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

    // Surface a degraded-preview warning instead of failing silently.
    if (loadWarning) {
        const warnBar = document.createElement('div');
        warnBar.setAttribute('role', 'alert');
        warnBar.style.cssText = `padding: 8px 12px; background: #7a4a00; color: #fff; font-size: 12px; display: flex; align-items: center; gap: 8px;`;
        const warnText = document.createElement('span');
        warnText.setAttribute('data-warn-text', '');
        warnText.textContent = t('degradedPreviewWarning');
        const warnClose = document.createElement('button');
        warnClose.textContent = '×';
        warnClose.setAttribute('aria-label', t('closeTooltip'));
        warnClose.style.cssText = `margin-left: auto; background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer;`;
        warnClose.addEventListener('click', () => warnBar.remove());
        warnBar.append(warnText, warnClose);
        container.prepend(warnBar);
    }

    let editorVisible = false;
    let savedEditorScroll = 0;
    let savedSelStart = 0;
    let savedSelEnd = 0;
    editorPane.style.display = 'none';

    // Never navigate the app window from preview content.
    // will-navigate allows file: URLs, so a relative link would unload the app.
    // http(s) opens externally; everything else is ignored. Hook
    // relative *.md links could open in a new markdown tab instead.
    preview.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && /^https?:\/\//i.test(href)) {
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(href);
            } else {
                window.open(href, '_blank');
            }
        }
    });


    let loadFailed = false;
    let loadErrorMessage = '';
    let loadBanner = null;
    let knownMtimeMs = 0;
    function sanitizeLoadedContent(content) {
        if (typeof content !== 'string') throw new Error(t('loadEncodingError'));
        const stripped = content.replace(/^\uFEFF/, '');
        if (stripped.includes('\0')) throw new Error(t('loadEncodingError'));
        return stripped;
    }
    async function refreshKnownMtime() {
        try {
            const info = await window.electronAPI?.getFileInfo?.(currentFilePath);
            if (info && typeof info.mtimeMs === 'number') knownMtimeMs = info.mtimeMs;
        } catch { /* stat unavailable — external detection stays off */ }
    }
    let rawContent = initialContent;
    if (!rawContent) {
        try {
            rawContent = await window.electronAPI.readMarkdownFile(filePath);
        } catch (err) {
            console.error('Error loading markdown file:', err);
            loadFailed = true;
            loadErrorMessage = err?.message || t('unknownError');
            rawContent = null;
        }
    }
    if (rawContent == null) {
        initialContent = '';
    } else {
        try {
            initialContent = sanitizeLoadedContent(rawContent);
        } catch (err) {
            console.error('Error decoding markdown file:', err);
            loadFailed = true;
            loadErrorMessage = err?.message || t('unknownError');
            initialContent = '';
        }
    }
    editor.value = initialContent;
    await refreshKnownMtime();

    function removeLoadBanner() {
        if (loadBanner?.parentNode) loadBanner.parentNode.removeChild(loadBanner);
        loadBanner = null;
    }

    async function retryLoad() {
        // Only safe when the user hasn't typed anything — otherwise we'd
        // discard their content. The retry button disables itself once dirty.
        if (isDirty) return;
        try {
            const content = sanitizeLoadedContent(
                await window.electronAPI.readMarkdownFile(currentFilePath));
            editor.value = content;
            loadFailed = false;
            loadErrorMessage = '';
            removeLoadBanner();
            await refreshKnownMtime();
            updatePreview();
            updateStatusIndicator();
        } catch (err) {
            console.error('Retry loading markdown file:', err);
            loadErrorMessage = err?.message || t('unknownError');
            updateLoadBannerDetail();
        }
    }

    let externalBanner = null;
    function removeExternalBanner() {
        if (externalBanner?.parentNode) externalBanner.parentNode.removeChild(externalBanner);
        externalBanner = null;
    }
    async function adoptExternalContent(content) {
        editor.value = content;
        isDirty = false;
        loadFailed = false;
        loadErrorMessage = '';
        removeLoadBanner();
        removeExternalBanner();
        await refreshKnownMtime();
        updateTabTitle();
        updatePreview();
        updateStatusIndicator();
    }
    function showExternalBanner() {
        if (externalBanner) return;
        externalBanner = document.createElement('div');
        externalBanner.setAttribute('role', 'alert');
        externalBanner.style.cssText = `padding: 8px 12px; background: #5b4a00; color: #fff; font-size: 12px; display: flex; align-items: center; gap: 8px;`;
        const msg = document.createElement('span');
        msg.setAttribute('data-ext-text', '');
        msg.textContent = t('externalChangeBanner');
        const reloadBtn = document.createElement('button');
        reloadBtn.setAttribute('data-ext-reload', '');
        reloadBtn.textContent = t('externalChangeReload');
        reloadBtn.style.cssText = `margin-left: auto; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.4); color: #fff; border-radius: 4px; padding: 2px 10px; font-size: 12px; cursor: pointer;`;
        reloadBtn.addEventListener('click', async () => {
            try {
                await adoptExternalContent(sanitizeLoadedContent(
                    await window.electronAPI.readMarkdownFile(currentFilePath)));
            } catch (err) {
                console.error('Reload after external change failed:', err);
            }
        });
        const keepBtn = document.createElement('button');
        keepBtn.setAttribute('data-ext-keep', '');
        keepBtn.textContent = t('externalChangeKeep');
        keepBtn.style.cssText = reloadBtn.style.cssText;
        keepBtn.addEventListener('click', async () => {
            // Accept the divergence: track the new mtime so we ask once.
            removeExternalBanner();
            await refreshKnownMtime();
        });
        externalBanner.append(msg, reloadBtn, keepBtn);
        container.prepend(externalBanner);
    }
    async function checkExternalChange() {
        let info;
        try {
            info = await window.electronAPI?.getFileInfo?.(currentFilePath);
        } catch { return; }
        if (!info || typeof info.mtimeMs !== 'number' || info.mtimeMs === 0) return;
        if (knownMtimeMs === 0) { knownMtimeMs = info.mtimeMs; return; } // first sighting
        if (info.mtimeMs === knownMtimeMs) return;
        if (!isDirty) {
            try {
                await adoptExternalContent(sanitizeLoadedContent(
                    await window.electronAPI.readMarkdownFile(currentFilePath)));
            } catch (err) {
                console.error('Auto-reload after external change failed:', err);
            }
            return;
        }
        showExternalBanner();
    }
    window.addEventListener('focus', checkExternalChange);

    function updateLoadBannerDetail() {
        const detail = loadBanner?.querySelector('[data-load-error]');
        if (detail) detail.textContent = loadErrorMessage;
        const retry = loadBanner?.querySelector('[data-load-retry]');
        if (retry) retry.disabled = isDirty;
    }

    if (loadFailed) {
        loadBanner = document.createElement('div');
        loadBanner.setAttribute('role', 'alert');
        loadBanner.style.cssText = `padding: 8px 12px; background: #7a1f1f; color: #fff; font-size: 12px; display: flex; align-items: center; gap: 8px;`;
        const warnText = document.createElement('span');
        warnText.setAttribute('data-load-text', '');
        warnText.textContent = t('loadFailedBanner');
        const errDetail = document.createElement('span');
        errDetail.setAttribute('data-load-error', '');
        errDetail.style.cssText = `opacity: 0.8;`;
        errDetail.textContent = loadErrorMessage;
        const retryBtn = document.createElement('button');
        retryBtn.setAttribute('data-load-retry', '');
        retryBtn.textContent = t('loadFailedRetry');
        retryBtn.style.cssText = `margin-left: auto; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.4); color: #fff; border-radius: 4px; padding: 2px 10px; font-size: 12px; cursor: pointer;`;
        retryBtn.addEventListener('click', retryLoad);
        loadBanner.append(warnText, errDetail, retryBtn);
        container.prepend(loadBanner);
    }

    // ─── Preview renderer ─────────────────────────────────────────────────────
    let previewTimeout;
    function updatePreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(runPreviewPipeline, 150);
    }
    function runPreviewPipeline() {
        const maxBefore = previewPane.scrollHeight - previewPane.clientHeight;
        const scrollFraction = maxBefore > 0 ? previewPane.scrollTop / maxBefore : 0;
        suppressSyncScroll = true;
        try {
            preview.innerHTML = renderMarkdownToHtml(editor.value);
            resolvePreviewImages(preview, currentFilePath);
            assignSyncLines(editor.value, preview, window.marked);
            invalidateBlockCache();
        } catch (err) {
            preview.innerHTML = `<p style="color: #e74c3c;">${escapeHtml(t('errorParsingMarkdown'))} ${escapeHtml(err.message)}</p>`;
        }
        const maxAfter = previewPane.scrollHeight - previewPane.clientHeight;
        previewPane.scrollTop = maxAfter > 0 ? scrollFraction * maxAfter : 0;
        requestAnimationFrame(() => requestAnimationFrame(() => { suppressSyncScroll = false; }));
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
        updateTabTitle();
        updateLoadBannerDetail();
        updatePreview();
        updateStatusIndicator();
    });

    function updateTabTitle() {
        if (typeof tabManager.setTitle === 'function') {
            tabManager.setTitle(tabId, (isDirty ? '● ' : '') + title);
        }
    }


    let statusCountTimer = null;
    let statusInitialized = false;
    let cachedStatusCounts = { words: 0, chars: 0, readTime: 0 };
    function refreshStatusCounts() {
        const text = editor.value;
        const words = countWords(text);
        cachedStatusCounts = { words, chars: text.length, readTime: readMinutes(words) };
    }
    function renderStatusIndicator() {
        const statusText = isDirty ? t('modified') : t('saved');
        const statusColor = isDirty ? '#f39c12' : '#2ecc71';

        statusIndicator.innerHTML = `
        <span style="color: var(--text-secondary); font-size: 11px; margin-right: 8px;">
            ${cachedStatusCounts.words} ${t('statusWords')} &middot; ${cachedStatusCounts.chars} ${t('statusChars')} &middot; ${cachedStatusCounts.readTime} ${t('statusReadTime')}
        </span>
        <span style="color: ${statusColor};">● ${statusText}</span>
    `;
    }
    function updateStatusIndicator() {
        if (!statusInitialized) {
            statusInitialized = true;
            refreshStatusCounts();
        }
        renderStatusIndicator();
        clearTimeout(statusCountTimer);
        statusCountTimer = setTimeout(() => {
            refreshStatusCounts();
            renderStatusIndicator();
        }, 250);
    }

    function applyTextResult(result) {
        if (!result) {
            editor.focus();
            return;
        }
        const oldText = editor.value;
        const newText = result.text;
        let start = 0;
        while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start++;
        let oldEnd = oldText.length, newEnd = newText.length;
        while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) { oldEnd--; newEnd--; }
        editor.focus();
        editor.selectionStart = start;
        editor.selectionEnd = oldEnd;
        const applied = (start !== oldEnd || start !== newEnd)
            && document.execCommand('insertText', false, newText.slice(start, newEnd));
        if (!applied && newText !== editor.value) {
            editor.value = newText;
        }
        editor.selectionStart = result.start;
        editor.selectionEnd = result.end;
        editor.dispatchEvent(new Event('input')); // Trigger preview update
        editor.focus();
    }

    function wrapSelection(prefix, suffix) {
        applyTextResult(wrapSelectionInText(editor.value, editor.selectionStart, editor.selectionEnd, prefix, suffix));
    }

    async function insertMarkdownLink() {
        let url = 'url';
        try {
            const clip = await navigator.clipboard?.readText();
            if (isWebUrl(clip)) url = clip.trim();
        } catch { /* clipboard unavailable — placeholder it is */ }
        applyTextResult(insertLinkInText(editor.value, editor.selectionStart, editor.selectionEnd, url));
    }

    function insertImageReference(fileName, imagePath) {
        const ref = relativizeImagePath(currentFilePath, imagePath || fileName);
        const label = (fileName || 'image').replace(/[\[\]]/g, '') || 'image';
        const insertion = `![${label}](${ref})`;
        const at = editor.selectionStart;
        applyTextResult({
            text: editor.value.slice(0, at) + insertion + editor.value.slice(editor.selectionEnd),
            start: at + insertion.length,
            end: at + insertion.length,
        });
    }

    function isImageFile(f) {
        return f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(f.name || ''));
    }

    editorWrapper.addEventListener('dragover', (e) => {
        if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
    });
    editorWrapper.addEventListener('drop', (e) => {
        const images = [...(e.dataTransfer?.files || [])].filter(isImageFile);
        if (images.length === 0) return;
        e.preventDefault();
        editor.focus();
        for (const f of images) insertImageReference(f.name, f.path || f.name);
    });
    editor.addEventListener('paste', (e) => {
        const images = [...(e.clipboardData?.files || [])].filter(isImageFile);
        if (images.length === 0) return; // native text paste proceeds
        e.preventDefault();
        for (const f of images) insertImageReference(f.name, f.path || f.name);
    });

    // Formatting toolbar for visual buttons
    // Helper to handle multi-line prefixes (like Lists and Blockquotes)
    function prefixLines(prefix) {
        applyTextResult(prefixLinesInText(editor.value, editor.selectionStart, editor.selectionEnd, prefix));
    }

    // Create the toolbar container
    const formattingToolbar = document.createElement('div');
    formattingToolbar.className = 'markdown-formatting-toolbar';
    formattingToolbar.style.cssText = `
        display: flex; gap: 4px; padding: 6px 12px; 
        background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color);
        flex-wrap: wrap; align-items: center;
    `;

    // Helper to generate buttons (tooltipKey = markdownEditor.* key, so
    // language refreshes and aria-labels stay in sync via bindTip)
    function createFormatBtn(tooltipKey, iconSvg, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = iconSvg;
        bindTip(btn, tooltipKey);
        btn.title = tooltipText(tooltipKey); //  Native browser tooltip fallback
        btn.className = 'markdown-btn';
        btn.style.cssText = `padding: 4px 8px; min-width: 28px;`;
        btn.addEventListener('mousedown', (e) => e.preventDefault()); // Prevents editor from losing focus
        btn.addEventListener('click', () => { onClick(); editor.focus(); });
        return btn;
    }

    // Helper for Headings (Toggles between H1, H2, H3, or plain text)
    function insertHeading(level) {
        applyTextResult(insertHeadingInText(editor.value, editor.selectionStart, level));
    }

    // Helper for inserting a Markdown Table
    function insertTable() {
        applyTextResult(insertTableInText(editor.value, editor.selectionStart));
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
        bindTip(btn, 'headingTooltip', { level });
        btn.title = tooltipText('headingTooltip', { level }); // Native browser tooltip fallback
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
        table: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
        image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        numbered: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
        codeBlock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
    };

    //toolbar
    formattingToolbar.append(
        createHeadingBtn(1),
        createHeadingBtn(2),
        createHeadingBtn(3),
        createHeadingBtn(4),
        createHeadingBtn(5),
        createHeadingBtn(6),
        createDivider(),
        createFormatBtn('boldTooltip', icons.bold, () => wrapSelection('**', '**')),
        createFormatBtn('italicTooltip', icons.italic, () => wrapSelection('*', '*')),
        createFormatBtn('strikethroughTooltip', icons.strikethrough, () => wrapSelection('~~', '~~')),
        createFormatBtn('inlineCodeTooltip', icons.code, () => wrapSelection('`', '`')),
        createFormatBtn('codeBlockTooltip', icons.codeBlock, insertCodeBlock),
        createDivider(),
        createFormatBtn('linkTooltip', icons.link, insertMarkdownLink),
        createFormatBtn('imageTooltip', icons.image, insertImage),
        createFormatBtn('blockquoteTooltip', icons.quote, () => prefixLines('> ')),
        createFormatBtn('bulletListTooltip', icons.list, () => prefixLines('- ')),
        createFormatBtn('numberedListTooltip', icons.numbered, insertNumberedList),
        createFormatBtn('insertTableTooltip', icons.table, insertTable)
    );

    // Helper for Numbered Lists (Smart incrementing and toggle-off)
    function insertNumberedList() {
        applyTextResult(insertNumberedListInText(editor.value, editor.selectionStart, editor.selectionEnd));
    }

    // Helper for inserting an Image
    function insertImage() {
        applyTextResult(insertImageInText(editor.value, editor.selectionStart));
    }

    // Helper for inserting a Multi-line Code Block
    function insertCodeBlock() {
        applyTextResult(insertCodeBlockInText(editor.value, editor.selectionStart, editor.selectionEnd));
    }

    // Inject the toolbar at the very top of the editor pane
    editorPane.prepend(formattingToolbar);

    // Editor shortcuts — same wrappers as the toolbar buttons
    editor.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
            if (e.key === 'Tab') {
                e.preventDefault();
                applyTextResult(indentInText(editor.value, editor.selectionStart, editor.selectionEnd, e.shiftKey));
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                const continued = continueListInText(editor.value, editor.selectionStart, editor.selectionEnd);
                if (continued) {
                    e.preventDefault();
                    applyTextResult(continued);
                    return;
                }
            }
        }

        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

        if (ctrlOrCmd) {
            // Save File
            if (e.code === 'KeyS') { e.preventDefault(); saveFile(); return; }

            // Code Block (Ctrl+Alt+C — Ctrl+Shift+C is the Chromium
            // DevTools/inspector shortcut and must not be overridden)
            if (e.code === 'KeyC' && e.altKey && !e.shiftKey) { e.preventDefault(); insertCodeBlock(); return; }

            //  UNDO & REDO SHORTCUTS
            if (e.code === 'KeyZ' || e.code === 'KeyY') {
                return;
            }

            // Formatting Shortcuts
            let prefix = '', suffix = '';
            if (e.code === 'KeyB') { prefix = '**'; suffix = '**'; } // Ctrl+B (Bold)
            else if (e.code === 'KeyI') { prefix = '*'; suffix = '*'; } // Ctrl+I (Italic)
            else if (e.code === 'KeyK') { e.preventDefault(); insertMarkdownLink(); return; } // Ctrl+K (Link)
            else if (e.code === 'Backquote') { prefix = '`'; suffix = '`'; } // Ctrl+` (Inline Code)

            if (prefix) {
                e.preventDefault();
                wrapSelection(prefix, suffix);
            }
        }
    });

    async function saveFile() {
        if (loadFailed) {
            const overwrite = await window.customAlert.confirm(
                t('loadFailedOverwriteTitle'),
                t('loadFailedOverwriteMessage')
            );
            if (overwrite !== 1) return;
        }
        try {
            const content = editor.value;
            await window.electronAPI.saveMarkdownFile(currentFilePath, content);
            isDirty = false;
            if (loadFailed) {
                loadFailed = false;
                loadErrorMessage = '';
                removeLoadBanner();
            }
            removeExternalBanner();
            await refreshKnownMtime();
            updateStatusIndicator();
            updateTabTitle();
        } catch (err) {
            console.error('Error saving markdown file:', err);
            window.customAlert.error(t('saveErrorTitle'), `${t('saveErrorMessage')} ${err.message}`);
        }
    }

    saveBtn.addEventListener('click', saveFile);

    function showExportModal() {
        const seq = ++exportModalSeq;
        const sizeId = `md-pdf-size-${seq}`;
        const cancelId = `md-pdf-cancel-${seq}`;
        const exportId = `md-pdf-export-${seq}`;
        const titleId = `md-pdf-title-${seq}`;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
            z-index: 9999;
        `;

        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', titleId);
        modal.style.cssText = `
            background: var(--bg-secondary); padding: 24px; border-radius: 8px;
            width: 300px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            border: 1px solid var(--border-color);
        `;
        modal.innerHTML = `
            <h3 id="${titleId}" style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 16px;">${escapeHtml(t('exportPdfSettingsTitle'))}</h3>

            <div style="margin-bottom: 20px;">
                <label for="${sizeId}" style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">${escapeHtml(t('pageSizeLabel'))}</label>
                <select id="${sizeId}" style="width: 100%; padding: 6px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
                    <option value="A4" selected>A4</option>
                    <option value="Letter">${escapeHtml(t('pageSizeLetter'))}</option>
                    <option value="Legal">${escapeHtml(t('pageSizeLegal'))}</option>
                </select>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="${cancelId}" style="padding: 6px 12px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">${escapeHtml(t('cancel'))}</button>
                <button id="${exportId}" style="padding: 6px 12px; background: var(--accent-color); color: white; border: none; border-radius: 4px; cursor: pointer;">${escapeHtml(t('exportBtn'))}</button>
            </div>
        `;

        overlay.appendChild(modal);
        container.appendChild(overlay);
        const sizeSelect = modal.querySelector(`#${CSS.escape(sizeId)}`);
        const cancelBtn = modal.querySelector(`#${CSS.escape(cancelId)}`);
        const exportBtn = modal.querySelector(`#${CSS.escape(exportId)}`);
        const previouslyFocused = document.activeElement;

        function closeModal() {
            overlay.remove();
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        }

        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) closeModal();
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); closeModal(); return; }
            if (e.key !== 'Tab') return;
            const focusables = [sizeSelect, cancelBtn, exportBtn];
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
        exportBtn.addEventListener('click', () => {
            const options = { pageSize: sizeSelect.value };
            closeModal();
            executePdfExport(options);
        });
        exportBtn.focus();
    }

    async function executePdfExport(options) {
        try {
            exportPdfBtn.disabled = true;
            exportPdfBtn.setAttribute('data-tooltip', t('exportingTooltip'));
            exportPdfBtn.style.opacity = '0.6';
            const htmlContent = renderMarkdownToHtml(editor.value);
            const result = await window.electronAPI.exportMarkdownToPdf(htmlContent, title, {
                mdFilePath: currentFilePath,
                pageSize: options.pageSize
            });

            if (result?.success) {
                const defaultName = title.replace(/\.md$/i, '') + '.pdf';
                const savedPath = await window.electronAPI.savePdfFile(defaultName, new Uint8Array(result.data));
                if (savedPath) {
                    statusIndicator.innerHTML = `<span style="color: #2ecc71;">●</span> ${t('pdfExportedStatus')}`;
                    setTimeout(() => updateStatusIndicator(), 2500);
                }
            } else {
                window.customAlert.error(t('exportFailedTitle'), `${t('exportFailedMessage')} ${result?.error || t('unknownError')}`);
            }
        } catch (err) {
            console.error('Export PDF error:', err);
            window.customAlert.error(t('exportFailedTitle'), `${t('exportFailedMessage')} ${err.message}`);
        } finally {
            exportPdfBtn.disabled = false;
            exportPdfBtn.setAttribute('data-tooltip', t('exportTooltip'));
            exportPdfBtn.style.opacity = '1';
        }
    }

    // Wire the button to show the modal instead of exporting immediately
    exportPdfBtn.addEventListener('click', showExportModal);


    toggleEditorBtn.addEventListener('click', () => {
        editorVisible = !editorVisible;
        if (!editorVisible) {
            savedEditorScroll = editor.scrollTop;
            savedSelStart = editor.selectionStart;
            savedSelEnd = editor.selectionEnd;
            editorPane.style.display = 'none';
            closeSearch();
        } else {
            editorPane.style.display = 'flex';
            requestAnimationFrame(() => {
                editor.scrollTop = savedEditorScroll;
                try { editor.selectionStart = savedSelStart; editor.selectionEnd = savedSelEnd; } catch { /* noop */ }
                editor.focus();
            });
        }
        toggleEditorBtn.classList.toggle('is-active', editorVisible);
        toggleEditorBtn.setAttribute('aria-pressed', String(editorVisible));
    });

    let isHorizontalLayout = true;
    layoutBtn.setAttribute('aria-pressed', 'false');
    layoutBtn.addEventListener('click', () => {
        isHorizontalLayout = !isHorizontalLayout;
        contentArea.style.flexDirection = isHorizontalLayout ? 'row' : 'column';
        layoutBtn.classList.toggle('is-active', !isHorizontalLayout);
        layoutBtn.setAttribute('aria-pressed', String(!isHorizontalLayout));
    });

    function updateZoom() {
        zoomLevel.textContent = Math.round(editorZoom) + '%';
        const editorFontSize = (14 * editorZoom / 100) + 'px';
        editor.style.fontSize = editorFontSize;
        highlightOverlay.style.fontSize = editorFontSize; // keep overlay in sync
        preview.style.fontSize = (16 * previewZoom / 100) + 'px';
        invalidateMeasureCache();
        invalidateBlockCache();
    }

    zoomInBtn.addEventListener('click', () => {
        // Limit maximum zoom to 200%
        editorZoom = Math.min(200, editorZoom + 10);
        previewZoom = Math.min(200, previewZoom + 10);
        updateZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        // Limit minimum zoom to 50%
        editorZoom = Math.max(50, editorZoom - 10);
        previewZoom = Math.max(50, previewZoom - 10);
        updateZoom();
    });

    function onDocumentZoomKey(e) {
        if (tabManager.activeTabId !== tabId) return;
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
        if (ctrlOrCmd) {
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomInBtn.click(); }
            else if (e.key === '-') { e.preventDefault(); zoomOutBtn.click(); }
            else if (e.key === '0') { e.preventDefault(); editorZoom = previewZoom = 100; updateZoom(); }
        }
    }
    document.addEventListener('keydown', onDocumentZoomKey);

    editor.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click(); }
    });
    previewPane.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.deltaY < 0 ? zoomInBtn.click() : zoomOutBtn.click(); }
    });

    updatePreview();
    updateStatusIndicator();

    // Synchronized Scrolling
    let syncEnabled = true;
    let syncSource = null;
    let suppressSyncScroll = false;

    let _cachedLineHeight = null;
    function getLineHeight() {
        if (_cachedLineHeight === null) {
            _cachedLineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 21;
        }
        return _cachedLineHeight;
    }
    function invalidateMeasureCache() {
        _cachedLineHeight = null;
    }

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

    function blockScrollTop(block) {
        const paneRect = previewPane.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        return blockRect.top - paneRect.top + previewPane.scrollTop;
    }
    function editorScrollToLine() { return editor.scrollTop / getLineHeight(); }

    function lineToPreviewScrollTop(targetLine) {
        return calcLineToPreview(targetLine, getBlockPositions(), {
            totalLines: editor.value.split('\n').length,
            editorScrollTop: editor.scrollTop,
            editorMax: editor.scrollHeight - editor.clientHeight,
            previewMax: previewPane.scrollHeight - previewPane.clientHeight,
        });
    }

    function previewScrollToEditorScrollTop(previewScrollTop) {
        const positions = getBlockPositions();
        const editorMax = editor.scrollHeight - editor.clientHeight;
        const previewMax = previewPane.scrollHeight - previewPane.clientHeight;
        if (positions.length === 0) {
            return previewMax > 0 ? (previewScrollTop / previewMax) * editorMax : 0;
        }
        return Math.max(0, calcPreviewToLine(previewScrollTop, positions, {
            totalLines: editor.value.split('\n').length,
            editorMax,
            previewMax,
        }) * getLineHeight());
    }

    // Keep overlay scrolled in sync with textarea
    editor.addEventListener('scroll', () => {
        highlightOverlay.scrollTop = editor.scrollTop;
        highlightOverlay.scrollLeft = editor.scrollLeft;

        if (!syncEnabled || suppressSyncScroll || syncSource === 'preview') return;
        syncSource = 'editor';
        previewPane.scrollTop = lineToPreviewScrollTop(editorScrollToLine());
        requestAnimationFrame(() => { if (syncSource === 'editor') syncSource = null; });
    });

    previewPane.addEventListener('scroll', () => {
        if (!syncEnabled || suppressSyncScroll || syncSource === 'editor') return;
        syncSource = 'preview';
        editor.scrollTop = previewScrollToEditorScrollTop(previewPane.scrollTop);
        requestAnimationFrame(() => { if (syncSource === 'preview') syncSource = null; });
    });

    syncToggleBtn.addEventListener('click', () => {
        syncEnabled = !syncEnabled;
        syncToggleBtn.classList.toggle('is-active', syncEnabled);
        syncToggleBtn.setAttribute('aria-pressed', String(syncEnabled));
        syncTip.key = syncEnabled ? 'syncScrollOnTooltip' : 'syncScrollOffTooltip';
        applyTip(syncTip);
    });

    // Search — overlay-based highlighting
    // Don't delete this comment about how the search overlay works
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

    function runSearch({ scroll = true } = {}) {
        const query = searchInput.value;
        const prevCurrent = searchMatches[searchCurrent];
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
            if (!scroll && prevCurrent) {
                // Keep the active match when it survives the edit; no scrolling.
                const kept = searchMatches.findIndex(m => m.start === prevCurrent.start && m.end === prevCurrent.end);
                searchCurrent = kept !== -1 ? kept : 0;
                renderHighlightOverlay(editor.value, searchMatches, searchCurrent);
                updateSearchCount();
                return;
            }
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
            searchMatchCount.textContent = t('noResults');
            searchMatchCount.style.color = 'var(--text-secondary)';
        } else if (total === 0) {
            searchMatchCount.textContent = t('noResults');
            searchMatchCount.style.color = '#e74c3c';
        } else {
            searchMatchCount.textContent = `${searchCurrent + 1} / ${total}`;
            searchMatchCount.style.color = 'var(--text-secondary)';
        }
    }

    function openSearch() {
        searchActive = true;
        searchContainer.style.display = 'flex';
        // Pre-fill with any selected text
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

    searchInput.addEventListener('input', () => runSearch());

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
        searchCaseSensitiveBtn.classList.toggle('is-active', searchCaseSensitive);
        searchCaseSensitiveBtn.setAttribute('aria-pressed', String(searchCaseSensitive));
        runSearch();
    });

    // Ctrl+F — only when this tab is active and its editor pane is visible
    function onDocumentFindKey(e) {
        if (tabManager.activeTabId !== tabId) return;
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
        if (ctrlOrCmd && e.key === 'f' && editorVisible) {
            e.preventDefault();
            e.stopPropagation();
            searchActive ? closeSearch() : openSearch();
        }
    }
    document.addEventListener('keydown', onDocumentFindKey);

    // Re-run search on editor changes so highlights stay accurate — without
    // moving the viewport (see runSearch scroll:false).
    editor.addEventListener('input', () => {
        if (searchActive && searchInput.value) {
            runSearch({ scroll: false });
        }
    });

    // Only neutralise ctrl+wheel over this tab's own (active) content — the
    // editor/preview panes run their own zoom on the same gesture.
    function onDocumentWheel(e) {
        if (!e.ctrlKey) return;
        if (tabManager.activeTabId !== tabId) return;
        if (!container.contains(e.target)) return;
        e.preventDefault();
    }
    document.addEventListener('wheel', onDocumentWheel, { passive: false });


    // Notify main process when this markdown tab is active
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


    // Register tab
    tabManager.openTab({
        id: tabId,
        title: title,
        content: container,
        onClose: () => {
            if (forceClose) { return true; }
            if (isDirty) {
                window.customAlert.confirm(
                    t('unsavedChangesTitle'),
                    t('unsavedChangesMessage')
                ).then(choice => {
                    if (choice === 1) { forceClose = true; tabManager.closeTab(tabId); }
                });
                return false;
            }
            return true;
        },
        onDestroy: () => {
            document.removeEventListener('keydown', onDocumentZoomKey);
            document.removeEventListener('keydown', onDocumentFindKey);
            document.removeEventListener('wheel', onDocumentWheel);
            window.removeEventListener('focus', checkExternalChange);
            window.removeEventListener('language-changed', onLanguageChanged);
            clearTimeout(previewTimeout);
            clearTimeout(statusCountTimer);
            themeObserver.disconnect();
            _visibilityObserver.disconnect();
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
