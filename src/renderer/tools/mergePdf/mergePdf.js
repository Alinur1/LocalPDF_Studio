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


// src/renderer/tools/mergePdf/mergePdf.js

import { API } from '../../api/api.js';
import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async() => {
    await i18n.init();
    ThemeManager.init();

    const selectBtn = document.getElementById('select-pdf-btn');
    const mergeBtn = document.getElementById('merge-btn');
    const clearBtn = document.getElementById('clear-btn');
    const listContainer = document.getElementById('pdf-list');
    const { addFiles, clearAll, getFiles, destroy } = createPdfList(listContainer);

    let droppedFilePaths = [];

    selectBtn.addEventListener('click', async () => {
        loadingUI.show(i18n.t('mergePdfJS.selectingPdfs'));
        const selected = await window.electronAPI.selectPdfs();
        if (selected?.length) addFiles(selected);
        loadingUI.hide();
    });

    clearBtn.addEventListener('click', async () => {
        await cleanupDroppedFiles();
        clearAll();
    });

    async function cleanupDroppedFiles() {
        if (droppedFilePaths.length > 0) {
            try {
                for (const filePath of droppedFilePaths) {
                    await window.electronAPI.deleteFile(filePath);
                }
                droppedFilePaths = [];
            } catch (error) {
                console.error('Error cleaning up dropped files:', error);
            }
        }
    }

    mergeBtn.addEventListener('click', async () => {
        const files = getFiles();
        if (!files.length) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('mergePdfJS.selectAtLeastOne'), [i18n.t('common.ok')]);
            return;
        }
        try {
            loadingUI.show(i18n.t('mergePdfJS.mergingPdfs'));
            const mergeEndpoint = await API.pdf.merge;
            const blob = await API.request.post(mergeEndpoint, { files });
            const arrayBuffer = await blob.arrayBuffer();
            const result = await window.electronAPI.saveMergedPdf(arrayBuffer);

            if (result.success) {
                await customAlert.alert(i18n.t('alerts.success'), i18n.t('mergePdfJS.successMsg'), [i18n.t('common.ok')]);
            } else {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('mergePdfJS.cancelledMsg'), [i18n.t('common.ok')]);
            }
        } catch (err) {
            console.error(err);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('mergePdfJS.errorMsg') + err.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
        }
    });

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length === 0) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('mergePdfJS.dropAtLeastOne'), [i18n.t('common.ok')]);
                return;
            }

            // Save all dropped files and track them for cleanup
            const droppedPaths = [];
            for (const file of pdfFiles) {
                const buffer = await file.arrayBuffer();
                const result = await window.electronAPI.saveDroppedFile({
                    name: file.name,
                    buffer: buffer
                });

                if (result.success) {
                    droppedPaths.push(result.filePath);
                } else {
                    await customAlert.alert(i18n.t('alerts.error'), i18n.t('mergePdfJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
                    return;
                }
            }

            // Track the dropped files for cleanup
            droppedFilePaths.push(...droppedPaths);

            // Add all dropped files to the merge list
            if (droppedPaths.length > 0) {
                await addFiles(droppedPaths);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('mergePdfJS.dropPdfFiles'), [i18n.t('common.ok')]);
        }
    });

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFiles();
            window.location.href = '../../index.html';
        });
    }

    window.addEventListener('beforeunload', async () => {
        await cleanupDroppedFiles();
        destroy();
    });
});

function createPdfList(container) {
    const pdfList = document.createElement('ul');
    pdfList.classList.add('pdf-list');
    container.appendChild(pdfList);

    let files = [];
    const listItemCleanup = new Map();

    async function addFiles(paths) {
        loadingUI.show(i18n.t('mergePdfJS.loadingPreview'));
        try {
            const thumbnailPromises = [];

            for (const path of paths) {
                if (files.includes(path)) continue;
                files.push(path);

                const li = document.createElement('li');
                li.draggable = true;

                const thumb = document.createElement('canvas');
                thumb.classList.add('pdf-thumbnail');

                const infoDiv = document.createElement('div');
                infoDiv.classList.add('pdf-info');

                const nameSpan = document.createElement('div');
                nameSpan.classList.add('pdf-name');
                nameSpan.textContent = path.split(/[\\/]/).pop();

                const sizeSpan = document.createElement('div');
                sizeSpan.classList.add('pdf-size');
                infoDiv.append(nameSpan, sizeSpan);

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

                window.electronAPI.getFileInfo(path).then(({ size }) => {
                    sizeSpan.textContent = `${(size / 1024 / 1024).toFixed(2)} MB`;
                });

                thumbnailPromises.push(renderThumbnail(path, thumb));

                const handleDragStart = () => li.classList.add('dragging');
                const handleDragEnd = () => {
                    li.classList.remove('dragging');
                    updateFileOrder();
                };

                li.addEventListener('dragstart', handleDragStart);
                li.addEventListener('dragend', handleDragEnd);

                listItemCleanup.set(li, () => {
                    clearCanvas(thumb);
                    removeBtn.removeEventListener('click', handleRemove);
                    li.removeEventListener('dragstart', handleDragStart);
                    li.removeEventListener('dragend', handleDragEnd);
                    li.replaceChildren();
                });
            }
            await Promise.all(thumbnailPromises);
        } finally {
            loadingUI.hide();
        }
    }

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
        const allItems = [...pdfList.querySelectorAll('li')];
        allItems.forEach(li => cleanupListItem(li));
        files = [];
        pdfList.innerHTML = '';
        listItemCleanup.clear();
    }

    function destroy() {
        clearAll();
        pdfList.remove();
    }

    return {
        pdfList,
        addFiles,
        clearAll,
        getFiles: () => files,
        destroy
    };
}

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
        if (page) {
            page.cleanup();
        }
        if (pdf) {
            await pdf.cleanup();
            await pdf.destroy();
        }
    }
}

function clearCanvas(canvas) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
}