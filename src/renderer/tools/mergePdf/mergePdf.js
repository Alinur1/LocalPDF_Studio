// src/renderer/tools/mergePdf/mergePdf.js

import { API } from '../../api/api.js';
import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import customAlert from '../../utils/customAlert.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const selectBtn = document.getElementById('select-pdf-btn');
    const mergeBtn = document.getElementById('merge-btn');
    const clearBtn = document.getElementById('clear-btn');
    const listContainer = document.getElementById('pdf-list');

    // Create PDF list component directly in this file
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
            await customAlert.alert('LocalPDF Studio', "Please select at least one PDF.", ['OK']);
            return;
        }

        try {
            const mergeEndpoint = await API.pdf.merge;
            const blob = await API.request.post(mergeEndpoint, { files });
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveMergedPdf(arrayBuffer);

            if (result.success) {
                await customAlert.alert('LocalPDF Studio', "PDF saved successfully!", ['OK']);
            } else {
                await customAlert.alert('LocalPDF Studio - WARNING', "Save canceled.", ['OK']);
            }
        } catch (err) {
            console.error(err);
            await customAlert.alert('LocalPDF Studio - ERROR', "Error merging PDFs: " + err.message, ['OK']);
        }
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        destroy();
    });
});

// Moved from pdfFileList.js
function createPdfList(container) {
    const pdfList = document.createElement('ul');
    pdfList.classList.add('pdf-list');
    container.appendChild(pdfList);

    let files = [];
    const listItemCleanup = new Map(); // Track cleanup functions for each list item

    function addFiles(paths) {
        for (const path of paths) {
            if (files.includes(path)) continue;
            files.push(path);

            const li = document.createElement('li');
            li.draggable = true;

            // Thumbnail
            const thumb = document.createElement('canvas');
            thumb.classList.add('pdf-thumbnail');

            // Info
            const infoDiv = document.createElement('div');
            infoDiv.classList.add('pdf-info');

            const nameSpan = document.createElement('div');
            nameSpan.classList.add('pdf-name');
            nameSpan.textContent = path.split(/[\\/]/).pop();

            const sizeSpan = document.createElement('div');
            sizeSpan.classList.add('pdf-size');
            infoDiv.append(nameSpan, sizeSpan);

            // Remove button with cleanup
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-btn');
            removeBtn.textContent = '×';

            const handleRemove = () => {
                files = files.filter(f => f !== path);
                cleanupListItem(li);
                li.remove();
            };

            removeBtn.addEventListener('click', handleRemove);

            li.append(thumb, infoDiv, removeBtn);
            pdfList.appendChild(li);

            // File info
            window.electronAPI.getFileInfo(path).then(({ size }) => {
                sizeSpan.textContent = `${(size / 1024 / 1024).toFixed(2)} MB`;
            });

            // Thumbnail
            renderThumbnail(path, thumb);

            // Drag event handlers
            const handleDragStart = () => li.classList.add('dragging');
            const handleDragEnd = () => {
                li.classList.remove('dragging');
                updateFileOrder();
            };

            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragend', handleDragEnd);

            // Store cleanup function for this list item
            listItemCleanup.set(li, () => {
                // Clear canvas memory
                clearCanvas(thumb);

                // Remove event listeners
                removeBtn.removeEventListener('click', handleRemove);
                li.removeEventListener('dragstart', handleDragStart);
                li.removeEventListener('dragend', handleDragEnd);

                // Clear references
                li.replaceChildren();
            });
        }
    }

    // Cleanup individual list item
    function cleanupListItem(li) {
        const cleanup = listItemCleanup.get(li);
        if (cleanup) {
            cleanup();
            listItemCleanup.delete(li);
        }
    }

    pdfList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = pdfList.querySelector('.dragging');
        if (!dragging) return;

        const afterEl = getDragAfterElement(pdfList, e.clientY);
        if (afterEl == null) {
            pdfList.appendChild(dragging);
        } else {
            pdfList.insertBefore(dragging, afterEl);
        }
    });

    function getDragAfterElement(container, y) {
        const elements = [...container.querySelectorAll('li:not(.dragging)')];
        return elements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateFileOrder() {
        const ordered = [...pdfList.querySelectorAll('.pdf-name')]
            .map(el => el.textContent.trim());
        files = ordered.map(name =>
            files.find(f => f.endsWith(name))
        );
    }

    function clearAll() {
        // Clean up all list items
        const allItems = [...pdfList.querySelectorAll('li')];
        allItems.forEach(li => cleanupListItem(li));

        files = [];
        pdfList.innerHTML = '';
        listItemCleanup.clear();
    }

    // Return cleanup function so parent can call it when view is destroyed
    function destroy() {
        clearAll();
        pdfList.remove();
    }

    return {
        pdfList,
        addFiles,
        clearAll,
        getFiles: () => files,
        destroy // Expose destroy method
    };
}

// Moved from pdfUtils.js
async function renderThumbnail(path, canvas) {
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
function clearCanvas(canvas) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Reset canvas dimensions to free memory
    canvas.width = 0;
    canvas.height = 0;
}