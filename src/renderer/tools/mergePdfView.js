//src/renderer/tools/mergePdfView.js

import * as pdfjsLib from '../../pdf/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../pdf/build/pdf.worker.mjs';

export default function createMergePdfView() {
    if (!document.querySelector('#merge-pdf-style')) {
        const link = document.createElement('link');
        link.id = 'merge-pdf-style';
        link.rel = 'stylesheet';
        link.href = './tools/mergePdf.css';
        document.head.appendChild(link);
    }

    const container = document.createElement('div');
    container.classList.add('merge-pdf-container');

    const dropArea = document.createElement('div');
    dropArea.classList.add('drop-area');
    dropArea.textContent = 'Drop PDFs here or click to select';

    const pdfList = document.createElement('ul');
    pdfList.classList.add('pdf-list');

    const mergeBtn = document.createElement('button');
    mergeBtn.classList.add('merge-btn');
    mergeBtn.textContent = 'Merge PDFs';

    const clearBtn = document.createElement('button');
    clearBtn.classList.add('clear-btn');
    clearBtn.textContent = 'Clear All';

    container.append(dropArea, pdfList, mergeBtn, clearBtn);

    let files = [];

    dropArea.addEventListener('click', async () => {
        const selected = await window.electronAPI.selectPdfs();
        if (selected && selected.length) {
            addFiles(selected);
        }
    });

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over');
    });
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        const paths = Array.from(e.dataTransfer.files)
            .filter(f => f.type === 'application/pdf')
            .map(f => f.path);
        if (paths.length) addFiles(paths);
    });

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

            // Load file size + thumbnail
            window.electronAPI.getFileInfo(path).then(({ size }) => {
                sizeSpan.textContent = `${(size / 1024 / 1024).toFixed(2)} MB`;
            });

            renderThumbnail(path, thumb);

            // Dragging
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

    clearBtn.addEventListener('click', () => {
        files = [];
        pdfList.innerHTML = '';
    });

    mergeBtn.addEventListener('click', () => {
        console.log('Merge order:', files);
        // TODO: send to backend
    });

    return container;
}

async function renderThumbnail(path, canvas) {
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
