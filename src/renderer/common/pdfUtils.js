// src/renderer/common/pdfUtils.js

import * as pdfjsLib from '../../pdf/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../pdf/build/pdf.worker.mjs';

export async function renderThumbnail(path, canvas) {
    let pdf = null;
    let page = null;

    try {
        pdf = await pdfjsLib.getDocument(path).promise;
        page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.2 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        await page.render({ canvasContext: ctx, viewport }).promise;

    } catch (err) {
        console.error('Thumbnail error:', err);
    } finally {
        // Proper cleanup to prevent memory leaks
        if (page) {
            page.cleanup();
        }
        if (pdf) {
            await pdf.cleanup();
            await pdf.destroy();
        }
    }
}

// Helper function to clear canvas and free memory
export function clearCanvas(canvas) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Reset canvas dimensions to free memory
    canvas.width = 0;
    canvas.height = 0;
}