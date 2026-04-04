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


// src/renderer/tools/pdfToMarkdown/pdfToMarkdown.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import customAlert from '../../utils/customAlert.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from '../../utils/loading.js';
import tesseractOcr from '../../utils/tesseractOcr.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

// ── Constants ──────────────────────────────────────────────────────────────
const LINE_Y_TOLERANCE_FACTOR = 0.55;
const H1_RATIO  = 1.5;
const H2_RATIO  = 1.2;
const H3_RATIO  = 1.08;
// Table detection: minimum meaningful column gap as a fraction of page width
const TABLE_COL_GAP_MIN = 0.06;   // 6% of page width between columns
const TABLE_COL_ALIGN_TOL = 8;    // px: x-position tolerance for column alignment
const TABLE_MIN_ROWS = 2;
const TABLE_MIN_COLS = 2;

// ── Font helpers ───────────────────────────────────────────────────────────

function getFontSize(transform) {
    const sy = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]);
    return sy > 0 ? sy : Math.abs(transform[0]);
}

function getFontStyle(fontName) {
    const fn = (fontName || '').toLowerCase();
    return {
        bold:  /bold|heavy|black|demi|semibold/.test(fn),
        italic: /italic|oblique|slant/.test(fn),
        mono:  /mono|courier|consol|typewriter|code|fixed|letter/.test(fn)
    };
}

// ── Calibration ────────────────────────────────────────────────────────────

function computeBaseFontSize(samples) {
    if (samples.length === 0) return 12;
    const freq = {};
    for (const { size, len } of samples) {
        const key = (Math.round(size * 2) / 2).toFixed(1);
        freq[key] = (freq[key] || 0) + len;
    }
    const [bestKey] = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    return bestKey ? parseFloat(bestKey) : 12;
}

// ── Markdown escaping ──────────────────────────────────────────────────────
// Only escape characters that would actually alter rendering in body text.
// Periods, parens, hyphens etc. are safe inside paragraphs.
function escapeInline(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/`/g, '\\`')
        .replace(/\[/g, '\\[')
        .replace(/\|/g, '\\|');
}

function wrapFormatting(str, bold, italic, mono) {
    if (!str) return '';
    if (mono)          return '`' + str + '`';
    const s = escapeInline(str);
    if (bold && italic) return '***' + s + '***';
    if (bold)           return '**' + s + '**';
    if (italic)         return '*' + s + '*';
    return s;
}

// ── Item enrichment ────────────────────────────────────────────────────────

function enrichItem(raw) {
    return {
        str:      raw.str || '',
        x:        raw.transform[4],
        y:        raw.transform[5],
        width:    raw.width  || 0,
        height:   raw.height || 0,
        fontSize: getFontSize(raw.transform),
        fontName: raw.fontName || '',
        style:    getFontStyle(raw.fontName),
        hasEOL:   raw.hasEOL || false
    };
}

// ── Line grouping ──────────────────────────────────────────────────────────

function groupIntoLines(items) {
    if (items.length === 0) return [];

    // Sort top-to-bottom (PDF y is baseline, increases upward → sort descending)
    const sorted = [...items].sort((a, b) => {
        const dy = b.y - a.y;
        if (Math.abs(dy) > 1) return dy;
        return a.x - b.x;
    });

    const lines = [];
    let cur = [sorted[0]];
    let baseY = sorted[0].y;
    let lineH  = Math.max(sorted[0].fontSize, 6);

    for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i];
        const tol  = Math.max(lineH, item.fontSize, 6) * LINE_Y_TOLERANCE_FACTOR;
        if (Math.abs(item.y - baseY) <= tol) {
            cur.push(item);
        } else {
            lines.push(cur.slice().sort((a, b) => a.x - b.x));
            cur    = [item];
            baseY  = item.y;
            lineH  = Math.max(item.fontSize, 6);
        }
    }
    if (cur.length) lines.push(cur.sort((a, b) => a.x - b.x));
    return lines;
}

// ── Inter-item spacing ─────────────────────────────────────────────────────
// PDF text items may omit space characters; infer spaces from the gap
// between (x + width) of the previous item and x of the current item.

