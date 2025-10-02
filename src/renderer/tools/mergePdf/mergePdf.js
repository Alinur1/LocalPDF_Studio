import { API } from '../../api/api.js';
import { createPdfList } from '../../common/pdfFileList.js';

document.addEventListener('DOMContentLoaded', () => {
    const selectBtn = document.getElementById('select-pdf-btn');
    const mergeBtn = document.getElementById('merge-btn');
    const clearBtn = document.getElementById('clear-btn');
    const listContainer = document.getElementById('pdf-list');

    // Attach PDF list component into existing <ul>
    const { addFiles, clearAll, getFiles, destroy } = createPdfList(listContainer);

    // Select files
    selectBtn.addEventListener('click', async () => {
        const selected = await window.electronAPI.selectPdfs();
        if (selected?.length) addFiles(selected);
    });

    // Clear list
    clearBtn.addEventListener('click', () => {
        clearAll();
    });

    // Merge PDFs
    mergeBtn.addEventListener('click', async () => {
        const files = getFiles();
        if (!files.length) {
            alert("Please select at least one PDF.");
            return;
        }

        try {
            const mergeEndpoint = await API.pdf.merge;
            const blob = await API.request.post(mergeEndpoint, { files });
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveMergedPdf(arrayBuffer);

            if (result.success) {
                alert("PDF saved successfully!");
            } else {
                alert("Save canceled.");
            }
        } catch (err) {
            console.error(err);
            alert("Error merging PDFs: " + err.message);
        }
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        destroy();
    });
});
