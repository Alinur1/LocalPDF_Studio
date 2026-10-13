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

// src/renderer/utils/markdown/textTransforms.mjs

// ─── Inline wrap (bold / italic / strikethrough / inline code) ──────────────
// Smart toggle: unwraps markers found INSIDE the selection first
// (`**bold**` fully selected → `bold`), then markers immediately OUTSIDE
// (cursor-anchored toggle), otherwise wraps.
export function wrapSelectionInText(text, start, end, prefix, suffix) {
    const selectedText = text.slice(start, end);

    // Trim whitespace from selection for cleaner formatting
    const trimmedText = selectedText.trim();
    const leadingSpace = selectedText.match(/^\s*/)[0];
    const trailingSpace = selectedText.match(/\s*$/)[0];

    // If selection is only whitespace, don't apply formatting
    if (!trimmedText) {
        return null;
    }

    // Case 1: markers inside the selection — unwrap to the inner content.
    if (trimmedText.length > prefix.length + suffix.length
        && trimmedText.startsWith(prefix)
        && trimmedText.endsWith(suffix)) {
        const inner = trimmedText.slice(prefix.length, trimmedText.length - suffix.length);
        const newStart = start + leadingSpace.length;
        return {
            text: text.slice(0, start) + leadingSpace + inner + trailingSpace + text.slice(end),
            start: newStart,
            end: newStart + inner.length,
        };
    }

    // Case 2: markers immediately outside the selection — toggle off.
    const before = text.slice(Math.max(0, start - prefix.length), start);
    const after = text.slice(end, end + suffix.length);

    if (before === prefix && after === suffix) {
        // Remove wrapper - keep the trimmed text only
        return {
            text: text.slice(0, start - prefix.length) + trimmedText + text.slice(end + suffix.length),
            start: start - prefix.length + leadingSpace.length,
            end: end - prefix.length - trailingSpace.length,
        };
    }

    // Case 3: add wrapper around trimmed text, preserving spaces outside
    return {
        text: text.slice(0, start) + leadingSpace + prefix + trimmedText + suffix + trailingSpace + text.slice(end),
        start: start + leadingSpace.length + prefix.length,
        end: start + leadingSpace.length + prefix.length + trimmedText.length,
    };
}

// ─── Link ────────────────────────────────────────────────────────────────────
// `url` defaults to the 'url' placeholder; callers may pass a
// clipboard URL instead (see isWebUrl).
export function isWebUrl(value) {
    return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

export function insertLinkInText(text, start, end, url = 'url') {
    const selectedText = text.slice(start, end);

    const linkText = selectedText || 'link text';
    const insertion = `[${linkText}](${url})`;

    // Position the selection over the URL part so typing replaces it
    const urlStart = start + linkText.length + 3;
    return {
        text: text.slice(0, start) + insertion + text.slice(end),
        start: urlStart,
        end: urlStart + url.length,
    };
}

// ─── Multi-line prefixes (lists, blockquotes) ───────────────────────────────
// Toggle detection ignores leading indentation (`  - x` counts as listed);
// removal strips the prefix after the indent. Adding still prefixes at
// column 0 (unchanged legacy behavior).
function stripPrefixAfterIndent(line, prefix) {
    const content = line.replace(/^\s*/, '');
    const indent = line.slice(0, line.length - content.length);
    return content.startsWith(prefix) ? indent + content.slice(prefix.length) : line;
}

function isPrefixedAfterIndent(line, prefix) {
    return line.replace(/^\s*/, '').startsWith(prefix);
}

export function prefixLinesInText(text, start, end, prefix) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const lines = text.slice(lineStart, lineEnd).split('\n');
    const allPrefixed = lines.filter(l => l.trim()).every(line => isPrefixedAfterIndent(line, prefix));

    const newLines = allPrefixed
        ? lines.map(line => stripPrefixAfterIndent(line, prefix)).join('\n')
        : lines.map(line => line.trim() ? prefix + line : line).join('\n');

    return {
        text: text.slice(0, lineStart) + newLines + text.slice(lineEnd),
        start: lineStart,
        end: lineStart + newLines.length,
    };
}

// ─── Headings ────────────────────────────────────────────────────────────────
export function insertHeadingInText(text, start, level) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const actualEnd = lineEnd === -1 ? text.length : lineEnd;

    const lineText = text.slice(lineStart, actualEnd);
    const cleanLine = lineText.replace(/^#{1,6}\s*/, ''); // Remove existing headings
    const prefix = '#'.repeat(level) + ' ';

    const cursor = lineStart + prefix.length + cleanLine.length;
    return {
        text: text.slice(0, lineStart) + prefix + cleanLine + text.slice(actualEnd),
        start: cursor,
        end: cursor,
    };
}

// Replaces the current line's heading (if any) with plain paragraph text.
export function clearHeadingInText(text, start) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const actualEnd = lineEnd === -1 ? text.length : lineEnd;

    const cleanLine = text.slice(lineStart, actualEnd).replace(/^#{1,6}\s*/, '');
    const cursor = lineStart + cleanLine.length;
    return {
        text: text.slice(0, lineStart) + cleanLine + text.slice(actualEnd),
        start: cursor,
        end: cursor,
    };
}

// ─── Table ───────────────────────────────────────────────────────────────────
export const TABLE_TEMPLATE = `\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n`;

export function insertTableInText(text, start) {
    const cursor = start + TABLE_TEMPLATE.length;
    return {
        text: text.slice(0, start) + TABLE_TEMPLATE + text.slice(start),
        start: cursor,
        end: cursor,
    };
}

