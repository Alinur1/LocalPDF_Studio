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

// src/renderer/utils/markdown/visualMap.mjs

// Approximate tab stops (CSS `tab-size: 4`); canvas has no tab concept.
export function expandTabs(line, tabSize = 4) {
    return line.replace(/\t/g, ' '.repeat(tabSize));
}

// widths: px per logical line. Returns prefix structure for O(1) lookups.
export function computeRowMap(widths, wrapWidth) {
    const safeWrap = Math.max(1, wrapWidth);
    const rows = widths.map(w => Math.max(1, Math.ceil(w / safeWrap)));
    const lineStartRow = new Array(rows.length);
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
        lineStartRow[i] = total;
        total += rows[i];
    }
    return { rows, lineStartRow, totalRows: total, totalLines: rows.length };
}

// Visual row (fractional allowed) → logical line, clamped.
export function rowToLineIndex(rowMap, row) {
    if (!rowMap || rowMap.totalLines === 0) return 0;
    const r = Math.max(0, Math.min(rowMap.totalRows - 1, Math.floor(row)));
    // Binary search over prefix sums.
    let lo = 0, hi = rowMap.totalLines - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (rowMap.lineStartRow[mid] <= r) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

// Logical line → its first visual row, clamped.
export function lineToRowIndex(rowMap, line) {
    if (!rowMap || rowMap.totalLines === 0) return 0;
    const l = Math.max(0, Math.min(rowMap.totalLines - 1, Math.round(line)));
    return rowMap.lineStartRow[l];
}
