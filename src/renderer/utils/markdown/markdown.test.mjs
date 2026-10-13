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

// src/renderer/utils/markdown/markdown.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    wrapSelectionInText, insertLinkInText, isWebUrl, prefixLinesInText, insertHeadingInText,
    clearHeadingInText, insertTableInText, TABLE_TEMPLATE, insertNumberedListInText,
    insertImageInText, IMAGE_TEMPLATE, insertCodeBlockInText, CODE_PLACEHOLDER,
    indentInText, continueListInText,
} from './textTransforms.mjs';
import { lineToPreviewScrollTop, previewScrollToEditorLine } from './scrollMath.mjs';
import { countWords, readMinutes } from './stats.mjs';
import { hasUriScheme, isWindowsAbsolutePath, toFileUrl, relativizeImagePath, buildFileBaseUrl, resolveRelativeSrc } from './imageUrl.mjs';
import { topLevelTokens, computeTokenLines, assignSyncLines } from './syncLines.mjs';
import { expandTabs, computeRowMap, rowToLineIndex, lineToRowIndex } from './visualMap.mjs';
import { marked } from 'marked';

// ─── wrap ───
test('wrap bold word', () => {
    const r = wrapSelectionInText('hello world', 6, 11, '**', '**');
    assert.equal(r.text, 'hello **world**');
    assert.equal(r.start, 8);
    assert.equal(r.end, 13);
});

test('wrap preserves surrounding spaces outside markers', () => {
    const r = wrapSelectionInText('  hi  ', 0, 6, '**', '**');
    assert.equal(r.text, '  **hi**  ');
    assert.equal(r.start, 4);
    assert.equal(r.end, 6);
});

test('wrap whitespace-only is a no-op', () => {
    assert.equal(wrapSelectionInText('a   b', 1, 4, '**', '**'), null);
});

test('wrap toggles off adjacent markers', () => {
    const r = wrapSelectionInText('**bold**', 2, 6, '**', '**');
    assert.equal(r.text, 'bold');
    assert.equal(r.start, 0);
    assert.equal(r.end, 4);
});

test('wrap toggles off markers inside the selection (smart unwrap)', () => {
    const r = wrapSelectionInText('**bold**', 0, 8, '**', '**');
    assert.equal(r.text, 'bold');
    assert.equal(r.start, 0);
    assert.equal(r.end, 4);
});

test('wrap unwraps inner markers within a larger selection', () => {
    const r = wrapSelectionInText('a **b** c', 2, 7, '**', '**');
    assert.equal(r.text, 'a b c');
    assert.equal(r.start, 2);
    assert.equal(r.end, 3);
});

test('wrap unwraps single-char markers', () => {
    const r = wrapSelectionInText('*x*', 0, 3, '*', '*');
    assert.equal(r.text, 'x');
});

test('prefix toggles off indented items', () => {
    const r = prefixLinesInText('  - a\n  - b', 0, 11, '- ');
    assert.equal(r.text, '  a\n  b');
});

test('numbered list toggles off indented items', () => {
    const r = insertNumberedListInText('  1. a\n  2. b', 0, 12);
    assert.equal(r.text, '  a\n  b');
});

// ─── indent / outdent ───
test('tab inserts two spaces at collapsed cursor', () => {
    const r = indentInText('ab', 1, 1);
    assert.equal(r.text, 'a  b');
    assert.equal(r.start, 3);
});

test('shift+tab removes one level before cursor', () => {
    const r = indentInText('a  b', 3, 3, true);
    assert.equal(r.text, 'ab');
    assert.equal(r.start, 1);
});

test('shift+tab with no indent is a no-op', () => {
    assert.equal(indentInText('ab', 1, 1, true), null);
});

test('tab indents covered lines', () => {
    const r = indentInText('a\nb', 0, 3);
    assert.equal(r.text, '  a\n  b');
    assert.equal(r.start, 0);
    assert.equal(r.end, 7);
});

test('shift+tab outdents covered lines', () => {
    const r = indentInText('  a\n  b', 0, 7, true);
    assert.equal(r.text, 'a\nb');
});

// ─── smart enter ───
test('enter continues bullet', () => {
    const r = continueListInText('- item', 7, 7);
    assert.equal(r.text, '- item\n- ');
    assert.equal(r.start, 10);
});

test('enter increments ordered marker', () => {
    const r = continueListInText('3. x', 4, 4);
    assert.equal(r.text, '3. x\n4. ');
    assert.equal(r.start, 8);
});

test('enter continues indented bullet', () => {
    const r = continueListInText('  - x', 5, 5);
    assert.equal(r.text, '  - x\n  - ');
    assert.equal(r.start, 10);
});

