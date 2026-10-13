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

// src/renderer/utils/markdown/render.mjs

import { hasUriScheme, isWindowsAbsolutePath, toFileUrl, buildFileBaseUrl, resolveRelativeSrc } from './imageUrl.mjs';

export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function sanitizeMarkdownHtml(dirtyHtml) {
    if (window.DOMPurify?.sanitize) {
        return window.DOMPurify.sanitize(dirtyHtml, {
            // Defense in depth for the PDF-export engine, which renders
            // this HTML in a second BrowserWindow.
            FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed',
                'form', 'input', 'button', 'textarea', 'select', 'option',
                'link', 'meta', 'base', 'title', 'noscript', 'template'],
            // file: is required for resolved local images; everything
            // else dangerous (javascript:, data:text/html, vbscript:) is
            // rejected by this allowlist.
            ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        });
    }
    return `<pre><code>${escapeHtml(dirtyHtml)}</code></pre>`;
}

export function renderMarkdownToHtml(markdownText) {
    let rawHtml;
    if (window.marked) {
        rawHtml = window.marked.parse(markdownText, { gfm: true, breaks: true });
    } else {
        // marked failed to load — show source as escaped text, never raw HTML.
        rawHtml = `<pre><code>${escapeHtml(markdownText)}</code></pre>`;
    }
    return sanitizeMarkdownHtml(rawHtml);
}

// DOM walk over real <img> elements only. Regex surgery on serialized HTML
// rewrote img-like text inside <code> samples; this cannot.
export function resolvePreviewImages(root, mdFilePath) {
    const baseUrl = buildFileBaseUrl(mdFilePath);
    if (!baseUrl) return;
    root.querySelectorAll('img[src]').forEach((img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('#')) return;
        // Absolute Windows paths are local files, not URIs.
        if (isWindowsAbsolutePath(src)) {
            img.setAttribute('src', toFileUrl(src));
            return;
        }
        if (hasUriScheme(src)) return; // absolute URI scheme: leave alone
        img.setAttribute('src', resolveRelativeSrc(src, baseUrl));
    });
}
