// src/renderer/viewers/pdfViewer.js
import * as pdfjsLib from '../../pdf/pdf.mjs';

// Tell PDF.js where the worker lives
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    '../../pdf/pdf.worker.mjs',
    import.meta.url
).toString();

export async function renderPDF(filePath, container) {
    try {
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;

        console.log(`PDF loaded: ${pdf.numPages} page(s)`);

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        container.innerHTML = '';
        container.appendChild(canvas);

        await page.render({ canvasContext: context, viewport }).promise;
        console.log('Page rendered');

        return pdf; // 👈 return so we can destroy it later
    } catch (err) {
        console.error('Error rendering PDF:', err);
        container.textContent = 'Failed to load PDF';
        return null;
    }
}