test('enter on marker-only line exits the list', () => {
    const r = continueListInText('- ', 2, 2);
    assert.equal(r.text, '\n');
    assert.equal(r.start, 1);
});

test('enter continues blockquote', () => {
    const r = continueListInText('> q', 3, 3);
    assert.equal(r.text, '> q\n> ');
    assert.equal(r.start, 6);
});

test('enter splits mid-line with continuation', () => {
    const r = continueListInText('- ab', 3, 3);
    assert.equal(r.text, '- a\n- b');
    assert.equal(r.start, 6);
});

test('enter on plain text is native (null)', () => {
    assert.equal(continueListInText('hi', 2, 2), null);
});

test('enter with a selection is native (null)', () => {
    assert.equal(continueListInText('- ab', 0, 4), null);
});

// ─── link ───
test('link wraps selection and selects url', () => {
    const r = insertLinkInText('see X here', 4, 5);
    assert.equal(r.text, 'see [X](url) here');
    assert.equal(r.text.slice(r.start, r.end), 'url');
});

test('link with empty selection uses placeholder', () => {
    const r = insertLinkInText('ab', 1, 1);
    assert.equal(r.text, 'a[link text](url)b');
    assert.equal(r.text.slice(r.start, r.end), 'url');
});

test('link accepts a clipboard URL (7.2)', () => {
    assert.equal(isWebUrl('https://example.com/x'), true);
    assert.equal(isWebUrl('http://a'), true);
    assert.equal(isWebUrl('  https://a/b  '), true);
    assert.equal(isWebUrl('not a url'), false);
    assert.equal(isWebUrl('javascript:alert(1)'), false);
    assert.equal(isWebUrl(''), false);
    assert.equal(isWebUrl(null), false);
    const r = insertLinkInText('ab', 1, 1, 'https://example.com/long');
    assert.equal(r.text, 'a[link text](https://example.com/long)b');
    assert.equal(r.text.slice(r.start, r.end), 'https://example.com/long');
});

// ─── prefix lines ───
test('prefix adds to each non-empty line', () => {
    const r = prefixLinesInText('a\nb', 0, 3, '- ');
    assert.equal(r.text, '- a\n- b');
    assert.equal(r.start, 0);
    assert.equal(r.end, 7);
});

test('prefix toggles off', () => {
    const r = prefixLinesInText('- a\n- b', 0, 7, '- ');
    assert.equal(r.text, 'a\nb');
});

test('prefix with collapsed cursor prefixes whole line', () => {
    const r = prefixLinesInText('hello', 2, 2, '> ');
    assert.equal(r.text, '> hello');
});

// ─── headings ───
test('heading replaces level', () => {
    const r = insertHeadingInText('## old', 5, 1);
    assert.equal(r.text, '# old');
});

test('heading on second line', () => {
    const r = insertHeadingInText('a\nb', 2, 1);
    assert.equal(r.text, 'a\n# b');
    assert.equal(r.start, 5);
    assert.equal(r.end, 5);
});

test('clear heading returns paragraph text', () => {
    const r = clearHeadingInText('## hi there', 5);
    assert.equal(r.text, 'hi there');
    assert.equal(r.start, 8);
    assert.equal(r.end, 8);
});

test('clear heading on plain line is a no-op', () => {
    const r = clearHeadingInText('plain', 2);
    assert.equal(r.text, 'plain');
    assert.equal(r.start, 5);
    assert.equal(r.end, 5);
});

// ─── table ───
test('table inserts template at cursor', () => {
    const r = insertTableInText('ab', 1);
    assert.equal(r.text, 'a' + TABLE_TEMPLATE + 'b');
    assert.equal(r.start, 1 + TABLE_TEMPLATE.length);
});

// ─── numbered list ───
test('numbered list numbers non-empty lines', () => {
    const r = insertNumberedListInText('a\n\nb', 0, 5);
    assert.equal(r.text, '1. a\n\n2. b');
});

test('numbered list toggles off', () => {
    const r = insertNumberedListInText('1. a\n2. b', 0, 9);
    assert.equal(r.text, 'a\nb');
});

// ─── image (fixed off-by-one) ───
test('image selects exactly image_url', () => {
    const r = insertImageInText('ab', 1);
    assert.equal(r.text, 'a' + IMAGE_TEMPLATE + 'b');
    assert.equal(r.text.slice(r.start, r.end), 'image_url');
});

