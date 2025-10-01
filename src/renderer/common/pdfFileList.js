// src/renderer/common/pdfFileList.js

import { renderThumbnail, clearCanvas } from './pdfUtils.js';

export function createPdfList(container) {
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