// src/renderer/utils/createPdfTab.js

export default async function createPdfTab(filePath, tabManager) {
    const settings = await window.electronAPI.getSettings();
    const pdfViewer = settings.pdfViewer || 'chromium'; // default chromium

    const tabId = `pdf:${filePath}:${Date.now()}`;
    const title = filePath.split(/[\\/]/).pop();

    const iframe = document.createElement('iframe');

    if (pdfViewer === 'pdfjs') {
        // Mozilla PDF.js
        iframe.src = `../pdf/web/viewer.html?file=file://${filePath}`;
    } else {
        // Chromium built-in PDF viewer
        iframe.src = `file://${filePath}`;
    }

    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    iframe.addEventListener('load', () => {
        const iframeWin = iframe.contentWindow;
        const iframeDoc = iframeWin.document;

        iframeDoc.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && /^https?:/i.test(link.href)) {
                e.preventDefault();
                iframeWin.parent.postMessage(
                    { type: 'open-external', url: link.href },
                    '*'
                );
            }
        });
    });

    tabManager.openTab({
        id: tabId,
        type: 'pdf',
        title,
        content: iframe,
        closable: true,
        onClose: () => {
            iframe.src = 'about:blank';
            iframe.remove();
        }
    });
}