function joinItems(line, detectFmt) {
    if (line.length === 0) return '';

    let result = '';
    let prevEndX = null;

    for (const item of line) {
        if (!item.str) continue;

        const text = detectFmt
            ? wrapFormatting(item.str, item.style.bold, item.style.italic, item.style.mono)
            : escapeInline(item.str);

        if (prevEndX !== null) {
            const gap = item.x - prevEndX;
            // A word space is roughly 0.25–0.35 × fontSize wide.
            // If the gap is positive and no space already at the boundary, inject one.
            const minSpaceGap = Math.max(item.fontSize * 0.2, 2);
            const needsSpace  = gap >= minSpaceGap
                && !result.endsWith(' ')
                && !text.startsWith(' ');
            if (needsSpace) result += ' ';
        }

        result += text;
        prevEndX = item.x + item.width;
    }
    return result.trim();
}

// ── Table detection ────────────────────────────────────────────────────────
// Strategy: a table row must have items spread across at least TABLE_MIN_COLS
// distinct column bands with meaningful gaps (≥ TABLE_COL_GAP_MIN × pageWidth).
// At least TABLE_MIN_ROWS such rows with matching column positions = a table.

function buildColumnBands(line, pageWidth) {
    const items = line.filter(i => i.str.trim());
    if (items.length < TABLE_MIN_COLS) return null;

    const gapMin = pageWidth * TABLE_COL_GAP_MIN;
    const bands  = [{ x: items[0].x, end: items[0].x + items[0].width }];

    for (let i = 1; i < items.length; i++) {
        const gap = items[i].x - bands[bands.length - 1].end;
        if (gap >= gapMin) {
            bands.push({ x: items[i].x, end: items[i].x + items[i].width });
        } else {
            bands[bands.length - 1].end = Math.max(
                bands[bands.length - 1].end, items[i].x + items[i].width
            );
        }
    }
    return bands.length >= TABLE_MIN_COLS ? bands : null;
}

function bandsMatch(a, b) {
    if (!a || !b) return false;
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    let matches  = 0;
    for (let i = 0; i < minLen; i++) {
        if (Math.abs(a[i].x - b[i].x) <= TABLE_COL_ALIGN_TOL) matches++;
    }
    return matches / maxLen >= 0.6;
}

function detectTables(lines, pageWidth) {
    const tables = [];
    const bandSigs = lines.map(l => buildColumnBands(l, pageWidth));

    let start = -1;
    let prevBands = null;

    const flush = (end) => {
        if (start !== -1 && end - start + 1 >= TABLE_MIN_ROWS) {
            tables.push({ startLine: start, endLine: end });
        }
        start = -1; prevBands = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const bands = bandSigs[i];
        if (!bands) { flush(i - 1); continue; }

        if (prevBands && bandsMatch(prevBands, bands)) {
            if (start === -1) start = i - 1;
            prevBands = bands;
        } else {
            flush(i - 1);
            prevBands = bands;
        }
    }
    flush(lines.length - 1);
    return tables;
}

// ── Table renderer ─────────────────────────────────────────────────────────

function renderTable(lines, tbl, pageWidth) {
    const tblLines = lines.slice(tbl.startLine, tbl.endLine + 1);

    // Derive unified column positions (leftmost x of each band)
    const allBands = tblLines
        .map(l => buildColumnBands(l, pageWidth))
        .filter(Boolean);
    if (!allBands.length) return '';

    // Merge band starts into global columns
    const allXs = allBands.flatMap(b => b.map(band => band.x));
    const colXs  = clusterValues(allXs, TABLE_COL_ALIGN_TOL * 2);
    const numCols = colXs.length;

    const rows = tblLines.map(line => {
        const row = Array(numCols).fill('');
        const items = line.filter(i => i.str.trim());
        for (const item of items) {
            // Find the closest column
            let best = 0, bestDist = Infinity;
            for (let c = 0; c < colXs.length; c++) {
                const d = Math.abs(item.x - colXs[c]);
                if (d < bestDist) { bestDist = d; best = c; }
            }
            const sep = row[best] ? ' ' : '';
            row[best] += sep + item.str.trim().replace(/\|/g, '\\|');
        }
        return row;
    });

    if (!rows.length) return '';
    const fmtRow = r => '| ' + r.join(' | ') + ' |';
    const header = rows[0];
    const sep    = header.map(() => '---');
    return [fmtRow(header), fmtRow(sep), ...rows.slice(1).map(fmtRow)].join('\n');
}

