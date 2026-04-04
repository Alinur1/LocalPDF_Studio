import { convertPdfToMarkdownWithFallback, DEFAULT_PDF_TO_MARKDOWN_OPTIONS } from './pdfToMarkdown.js';
import { ThemeManager } from '../../utils/themeManager.js';

const FIXTURE_PDFS = [
    {
        label: 'CS170 Homework',
        path: '/Users/jacobchamie/Documents/cs170hw01.pdf'
    },
    {
        label: 'ArXiv Sample',
        path: '/Users/jacobchamie/Downloads/2604.02248v1.pdf'
    }
];

const LIST_LINE_RE = /^\s*(?:- |\d+\. )/;

function getOptions() {
    return {
        ...DEFAULT_PDF_TO_MARKDOWN_OPTIONS,
        detectHeadings: document.getElementById('detect-headings').checked,
        detectTables: document.getElementById('detect-tables').checked,
        detectFormatting: document.getElementById('detect-formatting').checked,
        includeImages: document.getElementById('include-images').checked,
        ocrFallback: document.getElementById('ocr-fallback').checked,
        healParagraphs: document.getElementById('heal-paragraphs').checked
    };
}

function summarizeMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    return {
        headingCount: lines.filter(line => /^#{1,3}\s/.test(line)).length,
        tableCount: lines.filter(line => /^\|/.test(line)).length,
        listLines: lines.filter(line => LIST_LINE_RE.test(line)),
        lineCount: lines.length
    };
}

function slugifyName(name) {
    return name
        .replace(/\.pdf$/i, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function setGlobalStatus(message) {
    document.getElementById('fixture-status').textContent = message;
}

function createFixtureCard(file) {
    const template = document.getElementById('fixture-card-template');
    const node = template.content.firstElementChild.cloneNode(true);

    node.querySelector('.fixture-title').textContent = file.label;
    node.querySelector('.fixture-path').textContent = file.path;

    const refs = {
        root: node,
        runBtn: node.querySelector('.run-btn'),
        saveBtn: node.querySelector('.save-btn'),
        progressFill: node.querySelector('.fixture-progress-fill'),
        progressText: node.querySelector('.fixture-progress-text'),
        markdownOutput: node.querySelector('.markdown-output'),
        listPreview: node.querySelector('.list-preview'),
        headings: node.querySelector('.summary-headings'),
        tables: node.querySelector('.summary-tables'),
        lists: node.querySelector('.summary-lists'),
        lines: node.querySelector('.summary-lines')
    };

    let latestMarkdown = '';
    let latestAssets = [];

    async function runFixture() {
        refs.runBtn.disabled = true;
        refs.saveBtn.disabled = true;
        refs.progressFill.style.width = '0%';
        refs.progressText.textContent = 'Starting conversion...';
        setGlobalStatus(`Running fixture for ${file.label}...`);

        try {
            const result = await convertPdfToMarkdownWithFallback(file.path, getOptions(), (pct, msg) => {
                refs.progressFill.style.width = `${pct}%`;
                refs.progressText.textContent = msg;
            });
            const markdown = result.markdown;

            latestMarkdown = markdown;
            latestAssets = result.assets || [];
            refs.markdownOutput.value = markdown;

            const summary = summarizeMarkdown(markdown);
            refs.headings.textContent = String(summary.headingCount);
            refs.tables.textContent = String(summary.tableCount);
            refs.lists.textContent = String(summary.listLines.length);
            refs.lines.textContent = String(summary.lineCount);
            refs.listPreview.textContent = summary.listLines.length
                ? summary.listLines.slice(0, 80).join('\n')
                : 'No markdown list lines detected.';

            refs.progressFill.style.width = '100%';
            refs.progressText.textContent = 'Finished.';
            refs.saveBtn.disabled = !markdown.trim();
            setGlobalStatus(`Finished ${file.label}.`);
        } catch (err) {
            refs.progressText.textContent = `Failed: ${err.message}`;
            refs.listPreview.textContent = 'Conversion failed.';
            setGlobalStatus(`Fixture failed for ${file.label}: ${err.message}`);
            console.error('Fixture conversion failed:', err);
        } finally {
            refs.runBtn.disabled = false;
        }
    }

    async function saveFixtureOutput() {
        if (!latestMarkdown.trim()) return;
        const filename = `${slugifyName(file.label)}-fixture.md`;
        const result = await window.electronAPI.saveMarkdownFile(filename, latestMarkdown, file.path, latestAssets);
        if (result?.success) {
            setGlobalStatus(`Saved ${filename}.`);
        }
    }

    refs.runBtn.addEventListener('click', runFixture);
    refs.saveBtn.addEventListener('click', saveFixtureOutput);

    return {
        element: node,
        runFixture
    };
}

async function addSelectedPdfs() {
    const paths = await window.electronAPI.selectPdfs();
    if (!paths?.length) return [];

    return paths.map(path => ({
        label: path.split(/[\\/]/).pop(),
        path
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    ThemeManager.init();

    const fixtureList = document.getElementById('fixture-list');
    const cards = [];

    function appendFixtures(files) {
        for (const file of files) {
            const card = createFixtureCard(file);
            cards.push(card);
            fixtureList.appendChild(card.element);
        }
    }

    appendFixtures(FIXTURE_PDFS);

    document.getElementById('run-all-btn').addEventListener('click', async () => {
        for (const card of cards) {
            // Keep order deterministic so it is easier to compare outputs.
            await card.runFixture();
        }
    });

    document.getElementById('select-pdf-btn').addEventListener('click', async () => {
        const files = await addSelectedPdfs();
        if (!files.length) return;
        appendFixtures(files);
        setGlobalStatus(`Added ${files.length} PDF fixture${files.length === 1 ? '' : 's'}.`);
    });
});