// ─── Numbered list (smart incrementing + toggle-off) ─────────────────────────
// Toggle detection/removal tolerate leading indentation (unchanged add path).
export function insertNumberedListInText(text, start, end) {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const lines = text.slice(lineStart, lineEnd).split('\n');
    // Check if already a numbered list to toggle off
    const isNumbered = lines.filter(l => l.trim()).every(line => /^\s*\d+\.\s/.test(line));

    let newLines;
    if (isNumbered) {
        newLines = lines.map(line => line.replace(/^(\s*)\d+\.\s/, '$1')).join('\n');
    } else {
        let num = 1;
        newLines = lines.map(line => line.trim() ? `${num++}. ${line}` : line).join('\n');
    }

    return {
        text: text.slice(0, lineStart) + newLines + text.slice(lineEnd),
        start: lineStart,
        end: lineStart + newLines.length,
    };
}

// ─── Image ───────────────────────────────────────────────────────────────────
// NOTE: the original closure used `start + 11` (off by one — it selected
// `(image_ur`). Fixed to `start + 12` here with a unit test (TODO 5.2,
// landed early via this extraction).
export const IMAGE_TEMPLATE = `![alt text](image_url)`;
export const IMAGE_URL_OFFSET = 12; // index of `image_url` inside IMAGE_TEMPLATE
export const IMAGE_URL_LENGTH = 9; // length of `image_url`

export function insertImageInText(text, start) {
    return {
        text: text.slice(0, start) + IMAGE_TEMPLATE + text.slice(start),
        start: start + IMAGE_URL_OFFSET,
        end: start + IMAGE_URL_OFFSET + IMAGE_URL_LENGTH,
    };
}

// ─── Indent / outdent (Tab / Shift+Tab) ──────────────────────────────────────
// Collapsed cursor: insert (or remove) one 2-space level at the cursor.
// Ranged selection: (un)indent every covered line. Returns null only when an
// outdent changes nothing.
export const INDENT_UNIT = '  ';

export function indentInText(text, start, end, outdent = false) {
    if (start === end) {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        if (!outdent) {
            return {
                text: text.slice(0, start) + INDENT_UNIT + text.slice(start),
                start: start + INDENT_UNIT.length,
                end: start + INDENT_UNIT.length,
            };
        }
        const before = text.slice(lineStart, start);
        const removable = (before.match(/ +$/) || [''])[0].length;
        const remove = Math.min(INDENT_UNIT.length, removable);
        if (remove === 0) return null;
        return {
            text: text.slice(0, start - remove) + text.slice(start),
            start: start - remove,
            end: start - remove,
        };
    }

    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const lines = text.slice(lineStart, lineEnd).split('\n');
    const newLines = outdent
        ? lines.map(line => line.replace(/^ {1,2}/, ''))
        : lines.map(line => (line.trim() ? INDENT_UNIT + line : line));

    const joined = newLines.join('\n');
    if (joined === lines.join('\n')) return null;
    return {
        text: text.slice(0, lineStart) + joined + text.slice(lineEnd),
        start: lineStart,
        end: lineStart + joined.length,
    };
}

// ─── Smart Enter: continue lists / blockquotes ───────────────────────────────
// Collapsed cursor on a list/quote line → split + continuation marker.
// Marker-only line (e.g. `- ` with nothing after it) → exit the construct.
// Anything else → null (let the native newline happen).
export function continueListInText(text, start, end) {
    if (start !== end) return null;

    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = text.length;

    const line = text.slice(lineStart, lineEnd);
    // indent, quote run (`> > `), then an optional list marker (`- `, `3. `, `2) `)
    const m = line.match(/^(\s*)((?:>\s?)*)((?:- |\* |\+ )|(?:(\d+)[.)] ))?/);
    const indent = m[1];
    const quotes = m[2] || '';
    const listMark = m[3] || '';
    const num = m[4];
    if (!quotes && !listMark) return null;

    const content = line.slice(indent.length + quotes.length + listMark.length);
    const afterCursor = text.slice(start, lineEnd);

    // Marker-only line with cursor at the end → exit one level (drop the
    // list marker, keep indent + quotes).
    if (listMark && content.trim() === '' && afterCursor.trim() === '') {
        const stripped = indent + quotes;
        const exitCursor = lineStart + stripped.length + 1 + stripped.length;
        return {
            text: text.slice(0, lineStart) + stripped + '\n' + stripped + text.slice(lineEnd),
            start: exitCursor,
            end: exitCursor,
        };
    }

    let continuation = indent + quotes;
    if (listMark) {
        continuation += num !== undefined
            ? `${parseInt(num, 10) + 1}${listMark.includes(')') ? ')' : '.'} `
            : listMark;
    }
    const cursor = start + 1 + continuation.length;
    return {
        text: text.slice(0, start) + '\n' + continuation + text.slice(start),
        start: cursor,
        end: cursor,
    };
}

// ─── Multi-line code block ───────────────────────────────────────────────────
export const CODE_PLACEHOLDER = 'code here';

export function insertCodeBlockInText(text, start, end) {
    const selectedText = text.slice(start, end);

    const insertion = `\n\`\`\`\n${selectedText || CODE_PLACEHOLDER}\n\`\`\`\n`;

    // Select the code content inside the block. Content starts after the
    // leading '\n```\n' (5 chars). NOTE: the original closure used start + 4,
    // selecting '\n' + all-but-last-char — same off-by-one class as the image
    // bug. Fixed here with a unit test.
    const codeStart = start + 5;
    const codeLength = selectedText ? selectedText.length : CODE_PLACEHOLDER.length;
    return {
        text: text.slice(0, start) + insertion + text.slice(end),
        start: codeStart,
        end: codeStart + codeLength,
    };
}