function clusterValues(vals, tol) {
    if (!vals.length) return [];
    const sorted = [...new Set(vals.map(v => Math.round(v)))].sort((a, b) => a - b);
    const clusters = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - clusters[clusters.length - 1][0] <= tol) {
            clusters[clusters.length - 1].push(sorted[i]);
        } else {
            clusters.push([sorted[i]]);
        }
    }
    return clusters.map(c => Math.min(...c));
}

// ── List detection ─────────────────────────────────────────────────────────
// Bullet: explicit bullet characters.
// Ordered: numeric (1. 1) 1/) (1) …), Roman numeral (i. i) ii. ii) (i) …),
//          or single-letter (a. a) b. b) (a) …).

const BULLET_RE = /^(?<marker>[•●○◦▪▸▹·*+])(?=\s|\S|$)/;

// Ordered markers detected:
//   • numeric:       1.  1)  1/  1.)  (1)
//   • Roman numeral: i.  i)  ii.  iv)  (i)  (iv)
//   • single letter: a.  a)  b.  b)  a.)  (a)
const ORDERED_RE = /^(?<marker>(?:\((?:\d+|[ivxlcdmIVXLCDM]{1,6}|[a-zA-Z])\)|(?:\d+|[ivxlcdmIVXLCDM]{1,6}|[a-zA-Z])(?:\.\)|[.)\/])))/;

function buildListProbeText(line, maxItems = 4, maxChars = 24) {
    let text = '';
    let seenText = false;

    for (const item of line) {
        let piece = item.str || '';
        if (!seenText) {
            piece = piece.trimStart();
            if (!piece) continue;
            seenText = true;
        }
        if (!piece) continue;

        text += piece;
        if (text.length >= maxChars) break;
        if (--maxItems <= 0) break;
    }

    return text;
}

function stripLeadingMarker(line, markerLen) {
    const rest = [];
    let remaining = markerLen;
    let seenText = false;

    for (const item of line) {
        let str = item.str || '';
        if (!seenText) {
            str = str.trimStart();
            if (!str) continue;
            seenText = true;
        }

        if (remaining > 0) {
            if (remaining >= str.length) {
                remaining -= str.length;
                continue;
            }
            str = str.slice(remaining);
            remaining = 0;
        }

        if (str) rest.push({ ...item, str });
    }

    return rest;
}

function getListPrefix(listInfo) {
    if (listInfo.type === 'ul') return '- ';
    if (/^\d/.test(listInfo.marker)) return '1. ';
    if (/^\(\d+\)$/.test(listInfo.marker)) return '- ' + listInfo.marker + ' ';
    return '- ' + listInfo.marker + ' ';
}

function getMarkerBody(marker) {
    return marker
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .replace(/[.)\/]+$/g, '')
        .toLowerCase();
}

function isRomanBody(body) {
    return /^[ivxlcdm]+$/i.test(body);
}

function getListKind(listInfo) {
    if (listInfo.type === 'ul') return 'bullet';
    const body = getMarkerBody(listInfo.marker);
    if (/^\d+$/.test(body)) return 'numeric';
    if (body.length === 1 && /^[a-z]$/i.test(body)) return 'ambiguous';
    if (isRomanBody(body)) return 'roman';
    return 'alpha';
}

function detectList(line) {
    if (!line.length) return null;
    const str = buildListProbeText(line);
    if (!str) return null;

    const bm = str.match(BULLET_RE);
    if (bm) return { type: 'ul', marker: bm.groups?.marker || bm[0], matchLen: bm[0].length };

    if (str.startsWith('-')) {
        const first = (line[0]?.str || '').trimStart();
        if (first === '-' || first === '- ' || first.startsWith('-\t')) {
            return { type: 'ul', marker: '-', matchLen: 1 };
        }
    }

    const om = str.match(ORDERED_RE);
    if (om) return { type: 'ol', marker: om.groups?.marker || om[0], matchLen: om[0].length };

    return null;
}

// ── Line → element ─────────────────────────────────────────────────────────

