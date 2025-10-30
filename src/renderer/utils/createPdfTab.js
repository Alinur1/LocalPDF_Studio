/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @version     0.0.2
 * @license     MPL-2.0 (Mozilla Public License 2.0)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


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
