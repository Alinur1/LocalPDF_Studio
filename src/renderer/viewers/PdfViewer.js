// src/renderer/viewers/PdfViewer.js
import * as pdfjsLib from '../../pdf/pdf.mjs';

// Point PDF.js to the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    '../../pdf/pdf.worker.mjs',
    import.meta.url
).toString();

/**
 * PdfViewer
 * - load(filePath, container): loads the PDF and attaches virtualized pages into `container`
 * - destroy(): cleans up pdf instance, observers, canvases, DOM
 */
export default class PdfViewer {
    constructor(container, options = {}) {
        this.container = container;
        this.pdf = null;
        this.pageCount = 0;
        this.pageDivs = new Map(); // pageNum -> {div, canvas, rendered}
        this.options = Object.assign(
            {
                scale: 1.2, // default render scale; you can compute based on container width later
                preRenderAdjacent: 1, // pages before/after to pre-render
                unloadDistance: 3 // pages farther than this from viewport will be unloaded
            },
            options
        );

        // styling & wrapper
        this.viewportEl = document.createElement('div');
        this.viewportEl.className = 'pdf-viewport';
        this.container.innerHTML = '';
        this.container.appendChild(this.viewportEl);

        // IntersectionObserver to detect visible pages
        this.intersectionObserver = new IntersectionObserver(
            (entries) => this._onIntersection(entries),
            { root: this.container, rootMargin: '800px 0px 800px 0px', threshold: 0.01 }
        );

        // track last visible page index
        this.lastVisiblePages = new Set();
    }

    async load(filePath) {
        // getDocument accepts file path in Electron (file:/// optionally). Use as-is.
        const loadingTask = pdfjsLib.getDocument(filePath);
        this.pdf = await loadingTask.promise;
        this.pageCount = this.pdf.numPages;

        // create page containers
        for (let i = 1; i <= this.pageCount; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page';
            pageDiv.dataset.pageNumber = i;

            // a placeholder spinner / page number
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-placeholder';
            placeholder.innerHTML = `<div class="pdf-page-label">Page ${i}</div>`;
            pageDiv.appendChild(placeholder);

            this.viewportEl.appendChild(pageDiv);
            this.pageDivs.set(i, {
                div: pageDiv,
                canvas: null,
                rendered: false
            });

            // observe for lazy rendering
            this.intersectionObserver.observe(pageDiv);
        }

        return this; // return instance
    }

    async _renderPage(pageNum) {
        const item = this.pageDivs.get(pageNum);
        if (!item || item.rendered) return;

        try {
            const page = await this.pdf.getPage(pageNum);

            // compute scale so page fits within container width (optional dynamic fit)
            const containerWidth = Math.max(this.container.clientWidth * 0.9, 400);
            const viewport = page.getViewport({ scale: 1.0 });
            const desiredScale = (containerWidth / viewport.width) * this.options.scale;
            const scaledViewport = page.getViewport({ scale: desiredScale });

            // create canvas
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas';
            canvas.width = Math.floor(scaledViewport.width);
            canvas.height = Math.floor(scaledViewport.height);
            canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
            canvas.style.height = `${Math.floor(scaledViewport.height)}px`;

            const ctx = canvas.getContext('2d');

            // clear existing placeholder and attach canvas
            item.div.innerHTML = '';
            item.div.appendChild(canvas);

            // render
            const renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
            await renderTask.promise;

            item.canvas = canvas;
            item.rendered = true;
            item.viewport = scaledViewport;
            item.page = page; // hold reference to PageProxy if needed

        } catch (err) {
            console.error('Error rendering page', pageNum, err);
            const item = this.pageDivs.get(pageNum);
            if (item) {
                item.div.innerHTML = `<div class="pdf-page-error">Failed to render page ${pageNum}</div>`;
            }
        }
    }

    _onIntersection(entries) {
        const visiblePages = new Set();

        for (const entry of entries) {
            const pageDiv = entry.target;
            const pageNum = Number(pageDiv.dataset.pageNumber);
            if (entry.isIntersecting) {
                visiblePages.add(pageNum);
                // render visible and adjacent pages
                this._renderPage(pageNum);
                for (let offset = 1; offset <= this.options.preRenderAdjacent; offset++) {
                    if (pageNum + offset <= this.pageCount) this._renderPage(pageNum + offset);
                    if (pageNum - offset >= 1) this._renderPage(pageNum - offset);
                }
            }
        }

        // unload canvases far from visible pages to save memory
        const farThreshold = this.options.unloadDistance;
        const allVisible = Array.from(visiblePages);
        if (allVisible.length === 0 && this.lastVisiblePages.size === 0) return;
        const minVisible = allVisible.length ? Math.min(...allVisible) : Math.min(...this.lastVisiblePages);
        const maxVisible = allVisible.length ? Math.max(...allVisible) : Math.max(...this.lastVisiblePages);

        for (const [pageNum, item] of this.pageDivs) {
            if (!item.rendered || !item.canvas) continue;
            // if page is far from visible range, unload
            if (pageNum < minVisible - farThreshold || pageNum > maxVisible + farThreshold) {
                this._unloadPage(pageNum);
            }
        }

        this.lastVisiblePages = visiblePages;
    }

    _unloadPage(pageNum) {
        const item = this.pageDivs.get(pageNum);
        if (!item || !item.canvas) return;

        try {
            // clear context
            const ctx = item.canvas.getContext('2d');
            ctx && ctx.clearRect(0, 0, item.canvas.width, item.canvas.height);

            // shrink canvas to release memory
            item.canvas.width = 0;
            item.canvas.height = 0;

            // remove DOM canvas node
            item.div.removeChild(item.canvas);

            // replace with placeholder (so user still sees a page slot)
            const placeholder = document.createElement('div');
            placeholder.className = 'pdf-page-placeholder';
            placeholder.innerHTML = `<div class="pdf-page-label">Page ${pageNum}</div>`;
            item.div.appendChild(placeholder);

            // delete references
            item.canvas = null;
            item.rendered = false;

            // optionally free page reference
            if (item.page && typeof item.page.cleanup === 'function') {
                try { item.page.cleanup(); } catch (e) { }
            }
            item.page = null;

        } catch (err) {
            console.warn('Error unloading page', pageNum, err);
        }
    }

    /**
     * Destroy viewer: unobserve, unload pages, destroy pdf
     */
    async destroy() {
        // stop observing
        try {
            this.intersectionObserver.disconnect();
        } catch (e) { }

        // Unload all pages
        for (const [pageNum] of this.pageDivs) {
            this._unloadPage(pageNum);
        }

        // clear DOM
        try {
            this.viewportEl.remove();
        } catch (e) { }

        // Destroy pdf (frees worker & memory)
        try {
            if (this.pdf && typeof this.pdf.destroy === 'function') {
                await this.pdf.destroy();
            }
        } catch (e) {
            console.warn('Error destroying pdf', e);
        } finally {
            this.pdf = null;
            this.pageDivs.clear();
        }
    }
}