function lineToElement(line, baseFontSize, pageLeftMargin, detectFmt, detectHeadings) {
    if (!line.length) return { type: 'empty' };

    const text = joinItems(line, detectFmt);
    if (!text.trim()) return { type: 'empty' };

    // Dominant font size (weighted by character count)
    let totalChars = 0, weightedSz = 0;
    for (const item of line) {
        const l = item.str.length;
        totalChars += l;
        weightedSz += item.fontSize * l;
    }
    const domSz = totalChars > 0 ? weightedSz / totalChars : baseFontSize;

    // Heading detection
    if (detectHeadings && baseFontSize > 0) {
        const ratio = domSz / baseFontSize;
        if (ratio >= H1_RATIO) return { type: 'h1', text };
        if (ratio >= H2_RATIO) return { type: 'h2', text };
        if (ratio >= H3_RATIO) return { type: 'h3', text };
    }

    // List detection
    const listInfo = detectList(line);
    if (listInfo) {
        const restLine = stripLeadingMarker(line, listInfo.matchLen);
        const content = restLine.length ? joinItems(restLine, detectFmt) : '';
        const prefix = getListPrefix(listInfo);
        return {
            type: 'list',
            text: content.trim(),
            prefix,
            marker: listInfo.marker,
            listKind: getListKind(listInfo),
            x: line[0]?.x || 0,
            contentX: restLine[0]?.x || line[0]?.x || 0
        };
    }

    return {
        type:     'paragraph',
        text,
        x:        line[0]?.x || 0,
        y:        line[0]?.y || 0,
        fontSize: domSz
    };
}

// ── Paragraph healing ──────────────────────────────────────────────────────
// Rejoin lines broken by PDF right-margin wrapping.
// Heuristic: previous line doesn't end with sentence-final punctuation
// AND the next line starts with a lowercase letter → merge.