// ─── code block ───
test('code block selects inner content', () => {
    const r = insertCodeBlockInText('xyzh', 1, 3);
    assert.equal(r.text, 'x\n```\nyz\n```\nh');
    assert.equal(r.text.slice(r.start, r.end), 'yz');
});

test('code block placeholder selected when empty', () => {
    const r = insertCodeBlockInText('ab', 1, 1);
    assert.equal(r.text.slice(r.start, r.end), CODE_PLACEHOLDER);
});

// ─── scroll math ───
test('lineToPreview proportional fallback', () => {
    const px = lineToPreviewScrollTop(5, [], { totalLines: 10, editorScrollTop: 50, editorMax: 100, previewMax: 200 });
    assert.equal(px, 100);
});

test('lineToPreview interpolates between sentinels', () => {
    const px = lineToPreviewScrollTop(5, [{ line: 0, top: 0 }, { line: 10, top: 100 }],
        { totalLines: 20, editorScrollTop: 0, editorMax: 50, previewMax: 200 });
    assert.equal(px, 50);
});

test('lineToPreview tail extrapolation', () => {
    const px = lineToPreviewScrollTop(15, [{ line: 10, top: 100 }],
        { totalLines: 20, editorScrollTop: 0, editorMax: 50, previewMax: 200 });
    assert.equal(px, 150);
});

test('lineToPreview before-first clamp', () => {
    const px = lineToPreviewScrollTop(2, [{ line: 4, top: 40 }],
        { totalLines: 20, editorScrollTop: 0, editorMax: 50, previewMax: 200 });
    assert.equal(px, 20);
});

test('previewToLine proportional fallback', () => {
    const line = previewScrollToEditorLine(100, [], { totalLines: 10, editorMax: 50, previewMax: 200 });
    assert.equal(line, 25);
});

test('previewToLine interpolates', () => {
    const line = previewScrollToEditorLine(50, [{ line: 0, top: 0 }, { line: 10, top: 100 }],
        { totalLines: 20, editorMax: 50, previewMax: 200 });
    assert.equal(line, 5);
});

test('lineToPreview interpolates within a tall block', () => {
    const pos = [{ line: 2, end: 12, top: 100, height: 200 }, { line: 14, top: 320 }];
    const px = lineToPreviewScrollTop(7, pos, { totalLines: 20, editorScrollTop: 0, editorMax: 50, previewMax: 400 });
    assert.equal(px, 200);
});

test('previewToLine interpolates within a tall block', () => {
    const pos = [{ line: 2, end: 12, top: 100, height: 200 }, { line: 14, top: 320 }];
    const line = previewScrollToEditorLine(200, pos, { totalLines: 20, editorMax: 50, previewMax: 400 });
    assert.equal(line, 7);
});

// ─── stats ───
test('word counts', () => {
    assert.equal(countWords('  a b  '), 2);
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   '), 0);
});

test('read minutes floors at 1, zero for empty', () => {
    assert.equal(readMinutes(0), 0);
    assert.equal(readMinutes(400), 2);
});

// ─── image urls ───
test('scheme detection', () => {
    assert.equal(hasUriScheme('javascript:alert(1)'), true);
    assert.equal(hasUriScheme('https://x/y.png'), true);
    assert.equal(hasUriScheme('./a.png'), false);
    assert.equal(hasUriScheme('#frag'), false);
});

test('windows absolute paths resolve as local files (7.2)', () => {
    assert.equal(isWindowsAbsolutePath('C:\\docs\\a.png'), true);
    assert.equal(isWindowsAbsolutePath('D:/docs/a.png'), true);
    assert.equal(isWindowsAbsolutePath('./a.png'), false);
    assert.equal(isWindowsAbsolutePath('https://x/y.png'), false);
    assert.equal(toFileUrl('C:\\docs\\my pic.png'), 'file:///C:/docs/my pic.png');
});

test('image refs relativize against the md dir', () => {
    assert.equal(relativizeImagePath('C:\\docs\\n.md', 'C:\\docs\\img\\a.png'), 'img/a.png');
    assert.equal(relativizeImagePath('/home/u/n.md', '/home/u/img/a.png'), 'img/a.png');
    // no case-insensitive guessing: a casing mismatch stays absolute (it
    // still renders via toFileUrl) instead of a broken relative ref.
    assert.equal(relativizeImagePath('/home/u/Docs/n.md', '/home/u/docs/a.png'), '/home/u/docs/a.png');
    assert.equal(relativizeImagePath('C:\\Docs\\n.md', 'c:\\docs\\a.png'), 'c:\\docs\\a.png');
    assert.equal(relativizeImagePath('n.md', 'a.png'), 'a.png');
});

