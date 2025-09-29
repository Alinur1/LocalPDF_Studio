// src/renderer/common/pdfFileList.js

import { renderThumbnail } from './pdfUtils.js';

export function createPdfList(container) {
    const pdfList = document.createElement('ul');
    pdfList.classList.add('pdf-list');
    container.appendChild(pdfList);

    let files = [];

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

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-btn');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                files = files.filter(f => f !== path);
                li.remove();
                li.replaceChildren();
            });

            li.append(thumb, infoDiv, removeBtn);
            pdfList.appendChild(li);

            // File info
            window.electronAPI.getFileInfo(path).then(({ size }) => {
                sizeSpan.textContent = `${(size / 1024 / 1024).toFixed(2)} MB`;
            });

            // Thumbnail
            renderThumbnail(path, thumb);

            // Reordering
            li.addEventListener('dragstart', () => li.classList.add('dragging'));
            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
                updateFileOrder();
            });
        }
    }

    pdfList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = pdfList.querySelector('.dragging');
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
        files = [];
        pdfList.innerHTML = '';
    }

    return { pdfList, addFiles, clearAll, getFiles: () => files };
}