const SENTENCE_END_RE    = /[.!?:;…""')\]>]$/;
const STARTS_LOWERCASE_RE = /^[a-z]/;
const STARTS_CONTINUATION_RE = /^[A-Za-z0-9("'`]/;

function joinBrokenWord(prevText, nextText) {
    if (!prevText.endsWith('-')) return null;
    if (!/^[a-z]/.test(nextText)) return null;
    return prevText.slice(0, -1) + nextText;
}

function healParagraphs(elements) {
    const out = [];
    for (const el of elements) {
        if (el.type !== 'paragraph') { out.push(el); continue; }

        const prev = out[out.length - 1];
        const hyphenJoin = prev ? joinBrokenWord(prev.text, el.text) : null;
        if (hyphenJoin) {
            prev.text = hyphenJoin;
            continue;
        }

        if (
            prev?.type === 'list' &&
            STARTS_CONTINUATION_RE.test(el.text) &&
            (
                STARTS_LOWERCASE_RE.test(el.text) ||
                el.x >= (prev.contentX || prev.x || 0) - 12 ||
                !SENTENCE_END_RE.test(prev.text)
            )
        ) {
            const joiner = prev.text.endsWith('-') ? '' : ' ';
            prev.text = prev.text.endsWith('-')
                ? prev.text.slice(0, -1) + el.text
                : prev.text + joiner + el.text;
            continue;
        }

        if (
            prev?.type === 'paragraph' &&
            !SENTENCE_END_RE.test(prev.text) &&
            STARTS_LOWERCASE_RE.test(el.text)
        ) {
            // Merge: don't add a redundant space if prev ends with one
            const joiner = prev.text.endsWith(' ') ? '' : ' ';
            prev.text += joiner + el.text;
        } else {
            out.push({ ...el });
        }
    }
    return out;
}

function normalizeEdgeLine(str) {
    return str.replace(/\s+/g, ' ').trim();
}

function removeRepeatedEdgeArtifacts(pageParts) {
    const firstCounts = new Map();
    const lastCounts = new Map();

    for (const part of pageParts) {
        const lines = part.split('\n').filter(line => line.trim());
        if (!lines.length) continue;
        const first = normalizeEdgeLine(lines[0]);
        const last = normalizeEdgeLine(lines[lines.length - 1]);
        firstCounts.set(first, (firstCounts.get(first) || 0) + 1);
        lastCounts.set(last, (lastCounts.get(last) || 0) + 1);
    }

    return pageParts.map((part, index) => {
        const lines = part.split('\n');

        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

        if (lines.length) {
            const first = normalizeEdgeLine(lines[0]);
            if (firstCounts.get(first) > 1) lines.shift();
        }

        if (lines.length) {
            const last = normalizeEdgeLine(lines[lines.length - 1]);
            const expectedPageNumber = String(index + 1);
            if (last === expectedPageNumber || lastCounts.get(last) > 1) lines.pop();
        }

        return lines.join('\n').trim();
    }).filter(Boolean);
}

// ── Element renderer ───────────────────────────────────────────────────────

function romanToInt(str) {
    const vals = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    let total = 0;
    let prev = 0;
    for (let i = str.length - 1; i >= 0; i--) {
        const cur = vals[str[i].toLowerCase()] || 0;
        total += cur < prev ? -cur : cur;
        prev = cur;
    }
    return total;
}

function markerOrderValue(el, resolvedKind) {
    const body = getMarkerBody(el.marker || '');
    if (!body) return null;
    if (resolvedKind === 'numeric' && /^\d+$/.test(body)) return parseInt(body, 10);
    if (resolvedKind === 'alpha' && /^[a-z]$/i.test(body)) return body.toLowerCase().charCodeAt(0) - 96;
    if (resolvedKind === 'roman' && isRomanBody(body)) return romanToInt(body);
    return null;
}

function chooseResolvedKind(el, parentEntry, sameLevelEntry) {
    if (el.listKind !== 'ambiguous') return el.listKind;
    if (sameLevelEntry?.resolvedKind === 'alpha') return 'alpha';
    if (sameLevelEntry?.resolvedKind === 'roman') return 'roman';
    if (parentEntry?.resolvedKind === 'alpha') return 'roman';
    return 'alpha';
}

function findMatchingDepth(stack, el) {
    for (let depth = stack.length - 1; depth >= 0; depth--) {
        const entry = stack[depth];
        if (!entry) continue;

        if (entry.resolvedKind === 'alpha' && (el.listKind === 'alpha' || el.listKind === 'ambiguous')) {
            return depth;
        }
        if (entry.resolvedKind === 'numeric' && el.listKind === 'numeric') {
            return depth;
        }
        if (entry.resolvedKind === 'roman' && (el.listKind === 'roman' || el.listKind === 'ambiguous')) {
            return depth;
        }
    }
    return null;
}

function resolveListDepth(el, stack, prevList) {
    if (!stack.length) {
        return { depth: 0, resolvedKind: chooseResolvedKind(el, null, null) };
    }

    let depth = stack.length - 1;
    while (depth > 0 && el.x < stack[depth].x - 6) depth--;

    const top = stack[depth];
    if (top && el.x > (top.contentX || top.x) + 8) {
        const resolvedKind = chooseResolvedKind(el, top, null);
        return { depth: depth + 1, resolvedKind };
    }

    const matchingDepth = findMatchingDepth(stack, el);
    if (matchingDepth !== null) {
        const sameLevelEntry = stack[matchingDepth];
        const resolvedKind = chooseResolvedKind(el, stack[matchingDepth - 1], sameLevelEntry);
        return { depth: matchingDepth, resolvedKind };
    }

    if (
        prevList?.resolvedKind === 'alpha' &&
        (el.listKind === 'roman' || el.listKind === 'ambiguous')
    ) {
        const resolvedKind = chooseResolvedKind(el, prevList, null);
        return { depth: prevList.depth + 1, resolvedKind };
    }

    return { depth: 0, resolvedKind: chooseResolvedKind(el, null, stack[0]) };
}

function renderElements(elements) {
    const lines = [];
    let prevType = null;
    const listStack = [];
    let prevList = null;

    for (const el of elements) {
        switch (el.type) {
            case 'h1':
                if (prevType) lines.push('');
                lines.push('# ' + el.text);
                listStack.length = 0;
                prevList = null;
                break;
            case 'h2':
                if (prevType) lines.push('');
                lines.push('## ' + el.text);
                listStack.length = 0;
                prevList = null;
                break;
            case 'h3':
                if (prevType) lines.push('');
                lines.push('### ' + el.text);
                listStack.length = 0;
                prevList = null;
                break;
            case 'list': {
                const { depth, resolvedKind } = resolveListDepth(el, listStack, prevList);
                const indent = '  '.repeat(depth);
                lines.push(indent + el.prefix + el.text);
                const rendered = { ...el, depth, resolvedKind, orderValue: markerOrderValue(el, resolvedKind) };
                listStack.length = depth;
                listStack[depth] = rendered;
                prevList = rendered;
                break;
            }
            case 'paragraph':
                if (prevType && prevType !== 'paragraph') lines.push('');
                lines.push(el.text);
                if (prevType !== 'list') {
                    listStack.length = 0;
                    prevList = null;
                }
                break;
            case 'table':
                if (prevType) lines.push('');
                lines.push(el.text);
                listStack.length = 0;
                prevList = null;
                break;
        }
        prevType = el.type;
    }
    return lines.join('\n');
}

// ── OCR fallback ────────────────────────────────────────────────────────────

async function ocrFallback(page) {
    const scale    = 2.5;
    const viewport = page.getViewport({ scale });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx      = canvas.getContext('2d');
    ctx.fillStyle  = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    try {
        await tesseractOcr.initialize('eng');
        const results = await tesseractOcr.processCanvasBatch([canvas], 0);
        if (results?.[0]?.success) return (results[0].text || '').trim();
    } catch (e) {
        console.warn('OCR fallback error:', e);
    }
    return '';
}

// ── Main converter ─────────────────────────────────────────────────────────

export const DEFAULT_PDF_TO_MARKDOWN_OPTIONS = {
    detectHeadings: true,
    detectTables: true,
    detectFormatting: true,
    includeImages: true,
    ocrFallback: false,
    healParagraphs: true
};

export async function convertPdfToMarkdown(filePath, options = {}, onProgress) {
    const mergedOptions = {
        ...DEFAULT_PDF_TO_MARKDOWN_OPTIONS,
        ...options
    };
    const progress = (pct, msg) => onProgress?.(pct, msg);

    progress(3, 'Loading PDF…');
    const pdfDoc   = await pdfjsLib.getDocument(`file://${filePath}`).promise;
    const numPages = pdfDoc.numPages;

    // Pass 1: calibrate base font size
    progress(8, 'Calibrating font sizes…');
    const samples = [];
    for (let p = 1; p <= numPages; p++) {
        const page    = await pdfDoc.getPage(p);
        const content = await page.getTextContent();
        for (const item of content.items) {
            if (!item.str?.trim()) continue;
            const sz = getFontSize(item.transform);
            if (sz > 0) samples.push({ size: sz, len: item.str.length });
        }
    }
    const baseFontSize = computeBaseFontSize(samples);

    // Optional image extraction
    let imagesByPage = {};
    if (mergedOptions.includeImages) {
        progress(12, 'Extracting images…');
        try {
            const res = await window.electronAPI.extractPdfImages(filePath);
            if (res?.success) {
                for (const img of res.images) {
                    (imagesByPage[img.pageNum] ||= []).push(img);
                }
            }
        } catch (e) {
            console.warn('Image extraction skipped:', e.message);
        }
    }

    // Pass 2: convert pages
    const parts = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pct = 15 + Math.round(((pageNum - 1) / numPages) * 80);
        progress(pct, `Page ${pageNum} of ${numPages}…`);

        const page     = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const content  = await page.getTextContent();
        const rawItems = content.items.filter(i => i.str?.trim());

        // OCR on scanned pages
        if (mergedOptions.ocrFallback && rawItems.length < 5) {
            progress(pct, `Page ${pageNum}: scanned — running OCR…`);
            const ocrText = await ocrFallback(page);
            if (ocrText) parts.push(ocrText);
            continue;
        }

        const items         = rawItems.map(enrichItem);
        const pageWidth     = viewport.width;
        const pageLeftMargin = Math.min(...items.map(i => i.x));
        const lines          = groupIntoLines(items);

        // Detect tables
        const tableRegions = mergedOptions.detectTables ? detectTables(lines, pageWidth) : [];
        const tableLineSet  = new Set();
        for (const t of tableRegions) {
            for (let li = t.startLine; li <= t.endLine; li++) tableLineSet.add(li);
        }

        // Build elements list
        const elements  = [];
        let tableIdx    = 0;

        for (let li = 0; li < lines.length; li++) {
            // Check if a table starts at this line
            while (tableIdx < tableRegions.length && tableRegions[tableIdx].startLine === li) {
                const t   = tableRegions[tableIdx];
                const tmd = renderTable(lines, t, pageWidth);
                if (tmd) elements.push({ type: 'table', text: tmd });
                li = t.endLine;
                tableIdx++;
                break;
            }
            if (tableLineSet.has(li)) continue;

            const el = lineToElement(
                lines[li], baseFontSize, pageLeftMargin,
                mergedOptions.detectFormatting, mergedOptions.detectHeadings
            );
            if (el.type !== 'empty') elements.push(el);
        }

        const final = mergedOptions.healParagraphs ? healParagraphs(elements) : elements;
        const pageMd = renderElements(final);
        if (pageMd.trim()) parts.push(pageMd);

        // Append images
        if (mergedOptions.includeImages && imagesByPage[pageNum]) {
            imagesByPage[pageNum].forEach((img, idx) => {
                parts.push(`\n![Figure ${idx + 1}](data:${img.mimeType};base64,${img.data})\n`);
            });
        }
    }

    await pdfDoc.destroy();
    progress(98, 'Assembling document…');
    return removeRepeatedEdgeArtifacts(parts).join('\n\n');
}

export async function convertPdfToMarkdownWithFallback(filePath, options = {}, onProgress) {
    try {
        if (window.electronAPI?.convertPdfToMarkdown) {
            const result = await window.electronAPI.convertPdfToMarkdown(filePath, options);
            if (result?.success && result.markdown?.trim()) {
                return {
                    markdown: result.markdown,
                    assets: result.assets || [],
                    engine: result.engine || 'python'
                };
            }
            if (result?.error) {
                throw new Error(result.error);
            }
        }
    } catch (err) {
        console.warn('Falling back to renderer PDF to Markdown engine:', err);
    }

    const markdown = await convertPdfToMarkdown(filePath, options, onProgress);
    return { markdown, assets: [], engine: 'renderer' };
}

// ── UI ─────────────────────────────────────────────────────────────────────

async function initPdfToMarkdownTool() {
    await i18n.init();
    ThemeManager.init();

    const selectPdfBtn    = document.getElementById('select-pdf-btn');
    const removePdfBtn    = document.getElementById('remove-pdf-btn');
    const convertBtn      = document.getElementById('convert-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl       = document.getElementById('pdf-name');
    const pdfSizeEl       = document.getElementById('pdf-size');

    const progressModal   = document.getElementById('progress-modal');
    const progressFill    = document.getElementById('progress-fill');
    const progressInfo    = document.getElementById('progress-info');
    const cancelBtn       = document.getElementById('cancel-btn');

    const detectHeadingsChk   = document.getElementById('detect-headings');
    const detectTablesChk     = document.getElementById('detect-tables');
    const detectFormattingChk = document.getElementById('detect-formatting');
    const includeImagesChk    = document.getElementById('include-images');
    const ocrFallbackChk      = document.getElementById('ocr-fallback');
    const healParagraphsChk   = document.getElementById('heal-paragraphs');

    let selectedFile     = null;
    let droppedFilePath  = null;
    let cancelled        = false;
    let backendActive    = false;

    window.electronAPI.onPdfToMarkdownProgress?.((progress) => {
        if (!backendActive || cancelled) return;

        const pct = typeof progress?.value === 'number' ? progress.value : 0;
        progressFill.style.width = `${pct}%`;

        if (progress?.stage === 'page' && progress?.page && progress?.totalPages) {
            progressInfo.textContent = `Page ${progress.page} of ${progress.totalPages}...`;
        } else if (progress?.stage === 'loading') {
            progressInfo.textContent = 'Loading PDF...';
        } else if (progress?.stage === 'analyzing') {
            progressInfo.textContent = 'Analyzing document structure...';
        } else if (progress?.stage === 'assembling') {
            progressInfo.textContent = 'Assembling document...';
        }
    });

    const updateConvertBtn = () => { convertBtn.disabled = !selectedFile; };

    function handleFileSelected(file) {
        selectedFile = file;
        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        selectPdfBtn.style.display  = 'none';
        selectedFileInfo.style.display = 'flex';
        updateConvertBtn();
    }

    function clearFile() {
        selectedFile = null;
        droppedFilePath = null;
        selectPdfBtn.style.display  = 'block';
        selectedFileInfo.style.display = 'none';
        updateConvertBtn();
    }

    async function cleanupDropped() {
        if (droppedFilePath) {
            try { await window.electronAPI.deleteFile(droppedFilePath); } catch {}
            droppedFilePath = null;
        }
    }

    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('pdfToMarkdownJS.selecting'));
        const files = await window.electronAPI.selectPdfs();
        loadingUI.hide();
        if (files?.length > 0) {
            const fp   = files[0];
            const info = await window.electronAPI.getFileInfo(fp);
            handleFileSelected({ path: fp, name: fp.split(/[\\/]/).pop(), size: info.size || 0 });
        }
    });

    removePdfBtn.addEventListener('click', async () => {
        await cleanupDropped();
        clearFile();
    });

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDropped();
            window.location.href = '../../index.html';
        });
    }

    cancelBtn.addEventListener('click', () => { cancelled = true; });

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        const options = {
            detectHeadings:   detectHeadingsChk.checked,
            detectTables:     detectTablesChk.checked,
            detectFormatting: detectFormattingChk.checked,
            includeImages:    includeImagesChk.checked,
            ocrFallback:      ocrFallbackChk.checked,
            healParagraphs:   healParagraphsChk.checked
        };

        cancelled = false;
        progressModal.style.display = 'flex';
        progressFill.style.width    = '0%';
        progressInfo.textContent    = i18n.t('pdfToMarkdownJS.initializing');

        try {
            backendActive = true;
            const conversion = await convertPdfToMarkdownWithFallback(
                selectedFile.path,
                options,
                (pct, msg) => {
                    if (cancelled) throw new Error('cancelled');
                    progressFill.style.width = `${pct}%`;
                    progressInfo.textContent  = msg;
                }
            );
            backendActive = false;
            if (cancelled) throw new Error('cancelled');
            const markdown = conversion.markdown;

            progressModal.style.display = 'none';

            if (!markdown.trim()) {
                await customAlert.alert(
                    i18n.t('alerts.warning'),
                    i18n.t('pdfToMarkdownJS.empty-result'),
                    [i18n.t('common.ok')]
                );
                return;
            }

            const baseName = selectedFile.name.replace(/\.pdf$/i, '') + '.md';
            const saveResult   = await window.electronAPI.saveMarkdownFile(
                baseName, markdown, selectedFile.path, conversion.assets || []
            );

            if (saveResult?.success) {
                await customAlert.alert(
                    i18n.t('alerts.success'),
                    i18n.t('pdfToMarkdownJS.saved'),
                    [i18n.t('common.ok')]
                );
            }
        } catch (err) {
            backendActive = false;
            progressModal.style.display = 'none';
            if (err.message === 'cancelled') {
                await customAlert.alert(
                    i18n.t('alerts.warning'),
                    i18n.t('pdfToMarkdownJS.cancelled'),
                    [i18n.t('common.ok')]
                );
            } else {
                console.error('PDF to Markdown conversion failed:', err);
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfToMarkdownJS.error') + err.message,
                    [i18n.t('common.ok')]
                );
            }
        }
    });

    // Drag-and-drop
    initializeGlobalDragDrop({
        onFilesDropped: async (files) => {
            if (files.length > 1) {
                await customAlert.alert(
                    i18n.t('alerts.notice'),
                    i18n.t('pdfToMarkdownJS.drop-one'),
                    [i18n.t('common.ok')]
                );
                return;
            }
            const file = files[0];
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                await customAlert.alert(
                    i18n.t('alerts.notice'),
                    i18n.t('pdfToMarkdownJS.drop-pdf'),
                    [i18n.t('common.ok')]
                );
                return;
            }
            await cleanupDropped();
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });
            if (result.success) {
                droppedFilePath = result.filePath;
                handleFileSelected({ path: result.filePath, name: file.name, size: file.size || 0 });
            } else {
                await customAlert.alert(
                    i18n.t('alerts.error'),
                    i18n.t('pdfToMarkdownJS.drop-failed'),
                    [i18n.t('common.ok')]
                );
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(
                i18n.t('alerts.notice'),
                i18n.t('pdfToMarkdownJS.drop-pdf'),
                [i18n.t('common.ok')]
            );
        }
    });

    updateConvertBtn();
}

if (document.getElementById('convert-btn')) {
    document.addEventListener('DOMContentLoaded', () => {
        initPdfToMarkdownTool().catch(err => {
            console.error('Failed to initialize PDF to Markdown tool:', err);
        });
    });
}
