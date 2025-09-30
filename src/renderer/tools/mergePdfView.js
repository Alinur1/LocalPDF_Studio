// src/renderer/tools/mergePdfView.js

import { API } from '../api/api.js';
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
        if (selected?.length) addFiles(selected);
    });

    clearBtn.addEventListener('click', clearAll);

    mergeBtn.addEventListener('click', async () => {
        const files = getFiles();
        if (!files.length) return;

        try {
            // Get the merge endpoint dynamically
            const mergeEndpoint = await API.pdf.merge;
            const blob = await API.request.post(mergeEndpoint, { files });
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveMergedPdf(arrayBuffer);

            if (result.success) {
                alert("PDF saved successfully!");
            } else {
                alert("Save canceled or failed.");
            }
        } catch (err) {
            alert("Error merging PDFs: " + err.message);
        }
    });

    return container;
}
