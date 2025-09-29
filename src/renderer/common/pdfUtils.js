// src/renderer/common/pdfUtils.js

import * as pdfjsLib from '../../pdf/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../pdf/build/pdf.worker.mjs';

export async function renderThumbnail(path, canvas) {
    try {
        const pdf = await pdfjsLib.getDocument(path).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        pdf.cleanup();
    } catch (err) {
        console.error('Thumbnail error:', err);
    }
}
