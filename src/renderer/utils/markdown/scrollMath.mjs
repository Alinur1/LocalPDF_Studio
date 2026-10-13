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

// src/renderer/utils/markdown/scrollMath.mjs

// Positions are [{ line, top }] with optional { end, height } for long
// blocks (code fences, lists): targets INSIDE a block interpolate within
// it instead of pinning to its top (Phase 6 follow-up).
export function lineToPreviewScrollTop(targetLine, positions, metrics) {
    const { totalLines, editorScrollTop, editorMax, previewMax } = metrics;
    if (positions.length === 0) {
        return editorMax > 0 ? (editorScrollTop / editorMax) * previewMax : 0;
    }
    let before = null, after = null;
    for (const pos of positions) {
        if (pos.line <= targetLine) before = pos;
        else { after = pos; break; }
    }
    if (!before) {
        const first = positions[0];
        return first.line > 0 ? Math.min(targetLine / first.line, 1) * first.top : 0;
    }
    // Inside a measured block: interpolate within it.
    const beforeEnd = before.end ?? before.line;
    const beforeHeight = before.height ?? 0;
    if (targetLine <= beforeEnd && beforeHeight > 0 && beforeEnd > before.line) {
        const frac = (targetLine - before.line) / (beforeEnd - before.line);
        return before.top + frac * beforeHeight;
    }
    if (!after) {
        const tail = totalLines > before.line ? (targetLine - before.line) / (totalLines - before.line) : 0;
        return before.top + tail * (previewMax - before.top);
    }
    const fraction = after.line > before.line ? (targetLine - before.line) / (after.line - before.line) : 0;
    return before.top + fraction * (after.top - before.top);
}

// Preview scrollTop (px) → editor source line (caller multiplies by lineHeight)
export function previewScrollToEditorLine(previewScrollTop, positions, metrics) {
    const { totalLines, editorMax, previewMax } = metrics;
    if (positions.length === 0) {
        return previewMax > 0 ? (previewScrollTop / previewMax) * editorMax : 0;
    }
    let before = null, after = null;
    for (const pos of positions) {
        if (pos.top <= previewScrollTop) before = pos;
        else { after = pos; break; }
    }
    if (!before) {
        const first = positions[0];
        return first.top > 0 ? (previewScrollTop / first.top) * first.line : 0;
    }
    // Inside a measured block: interpolate within it.
    const beforeEnd = before.end ?? before.line;
    const beforeHeight = before.height ?? 0;
    if (beforeHeight > 0 && previewScrollTop <= before.top + beforeHeight && beforeEnd > before.line) {
        const frac = (previewScrollTop - before.top) / beforeHeight;
        return before.line + frac * (beforeEnd - before.line);
    }
    if (!after) {
        const tail = previewMax > before.top ? (previewScrollTop - before.top) / (previewMax - before.top) : 0;
        return before.line + tail * (totalLines - before.line);
    }
    const fraction = after.top > before.top ? (previewScrollTop - before.top) / (after.top - before.top) : 0;
    return before.line + fraction * (after.line - before.line);
}
