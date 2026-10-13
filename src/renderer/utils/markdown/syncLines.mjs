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

// src/renderer/utils/markdown/syncLines.mjs

// Block tokens that produce no rendered element.
const SILENT_TYPES = new Set(['space']);

export function topLevelTokens(markedApi, markdownText) {
    if (!markedApi || typeof markedApi.lexer !== 'function') return null;
    try {
        const tokens = markedApi.lexer(markdownText);
        if (!Array.isArray(tokens)) return null;
        return tokens.filter(t => t && !SILENT_TYPES.has(t.type));
    } catch {
        return null;
    }
}

// Start line (0-based) of each token via one progressive source scan.
// Duplicate identical blocks resolve in order because the cursor only moves
// forward. Tokens without usable raw text reuse the cursor position.
export function computeTokenLines(markdownText, tokens) {
    const lines = [];
    let cursor = 0;
    for (const token of tokens) {
        const raw = (token && typeof token.raw === 'string' && token.raw) ? token.raw : '';
        let idx = -1;
        if (raw) {
            idx = markdownText.indexOf(raw, cursor);
            if (idx !== -1) cursor = idx + raw.length;
        }
        if (idx === -1) idx = cursor;
        let startLine = 0;
        for (let i = 0; i < idx; i++) {
            if (markdownText[i] === '\n') startLine++;
        }
        lines.push(startLine);
    }
    return lines;
}

// Pairing guard: raw-HTML tokens can render several elements (or none),
// which would shift index pairing. Past this mismatch ratio we assign
// nothing and let proportional fallback take over.
const MAX_MISMATCH_RATIO = 0.3;

export function assignSyncLines(markdownText, root, markedApi) {
    const tokens = topLevelTokens(markedApi, markdownText);
    if (!tokens || tokens.length === 0) return 0;
    const elements = Array.from(root.querySelectorAll(':scope > *'));
    if (elements.length === 0) return 0;
    if (Math.abs(elements.length - tokens.length) / tokens.length > MAX_MISMATCH_RATIO) return 0;

    const lines = computeTokenLines(markdownText, tokens);
    let prev = 0;
    let assigned = 0;
    for (let i = 0; i < elements.length && i < lines.length; i++) {
        // Enforce monotonicity so one bad token can't invert the map.
        const line = Math.max(lines[i], prev);
        elements[i].dataset.syncLine = line;
        prev = line;
        assigned++;
    }
    return assigned;
}
