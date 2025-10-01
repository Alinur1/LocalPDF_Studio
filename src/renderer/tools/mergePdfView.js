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

    const { pdfList, addFiles, clearAll, getFiles, destroy } = createPdfList(container);

    const mergeBtn = document.createElement('button');
    mergeBtn.classList.add('primary-btn');
    mergeBtn.textContent = 'Merge PDFs';

    const clearBtn = document.createElement('button');
    clearBtn.classList.add('secondary-btn');
    clearBtn.textContent = 'Clear All';

    container.append(selectBtn, pdfList, mergeBtn, clearBtn);

    // Event handlers stored so they can be removed
    const handleSelectClick = async () => {
        const selected = await window.electronAPI.selectPdfs();
        if (selected?.length) addFiles(selected);
    };

    const handleClearClick = () => {
        clearAll();
        // Force garbage collection hint (doesn't guarantee GC, but helps)
        if (window.gc) window.gc();
    };

    const handleMergeClick = async () => {
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
    };

    selectBtn.addEventListener('click', handleSelectClick);
    clearBtn.addEventListener('click', handleClearClick);
    mergeBtn.addEventListener('click', handleMergeClick);

    // Attach cleanup function to container for when view is removed
    container.cleanup = () => {
        // Remove event listeners
        selectBtn.removeEventListener('click', handleSelectClick);
        clearBtn.removeEventListener('click', handleClearClick);
        mergeBtn.removeEventListener('click', handleMergeClick);

        // Destroy PDF list
        destroy();

        // Clear container
        container.replaceChildren();
    };

    return container;
}