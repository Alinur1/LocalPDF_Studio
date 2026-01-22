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


// src/renderer/tools/imageToPdf/imageToPdf.js

import { API } from "../../api/api.js";
import customAlert from "../../utils/customAlert.js";
import { initializeGlobalDragDropForOCR } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js';
import loadingUI from "../../utils/loading.js";
import { ThemeManager } from "../../utils/themeManager.js";

document.addEventListener("DOMContentLoaded", async () => {
    await API.init();
    await i18n.init();
    ThemeManager.init();

    const selectImagesBtn = document.getElementById("select-images-btn");
    const removeFilesBtn = document.getElementById("remove-files-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");
    const convertBtn = document.getElementById("convert-btn");
    const filesCountEl = document.getElementById("files-count");
    const filesSizeEl = document.getElementById("files-size");
    const previewContainer = document.getElementById("preview-container");
    const imagesGrid = document.getElementById("images-grid");
    const modal = document.getElementById("message-modal");
    const closeModalBtn = modal.querySelector(".close-btn");
    const modalMessage = document.getElementById("modal-message");
    const orientationRadios = document.querySelectorAll('input[name="orientation"]');
    const pageSizeSelect = document.getElementById("page-size");
    const mergeImagesCheckbox = document.getElementById("merge-images");
    const imageQualitySlider = document.getElementById("image-quality");
    const qualityValueDisplay = document.getElementById("quality-value");

    let selectedImages = [];
    let droppedFilePaths = [];
    let draggedIndex = null;

    selectImagesBtn.addEventListener("click", selectImages);
    removeFilesBtn.addEventListener("click", async () => {
        await cleanupDroppedFiles();
        clearAll();
    });
    clearAllBtn.addEventListener("click", async () => {
        await cleanupDroppedFiles();
        clearAll();
    });
    convertBtn.addEventListener("click", convertToPdf);

    imageQualitySlider.addEventListener("input", (e) => {
        qualityValueDisplay.textContent = `${e.target.value}%`;
    });

    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    });

    // Back button with cleanup
    const backButton = document.querySelector('a[href="../../index.html"]');
    if (backButton) {
        backButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFiles();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    // Global drag and drop for images
    initializeGlobalDragDropForOCR({
        onFilesDropped: async (files) => {
            //await cleanupDroppedFiles();

            const imageFiles = files.filter(file => {
                const fileName = file.name || '';
                return /\.(jpg|jpeg|png|bmp|tiff)$/i.test(fileName);
            });

            if (imageFiles.length === 0) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageToPdfJS.dropImageFiles'), [i18n.t('common.ok')]);
                return;
            }

            const processedImages = [];
            for (const file of imageFiles) {
                const buffer = await file.arrayBuffer();
                const result = await window.electronAPI.saveDroppedFile({
                    name: file.name,
                    buffer: buffer
                });

                if (result.success) {
                    droppedFilePaths.push(result.filePath);
                    processedImages.push({
                        path: result.filePath,
                        name: file.name,
                        size: file.size || 0
                    });
                }
            }

            if (processedImages.length > 0) {
                await handleImagesSelected(processedImages);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageToPdfJS.dropValidImages'), [i18n.t('common.ok')]);
        }
    });

    async function selectImages() {
        loadingUI.show(i18n.t('imageToPdfJS.selectingImages'));
        try {
            const files = await window.electronAPI.selectPdfsAndImages();
            if (!files || !files.length) return;

            // Filter only image files
            const imageFiles = files.filter(path => {
                return /\.(jpg|jpeg|png|bmp|tiff)$/i.test(path);
            });

            if (imageFiles.length === 0) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageToPdfJS.selectImages'), [i18n.t('common.ok')]);
                return;
            }

            const images = await Promise.all(imageFiles.map(async (path) => {
                const name = path.split(/[\\/]/).pop();
                const size = await getFileSize(path);
                return { path, name, size };
            }));

            await handleImagesSelected(images);
        } finally {
            loadingUI.hide();
        }
    }

    async function renderImagesPreviews() {
        loadingUI.show(i18n.t('imageToPdfJS.loadingPreviews'));
        previewContainer.style.display = "flex";
        imagesGrid.innerHTML = "";

        for (let i = 0; i < selectedImages.length; i++) {
            const image = selectedImages[i];
            await renderImageItem(image, i);
        }

        loadingUI.hide();
    }

    async function handleImagesSelected(newImages) {
        loadingUI.show(i18n.t('imageToPdfJS.loadingPreviews'));

        // Add only new images (avoid duplicates)
        for (const newImage of newImages) {
            if (!selectedImages.some(img => img.path === newImage.path)) {
                selectedImages.push(newImage);
            }
        }

        if (selectedImages.length === 0) {
            loadingUI.hide();
            return;
        }

        const totalSize = selectedImages.reduce((sum, img) => sum + img.size, 0);
        filesCountEl.textContent = `${selectedImages.length} ${selectedImages.length > 1 ? i18n.t('imageToPdfJS.imagesSelected') : i18n.t('imageToPdfJS.imageSelected')}`;
        filesSizeEl.textContent = `(${(totalSize / 1024 / 1024).toFixed(2)} MB)`;

        selectImagesBtn.style.display = "none";
        document.getElementById("selected-files-info").style.display = "flex";

        previewContainer.style.display = "flex";

        // Render only the newly added images
        const startIndex = selectedImages.length - newImages.length;
        for (let i = startIndex; i < selectedImages.length; i++) {
            const image = selectedImages[i];
            await renderImageItem(image, i);
        }

        convertBtn.disabled = false;
        loadingUI.hide();
    }

    async function renderImageItem(image, index) {
        const itemDiv = document.createElement("div");
        itemDiv.className = "image-item";
        itemDiv.draggable = true;
        itemDiv.dataset.index = index;

        // Image preview
        const imgPreview = document.createElement("img");
        imgPreview.className = "image-preview";
        imgPreview.src = `file://${image.path}`;
        imgPreview.alt = image.name;
        imgPreview.onerror = () => {
            imgPreview.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%231c2833' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23bdc3c7' font-size='14'%3ENo Preview%3C/text%3E%3C/svg%3E";
        };

        // Image info
        const infoDiv = document.createElement("div");
        infoDiv.className = "image-info";

        const nameSpan = document.createElement("span");
        nameSpan.className = "image-name";
        nameSpan.textContent = image.name;
        nameSpan.title = image.name;

        const sizeSpan = document.createElement("span");
        sizeSpan.className = "image-size";
        sizeSpan.textContent = `${(image.size / 1024).toFixed(2)} KB`;

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(sizeSpan);

        // Actions
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "image-actions";

        const orderSpan = document.createElement("span");
        orderSpan.className = "image-order";
        orderSpan.textContent = `#${index + 1}`;

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-image-btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => removeImage(index));

        actionsDiv.appendChild(orderSpan);
        actionsDiv.appendChild(removeBtn);

        // Assemble
        itemDiv.appendChild(imgPreview);
        itemDiv.appendChild(infoDiv);
        itemDiv.appendChild(actionsDiv);

        // Drag events
        itemDiv.addEventListener("dragstart", handleDragStart);
        itemDiv.addEventListener("dragover", handleDragOver);
        itemDiv.addEventListener("drop", handleDrop);
        itemDiv.addEventListener("dragend", handleDragEnd);

        imagesGrid.appendChild(itemDiv);
    }

    function handleDragStart(e) {
        draggedIndex = parseInt(e.currentTarget.dataset.index);
        e.currentTarget.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData('application/x-image-item', draggedIndex);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetIndex = parseInt(e.currentTarget.dataset.index);

        if (draggedIndex !== null && draggedIndex !== targetIndex) {
            // Reorder array
            const [draggedItem] = selectedImages.splice(draggedIndex, 1);
            selectedImages.splice(targetIndex, 0, draggedItem);

            // Re-render
            renderImagesPreviews();
        }
    }

    function handleDragEnd(e) {
        e.currentTarget.classList.remove("dragging");
        draggedIndex = null;
    }

    async function removeImage(index) {
        const removedImage = selectedImages[index];

        // Remove from dropped files if it was dropped
        const droppedIndex = droppedFilePaths.indexOf(removedImage.path);
        if (droppedIndex > -1) {
            try {
                await window.electronAPI.deleteFile(removedImage.path);
                droppedFilePaths.splice(droppedIndex, 1);
            } catch (error) {
                console.error('Error deleting dropped file:', error);
            }
        }

        selectedImages.splice(index, 1);

        if (selectedImages.length === 0) {
            clearAll();
        } else {
            const totalSize = selectedImages.reduce((sum, img) => sum + img.size, 0);
            filesCountEl.textContent = `${selectedImages.length} ${selectedImages.length > 1 ? i18n.t('imageToPdfJS.imagesSelected') : i18n.t('imageToPdfJS.imageSelected')}`;
            filesSizeEl.textContent = `(${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
            await renderImagesPreviews();
        }
    }

    async function convertToPdf() {
        if (!selectedImages || selectedImages.length === 0) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('imageToPdfJS.selectImagesFirst'), [i18n.t('common.ok')]);
            return;
        }

        const orientation = document.querySelector('input[name="orientation"]:checked').value;
        const pageSize = pageSizeSelect.value;
        const mergeAll = mergeImagesCheckbox.checked;
        const quality = parseInt(imageQualitySlider.value);

        try {
            loadingUI.show(i18n.t('imageToPdfJS.convertingPdf'));
            convertBtn.disabled = true;
            convertBtn.textContent = i18n.t('imageToPdfJS.converting');

            // Create FormData
            const formData = new FormData();

            // Add configuration
            formData.append('orientation', orientation);
            formData.append('pageSize', pageSize);
            formData.append('mergeAll', mergeAll);
            formData.append('quality', quality);

            // Add all image files
            for (const image of selectedImages) {
                const response = await fetch(`file://${image.path}`);
                const blob = await response.blob();
                formData.append('images', blob, image.name);
            }

            const endpoint = await API.pdf.imageToPdf;
            const result = await API.request.postFormData(endpoint, formData);

            if (result) {
                if (mergeAll) {
                    // Single PDF file
                    const arrayBuffer = await result.arrayBuffer();
                    const defaultName = "Image to PDF converted.pdf";

                    const saved = await window.electronAPI.savePdfFile(
                        defaultName,
                        arrayBuffer
                    );
                    if (saved) {
                        await customAlert.alert(
                            i18n.t('alerts.success'),
                            i18n.t('imageToPdfJS.successSingleMsg') + `${saved}`,
                            [i18n.t('common.ok')]
                        );
                    }
                    else {
                        await customAlert.alert(i18n.t('alerts.warning'), i18n.t('imageToPdfJS.warningMsg'), [i18n.t('common.ok')]);
                    }
                } else {
                    // Multiple PDF files in a ZIP
                    const arrayBuffer = await result.arrayBuffer();
                    const saved = await window.electronAPI.saveZipFile(
                        "converted_images.zip",
                        arrayBuffer
                    );
                    if (saved) {
                        await customAlert.alert(
                            i18n.t('alerts.success'),
                            i18n.t('imageToPdfJS.successMultipleMsg') + `${saved}`,
                            [i18n.t('common.ok')]
                        );
                    }
                }
            }
        } catch (err) {
            console.error(err);
            await customAlert.alert(i18n.t('alerts.error'), err.message || i18n.t('imageToPdfJS.errorMsg'), [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            convertBtn.disabled = false;
            convertBtn.textContent = i18n.t('imageToPdf.convert-btn');
        }
    }

    async function getFileSize(path) {
        try {
            const info = await window.electronAPI.getFileInfo(path);
            return info.size || 0;
        } catch {
            return 0;
        }
    }

    async function cleanupDroppedFiles() {
        for (const filePath of droppedFilePaths) {
            try {
                await window.electronAPI.deleteFile(filePath);
            } catch (error) {
                console.error('Error cleaning up dropped file:', error);
            }
        }
        droppedFilePaths = [];
    }

    function clearAll(preserveDroppedFilePaths = false) {
        selectedImages = [];
        imagesGrid.innerHTML = "";
        previewContainer.style.display = "none";

        selectImagesBtn.style.display = "block";
        document.getElementById("selected-files-info").style.display = "none";

        convertBtn.disabled = true;

        if (!preserveDroppedFilePaths) {
            droppedFilePaths = [];
        }

        draggedIndex = null;
    }
});