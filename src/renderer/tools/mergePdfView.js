//src/renderer/tools/mergePdfView.js

import { createPdfList } from '../common/pdfFileList.js';
import { loadStyle } from '../common/styleLoader.js';

export default function createMergePdfView() {
    loadStyle('common-style', './styles/common.css');
    loadStyle('merge-pdf-style', './styles/mergePdf.css');

    const container = document.createElement('div');
    container.classList.add('merge-pdf-container');

    const selectBtn = document.createElement('button');
    selectBtn.classList.add('select-pdf-btn');
    selectBtn.textContent = 'Click to Select PDF Files';

    const { pdfList, addFiles, clearAll, getFiles } = createPdfList(container);

    const mergeBtn = document.createElement('button');
    mergeBtn.classList.add('primary-btn');
    mergeBtn.textContent = 'Merge PDFs';

    const clearBtn = document.createElement('button');
    clearBtn.classList.add('secondary-btn');
    clearBtn.textContent = 'Clear All';

    container.append(selectBtn, pdfList, mergeBtn, clearBtn);

    selectBtn.addEventListener('click', async () => {
        const selected = await window.electronAPI.selectPdfs();
        if (selected && selected.length) addFiles(selected);
    });

    clearBtn.addEventListener('click', clearAll);

    mergeBtn.addEventListener('click', async () => {
        const files = getFiles();
        if (!files.length) return;
        try {
            const res = await fetch(`http://localhost:5295/api/pdf/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files })
            });

            if (!res.ok) throw new Error(await res.text());

            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveMergedPdf(arrayBuffer);

            if (result.success) {
                alert("PDF saved successfully!");
            } else {
                alert("Save canceled or failed.");
            }
        } catch (err) {
            console.error("Merge error:", err);
            alert("Error merging PDFs.");
        }
    });

    return container;
}