test('base url building', () => {
    assert.equal(buildFileBaseUrl('C:\\docs\\n.md').href, 'file:///C:/docs/');
    assert.equal(buildFileBaseUrl('note.md').href, 'file:///');
    assert.equal(buildFileBaseUrl('').href, 'file:///');
});

test('relative resolve encodes spaces', () => {
    const base = buildFileBaseUrl('C:\\docs\\n.md');
    assert.equal(resolveRelativeSrc('sub dir/a b.png', base), 'file:///C:/docs/sub%20dir/a%20b.png');
    assert.equal(resolveRelativeSrc('a.png', null), 'a.png'); // unusable base -> identity
});

// ─── sync lines (real lexer) ───
function fakeRoot(count) {
    const elements = Array.from({ length: count }, () => ({ dataset: {} }));
    return {
        elements,
        querySelectorAll: () => elements,
    };
}

test('token lines map blocks to source lines', () => {
    const src = '# Title\n\nFirst para.\n\nSecond para.\n';
    const tokens = topLevelTokens(marked, src);
    assert.ok(tokens.length > 0);
    assert.deepEqual(computeTokenLines(src, tokens).map(s => s.start), [0, 2, 4]);
    // end = first line after the block (trailing \n belongs to the next
    // space token, except at EOF where the last block absorbs it)
    assert.deepEqual(computeTokenLines(src, tokens).map(s => s.end), [0, 2, 5]);
});

test('duplicate paragraphs resolve in order', () => {
    const src = 'Same text.\n\nSame text.\n\nSame text.\n';
    const tokens = topLevelTokens(marked, src);
    assert.deepEqual(computeTokenLines(src, tokens).map(s => s.start), [0, 2, 4]);
});

test('code fence with markdown inside maps once', () => {
    const src = '# A\n\n```\n# not a heading\n[not](a)\n```\n\nTail.\n';
    const tokens = topLevelTokens(marked, src);
    const spans = computeTokenLines(src, tokens);
    assert.deepEqual(spans.map(s => s.start), [0, 2, 7]);
    assert.deepEqual(spans.map(s => s.end), [0, 5, 8]);
});

test('hr, quote, list and image-only blocks map', () => {
    const src = 'Para.\n\n---\n\n> quote\n\n- a\n- b\n\n![alt](i.png)\n';
    const tokens = topLevelTokens(marked, src);
    assert.deepEqual(computeTokenLines(src, tokens).map(s => s.start), [0, 2, 4, 6, 9]);
});

test('assign pairs elements with lines monotonically', () => {
    const src = '# T\n\nOne.\n\nOne.\n';
    const root = fakeRoot(3);
    assert.equal(assignSyncLines(src, root, marked), 3);
    assert.deepEqual(root.elements.map(e => Number(e.dataset.syncLine)), [0, 2, 4]);
});

test('assign bails on count mismatch (proportional fallback wins)', () => {
    const src = '# T\n\nOne.\n';
    const root = fakeRoot(9); // raw-HTML soup rendering many elements
    assert.equal(assignSyncLines(src, root, marked), 0);
    assert.ok(root.elements.every(e => e.dataset.syncLine === undefined));
});

test('assign bails without a lexer', () => {
    const root = fakeRoot(2);
    assert.equal(assignSyncLines('# T\n', root, null), 0);
    assert.equal(assignSyncLines('# T\n', root, {}), 0);
});

// ─── visual rows ───
test('rows from widths', () => {
    const m = computeRowMap([10, 0, 250], 100);
    assert.deepEqual(m.rows, [1, 1, 3]);
    assert.deepEqual(m.lineStartRow, [0, 1, 2]);
    assert.equal(m.totalRows, 5);
});

test('row to line with clamping', () => {
    const m = computeRowMap([10, 250, 10], 100); // rows 1, 3, 1
    assert.equal(rowToLineIndex(m, 0), 0);
    assert.equal(rowToLineIndex(m, 1), 1);
    assert.equal(rowToLineIndex(m, 3), 1);
    assert.equal(rowToLineIndex(m, 4), 2);
    assert.equal(rowToLineIndex(m, 99), 2);
    assert.equal(rowToLineIndex(null, 5), 0);
});

test('line to row with clamping', () => {
    const m = computeRowMap([10, 250, 10], 100);
    assert.equal(lineToRowIndex(m, 0), 0);
    assert.equal(lineToRowIndex(m, 1), 1);
    assert.equal(lineToRowIndex(m, 2), 4);
    assert.equal(lineToRowIndex(m, 99), 4);
});

test('tabs expand to spaces', () => {
    assert.equal(expandTabs('a\tb'), 'a    b');
});

