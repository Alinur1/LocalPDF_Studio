/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/

// src/renderer/utils/tesseractOcr.js

class TesseractOcr {
    constructor() {
        this.isInitialized = false;
        this.currentLanguage = 'eng';
    }

    async initialize(language = 'eng') {
        this.currentLanguage = language;
        this.isInitialized = true;
        console.log(`Tesseract initialized for language: ${language}`);
    }

    async recognizeImageFile(imagePath) {
        if (!this.isInitialized) {
            await this.initialize(this.currentLanguage);
        }

        // Check if API exists
        if (!window.electronAPI || !window.electronAPI.performTesseractOCR) {
            console.error('Tesseract API not available in electronAPI');
            throw new Error('Tesseract OCR API is not available. Check main process setup.');
        }

        try {
            const result = await window.electronAPI.performTesseractOCR(
                imagePath,
                this.currentLanguage,
                {
                    tessedit_pageseg_mode: '3',
                    preserve_interword_spaces: '1'
                }
            );

            if (!result.success) {
                throw new Error(result.error || 'OCR failed');
            }

            return {
                text: result.text,
                confidence: result.confidence,
                blocks: result.blocks,
                lines: result.lines,
                words: result.words
            };
        } catch (error) {
            console.error('Image file OCR failed:', error);
            throw new Error(`Image OCR failed: ${error.message}`);
        }
    }

    async recognizePdfPages(pages, onProgress = null) {
        if (!this.isInitialized) {
            await this.initialize(this.currentLanguage);
        }

        if (onProgress && typeof onProgress === 'function') {
            window.electronAPI.onTesseractProgress((progress) => {
                onProgress(progress.current, progress.total, progress.page);
            });
        }

        try {
            const result = await window.electronAPI.performTesseractPDFOCR(
                pages,
                this.currentLanguage,
                {
                    tessedit_pageseg_mode: '3',
                    preserve_interword_spaces: '1'
                }
            );
            if (onProgress) {
                window.electronAPI.onTesseractProgress(() => { }); // Remove listener
            }
            if (!result.success) {
                throw new Error(result.error || 'PDF OCR failed');
            }
            return result.results;
        } catch (error) {
            console.error('PDF OCR failed:', error);
            if (onProgress) {
                window.electronAPI.onTesseractProgress(() => { });
            }
            throw error;
        }
    }

    async extractTextFromImage(imagePath) {
        const result = await this.recognizeImageFile(imagePath);
        return result.text;
    }

    async processCanvasBatch(canvases, startIndex) {
        const pages = canvases.map((canvas, index) => {
            console.log(`Converting canvas ${startIndex + index + 1}: ${canvas.width}x${canvas.height}`);

            // Convert canvas to base64 image data
            const imageData = canvas.toDataURL('image/png');

            // Log size for debugging
            console.log(`Canvas ${startIndex + index + 1} base64 size: ${Math.round(imageData.length / 1024)}KB`);

            return {
                imageData: imageData,
                pageNumber: startIndex + index + 1
            };
        });

        console.log(`Sending batch of ${pages.length} pages to OCR...`);

        try {
            const result = await this.recognizePdfPages(pages);
            console.log(`Batch OCR completed: ${result.filter(r => r.success).length}/${pages.length} successful`);
            return result;
        } catch (error) {
            console.error(`Batch ${Math.floor(startIndex / 3) + 1} failed:`, error);

            // Return empty results for this batch but continue processing
            return pages.map((_, index) => ({
                page: startIndex + index + 1,
                success: false,
                error: error.message,
                text: ''
            }));
        }
    }

    async extractTextFromPdfCanvases(canvases, batchSize = 3) {
        console.log(`Processing ${canvases.length} canvases in batches of ${batchSize}...`);

        if (canvases.length === 0) {
            return '';
        }

        // Process in batches to manage memory
        const allResults = [];

        for (let i = 0; i < canvases.length; i += batchSize) {
            const batchEnd = Math.min(i + batchSize, canvases.length);
            const batch = canvases.slice(i, batchEnd);

            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(canvases.length / batchSize)} (pages ${i + 1}-${batchEnd})`);

            // Process this batch
            const batchResults = await this.processCanvasBatch(batch, i);
            allResults.push(...batchResults);

            // Clean up canvases in this batch to free memory
            batch.forEach(canvas => {
                if (canvas && canvas.getContext) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    canvas.width = 1; // Minimize memory
                    canvas.height = 1;
                }
            });

            // Force garbage collection hint
            if (typeof gc !== 'undefined') {
                gc();
            }
        }

        // Combine text from all successful pages
        const combinedText = allResults
            .filter(r => r.success && r.text && r.text.trim())
            .map(r => r.text)
            .join('\n\n--- Page Break ---\n\n');

        console.log('Combined text length:', combinedText.length);
        return combinedText;
    }

    async setLanguage(language) {
        this.currentLanguage = language;
        this.isInitialized = true;
    }

    async getAvailableLanguages() {
        try {
            const result = await window.electronAPI.getTesseractLanguages();
            if (result.success) {
                return result.languages;
            } else {
                console.error('Failed to get languages:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Failed to get languages:', error);
            return [];
        }
    }

    async terminate() {
        console.log('Tesseract IPC client terminated');
    }

    async extractTextFromPdfCanvasesWithProgress(canvases, progressCallback, batchSize = 2) {
        console.log(`Processing ${canvases.length} canvases with progress tracking...`);

        if (canvases.length === 0) {
            return '';
        }

        const allResults = [];

        for (let i = 0; i < canvases.length; i += batchSize) {
            // Update progress
            if (progressCallback) {
                progressCallback(i, canvases.length);
            }

            const batchEnd = Math.min(i + batchSize, canvases.length);
            const batch = canvases.slice(i, batchEnd);

            // Process batch
            const batchResults = await this.processCanvasBatch(batch, i);
            allResults.push(...batchResults);

            // Clean up immediately
            batch.forEach(canvas => {
                if (canvas && canvas.getContext) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    canvas.width = 1;
                    canvas.height = 1;
                }
            });

            // Allow UI updates between batches
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Final progress update
        if (progressCallback) {
            progressCallback(canvases.length, canvases.length);
        }

        // Combine results
        const combinedText = allResults
            .filter(r => r.success && r.text && r.text.trim())
            .map(r => r.text)
            .join('\n\n--- Page Break ---\n\n');

        return combinedText;
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            language: this.currentLanguage,
            viaIPC: true
        };
    }
}

const tesseractOcr = new TesseractOcr();
export default tesseractOcr;