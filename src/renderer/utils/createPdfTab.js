// src/renderer/utils/createPdfTab.js

export default function createPdfTab(filePath, tabManager, existingId = null) {
    const tabId = existingId || `pdf:${filePath}:${Date.now()}`;
    const title = filePath.split(/[\\/]/).pop();

    const iframe = document.createElement('iframe');
    iframe.src = `../pdf/web/viewer.html?file=file://${filePath}`;
    iframe.style.width = '90%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.margin = 'auto';
    iframe.style.display = 'block';

    iframe.addEventListener('load', () => {
        const iframeWin = iframe.contentWindow;
        const iframeDoc = iframeWin.document;

        // (1) Forward Ctrl+W to parent
        iframeWin.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                const event = new KeyboardEvent('keydown', {
                    key: 'w',
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    bubbles: true
                });
                window.dispatchEvent(event);
            }
        });

        // (2) External links → post to parent
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
