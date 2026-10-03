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


// src/renderer/tools/editMetadata/editMetadata.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import { API } from '../../api/api.js';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import i18n from '../../utils/i18n.js'
import { ThemeManager } from '../../utils/themeManager.js';
import { pathToFileURL } from '../../utils/fileUrl.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';
window.pdfjsLib = pdfjsLib;

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    ThemeManager.init();
    try {
        await API.init();
    } catch (err) {
        console.warn('Backend API not reachable; Deep Clean scan/scrub will be unavailable:', err);
    }

    const selectPdfBtn = document.getElementById('select-pdf-btn');
    const removePdfBtn = document.getElementById('remove-pdf-btn');
    const savePdfBtn = document.getElementById('save-pdf-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl = document.getElementById('pdf-name');
    const pdfSizeEl = document.getElementById('pdf-size');
    const metadataContainer = document.getElementById('metadata-container');
    const editToggleBtn = document.getElementById('edit-toggle-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const saveMetadataBtn = document.getElementById('save-metadata-btn');
    const readonlyView = document.getElementById('readonly-view');
    const editableView = document.getElementById('editable-view');
    const editActions = document.getElementById('edit-actions');
    const sanitizePdfMetadata = document.getElementById('sanitize-metadata-btn');
    const deepCleanContainer = document.getElementById('deep-clean-container');
    const metadataTabs = document.getElementById('metadata-tabs');
    const tabBasic = document.getElementById('tab-basic');
    const tabDeep = document.getElementById('tab-deep');
    const deepScanBtn = document.getElementById('deep-scan-btn');
    const deepResults = document.getElementById('deep-results');
    const deepChecklist = document.getElementById('deep-checklist');
    const deepSelectAll = document.getElementById('deep-select-all');
    const deepWarning = document.getElementById('deep-warning');
    const deepScrubBtn = document.getElementById('deep-scrub-bottom-btn');

    const metaElements = {
        title: document.getElementById('meta-title'),
        author: document.getElementById('meta-author'),
        subject: document.getElementById('meta-subject'),
        keywords: document.getElementById('meta-keywords'),
        creator: document.getElementById('meta-creator'),
        producer: document.getElementById('meta-producer'),
        creationDate: document.getElementById('meta-creation-date'),
        modDate: document.getElementById('meta-mod-date'),
        pageCount: document.getElementById('meta-page-count')
    };

    const formElements = {
        title: document.getElementById('edit-title'),
        author: document.getElementById('edit-author'),
        subject: document.getElementById('edit-subject'),
        keywords: document.getElementById('edit-keywords'),
        creator: document.getElementById('edit-creator'),
        producer: document.getElementById('edit-producer'),
        description: document.getElementById('edit-description')
    };

    let selectedFile = null;
    let droppedFilePath = null;
    let currentFilePath = null;
    let currentMetadata = null;
    let isEditMode = false;
    let hasUnsavedChanges = false;
    let activeTab = 'basic';
    let deepFindings = null;

    // Initialize event listeners
    function initializeEventListeners() {
        selectPdfBtn.addEventListener('click', handleFileSelection);
        removePdfBtn.addEventListener('click', async () => {
            await cleanupDroppedFile();
            clearAll();
        });
        editToggleBtn.addEventListener('click', toggleEditMode);
        cancelEditBtn.addEventListener('click', cancelEdit);
        saveMetadataBtn.addEventListener('click', saveMetadata);
        savePdfBtn.addEventListener('click', savePdfWithMetadata);
        sanitizePdfMetadata.addEventListener('click', sanitizeAndSaveMetadata);
        if (deepScanBtn) deepScanBtn.addEventListener('click', handleDeepScan);
        if (deepSelectAll) deepSelectAll.addEventListener('change', handleDeepSelectAll);
        if (tabBasic) tabBasic.addEventListener('change', () => setActiveTab('basic'));
        if (tabDeep) tabDeep.addEventListener('change', () => setActiveTab('deep'));
        if (deepScrubBtn) deepScrubBtn.addEventListener('click', handleDeepScrub);

        const copyMetadataBtn = document.getElementById('copy-metadata-btn');
        if (copyMetadataBtn) {
            copyMetadataBtn.addEventListener('click', copyMetadataToClipboard);
        }

        Object.values(formElements).forEach(input => {
            if (input) {
                input.addEventListener('input', clearInputError);
            }
        });
    }

    // File selection handler
    async function handleFileSelection() {
        try {
            loadingUI.show(i18n.t('editMetadataJS.selectingPdf'));

            if (window.electronAPI?.selectPdfs) {
                const files = await window.electronAPI.selectPdfs();
                if (files && files.length > 0) {
                    const filePath = files[0];
                    const fileName = filePath.split(/[\\/]/).pop();
                    const fileSize = await getFileSize(filePath);

                    await handleFileSelected({
                        path: filePath,
                        name: fileName,
                        size: fileSize
                    });
                }
            }
        } catch (error) {
            console.error('Error selecting file:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.failedToSelectPdf'), [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
        }
    }

    // Handle selected file
    async function handleFileSelected(fileInfo) {
        try {
            loadingUI.show(i18n.t('editMetadataJS.loadingPdf'));
            clearAll(true);

            const span = editToggleBtn.querySelector('span') || editToggleBtn;
            span.textContent = i18n.t('editMetadata.edit-metadata-btn');

            selectedFile = fileInfo;
            currentFilePath = fileInfo.path;
            pdfNameEl.textContent = fileInfo.name;
            pdfSizeEl.textContent = `(${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)`;
            selectPdfBtn.style.display = 'none';
            selectedFileInfo.style.display = 'flex';

            await loadMetadata();

        } catch (error) {
            console.error('Error loading file:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.failedToReadMetadata'), [i18n.t('common.ok')]);
            clearAll();
        } finally {
            loadingUI.hide();
        }
    }

    // Load metadata using pdf.js
    async function loadMetadata() {
        try {
            loadingUI.show(i18n.t('editMetadataJS.readingMetadata'));
            metadataContainer.style.display = 'block';

            // Set loading state
            Object.values(metaElements).forEach(el => {
                el.textContent = i18n.t('editMetadataJS.loading');
                el.classList.remove('error');
            });

            // Check if pdfjsLib is available
            if (typeof pdfjsLib === 'undefined') {
                throw new Error(i18n.t('editMetadataJS.pdfLibraryNotLoaded'));
            }

            // Load PDF using pdf.js with the shared file URL helper
            const fileUrl = pathToFileURL(currentFilePath);
            const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
            const pdf = await loadingTask.promise;

            // Get metadata
            const metadata = await pdf.getMetadata();
            const info = metadata.info;
            const numPages = pdf.numPages;

            // Extract metadata fields
            currentMetadata = {
                title: info.Title || '',
                author: info.Author || '',
                subject: info.Subject || '',
                keywords: info.Keywords || '',
                creator: info.Creator || '',
                producer: info.Producer || '',
                creationDate: info.CreationDate || null,
                modificationDate: info.ModDate || null,
                pageCount: numPages
            };

            displayMetadata(currentMetadata);
            hasUnsavedChanges = false;
            savePdfBtn.disabled = false;
            resetDeepClean();
            if (metadataTabs) metadataTabs.style.display = '';

        } catch (error) {
            console.error('Error reading metadata:', error);

            let errorMessage = i18n.t('editMetadataJS.failedToReadMetadata');
            if (error.message.includes('PDF.js')) {
                errorMessage = i18n.t('editMetadataJS.pdfLibraryError');
            } else if (error.message.includes('password')) {
                errorMessage = i18n.t('editMetadataJS.passwordProtected');
            } else if (error.message.includes('Invalid')) {
                errorMessage = i18n.t('editMetadataJS.invalidPdf');
            }

            await customAlert.alert(i18n.t('alerts.error'), errorMessage, [i18n.t('common.ok')]);
            displayError(errorMessage);
            savePdfBtn.disabled = true;
        } finally {
            loadingUI.hide();
        }
    }

    async function sanitizeAndSaveMetadata() {
        if (!currentFilePath) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.selectPdfFirst'), [i18n.t('common.ok')]);
            return;
        }

        try {
            // Show confirmation dialog
            const clickedButton = await customAlert.alert(
                i18n.t('alerts.notice'),
                i18n.t('editMetadataJS.confirmSanitize'),
                [i18n.t('editMetadataJS.cancel'), i18n.t('editMetadataJS.removeAllMetadata')]
            );

            if (clickedButton !== 1) {
                return;
            }

            loadingUI.show(i18n.t('editMetadataJS.removingMetadata'));
            sanitizePdfMetadata.disabled = true;
            sanitizePdfMetadata.textContent = i18n.t('editMetadataJS.cleaning');

            // Create metadata object with empty values
            const emptyMetadata = {
                title: '',
                author: '',
                subject: '',
                keywords: '',
                creator: '',
                producer: '',
                description: ''
            };

            // Call the Electron IPC handler to save PDF with empty metadata
            const result = await window.electronAPI.savePdfWithMetadata(currentFilePath, emptyMetadata);

            if (result.success) {
                // Update current metadata to reflect the changes
                currentMetadata = {
                    ...currentMetadata,
                    title: '',
                    author: '',
                    subject: '',
                    keywords: '',
                    creator: '',
                    producer: '',
                    description: '',
                    creationDate: '',
                    modificationDate: ''
                };

                // Update the display
                displayMetadata(currentMetadata);
                hasUnsavedChanges = false;

                await customAlert.alert(
                    i18n.t('alerts.success'),
                    i18n.t('editMetadataJS.sanitizeSuccessMsg') + result.path + "\n\n" + i18n.t('editMetadataJS.sanitizeSuccessEnd'),
                    [i18n.t('common.ok')]
                );
            } else {
                throw new Error(result.error || 'Failed to sanitize PDF metadata');
            }

        } catch (error) {
            console.error('Error sanitizing metadata:', error);
            await customAlert.alert(
                i18n.t('alerts.warning'),
                i18n.t('editMetadataJS.sanitizeFailedMsg') + error.message,
                [i18n.t('common.ok')]
            );
        } finally {
            loadingUI.hide();
            sanitizePdfMetadata.disabled = false;
            sanitizePdfMetadata.textContent = i18n.t('editMetadata.sanitize-metedata-btn');
        }
    }

    // Display metadata in readonly view
    function displayMetadata(metadata) {
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            try {
                // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
                if (typeof dateStr === 'string' && dateStr.startsWith('D:')) {
                    const year = dateStr.substr(2, 4);
                    const month = dateStr.substr(6, 2);
                    const day = dateStr.substr(8, 2);
                    const hour = dateStr.substr(10, 2);
                    const minute = dateStr.substr(12, 2);
                    const second = dateStr.substr(14, 2);
                    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                }
                return dateStr.toString();
            } catch {
                return '';
            }
        };

        // Clear error state
        Object.values(metaElements).forEach(el => {
            el.classList.remove('error');
            el.style.color = '';
        });

        metaElements.title.textContent = metadata.title || '';
        metaElements.author.textContent = metadata.author || '';
        metaElements.subject.textContent = metadata.subject || '';
        metaElements.keywords.textContent = metadata.keywords || '';
        metaElements.creator.textContent = metadata.creator || '';
        metaElements.producer.textContent = metadata.producer || '';
        metaElements.creationDate.textContent = formatDate(metadata.creationDate);
        metaElements.modDate.textContent = formatDate(metadata.modificationDate);
        metaElements.pageCount.textContent = metadata.pageCount || 'Unknown';

        // Populate form fields
        formElements.title.value = metadata.title || '';
        formElements.author.value = metadata.author || '';
        formElements.subject.value = metadata.subject || '';
        formElements.keywords.value = metadata.keywords || '';
        formElements.creator.value = metadata.creator || '';
        formElements.producer.value = metadata.producer || '';
        formElements.description.value = metadata.description || '';
    }

    // Toggle between view and edit mode
    function toggleEditMode() {
        isEditMode = !isEditMode;
        if (isEditMode) {
            readonlyView.style.display = 'none';
            editableView.style.display = 'block';
            editActions.style.display = 'flex';
            const span = editToggleBtn.querySelector('span') || editToggleBtn;
            span.textContent = i18n.t('editMetadata.view-metadata-btn');
            savePdfBtn.disabled = true;
        } else {
            cancelEdit();
        }
    }

    // Cancel editing
    function cancelEdit() {
        isEditMode = false;
        readonlyView.style.display = 'block';
        editableView.style.display = 'none';
        editActions.style.display = 'none';
        const span = editToggleBtn.querySelector('span') || editToggleBtn;
        span.textContent = i18n.t('editMetadata.edit-metadata-btn');
        savePdfBtn.disabled = !hasUnsavedChanges;

        if (currentMetadata) {
            displayMetadata(currentMetadata);
        }
        clearErrors();
    }

    // Save metadata changes (in memory)
    async function saveMetadata() {
        if (!validateForm()) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.formValidationError'), [i18n.t('common.ok')]);
            return;
        }

        try {
            saveMetadataBtn.disabled = true;
            saveMetadataBtn.textContent = i18n.t('editMetadataJS.saving');

            // Update current metadata with form values
            currentMetadata = {
                ...currentMetadata,
                title: formElements.title.value.trim(),
                author: formElements.author.value.trim(),
                subject: formElements.subject.value.trim(),
                keywords: formElements.keywords.value.trim(),
                creator: formElements.creator.value.trim() || 'LocalPDF-Studio',
                producer: formElements.producer.value.trim() || 'LocalPDF-Studio',
                description: formElements.description.value.trim()
            };

            displayMetadata(currentMetadata);
            hasUnsavedChanges = true;

            // Switch back to view mode
            isEditMode = false;
            readonlyView.style.display = 'block';
            editableView.style.display = 'none';
            editActions.style.display = 'none';
            editToggleBtn.textContent = i18n.t('editMetadata.edit-metadata-btn');
            savePdfBtn.disabled = false;

            await customAlert.alert(i18n.t('alerts.success'), i18n.t('editMetadataJS.metadataUpdatedMsg'), [i18n.t('common.ok')]);
        } catch (error) {
            console.error('Error saving metadata:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.failedToSaveMetadata'), [i18n.t('common.ok')]);
        } finally {
            saveMetadataBtn.disabled = false;
            saveMetadataBtn.textContent = i18n.t('editMetadata.save-btn1');
        }
    }

    // Save PDF with updated metadata using Electron
    async function savePdfWithMetadata() {
        if (!currentFilePath || !currentMetadata) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.selectPdfFirst'), [i18n.t('common.ok')]);
            return;
        }

        try {
            loadingUI.show(i18n.t('editMetadataJS.updatingMetadata'));
            savePdfBtn.disabled = true;
            savePdfBtn.textContent = i18n.t('editMetadataJS.saving');

            // Prepare metadata for saving
            const metadataToSave = {
                title: currentMetadata.title || '',
                author: currentMetadata.author || '',
                subject: currentMetadata.subject || '',
                keywords: currentMetadata.keywords || '',
                creator: currentMetadata.creator || 'LocalPDF-Studio',
                producer: currentMetadata.producer || 'LocalPDF-Studio',
                description: currentMetadata.description || ''
            };

            // Call the Electron IPC handler to save metadata
            const result = await window.electronAPI.savePdfWithMetadata(currentFilePath, metadataToSave);

            if (result.success) {
                hasUnsavedChanges = false;
                await customAlert.alert(i18n.t('alerts.success'), i18n.t('editMetadataJS.saveSuccessMsg') + result.path, [i18n.t('common.ok')]);
            } else {
                throw new Error(result.error || 'Failed to save PDF');
            }

        } catch (error) {
            console.error('Error saving PDF:', error);
            await customAlert.alert(i18n.t('alerts.warning'), i18n.t('editMetadataJS.saveFailedMsg') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            savePdfBtn.disabled = false;
            savePdfBtn.textContent = i18n.t('editMetadata.save-btn2');
        }
    }

    // Copy metadata to clipboard
    function copyMetadataToClipboard() {
        if (!currentMetadata) return;

        const formatDate = (dateStr) => {
            if (!dateStr) return 'Not set';
            try {
                if (typeof dateStr === 'string' && dateStr.startsWith('D:')) {
                    const year = dateStr.substr(2, 4);
                    const month = dateStr.substr(6, 2);
                    const day = dateStr.substr(8, 2);
                    const hour = dateStr.substr(10, 2);
                    const minute = dateStr.substr(12, 2);
                    const second = dateStr.substr(14, 2);
                    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                }
                return dateStr.toString();
            } catch {
                return 'Not set';
            }
        };

        const metadataText = `
Title: ${currentMetadata.title || 'Not set'}
Author: ${currentMetadata.author || 'Not set'}
Subject: ${currentMetadata.subject || 'Not set'}
Keywords: ${currentMetadata.keywords || 'Not set'}
Creator: ${currentMetadata.creator || 'Not set'}
Producer: ${currentMetadata.producer || 'Not set'}
Creation Date: ${formatDate(currentMetadata.creationDate)}
Modification Date: ${formatDate(currentMetadata.modificationDate)}
Number of Pages: ${currentMetadata.pageCount || 'Unknown'}
File: ${selectedFile?.name || 'Unknown'}
`.trim();

        navigator.clipboard.writeText(metadataText).then(() => {
            const copyBtn = document.getElementById('copy-metadata-btn');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = i18n.t('editMetadataJS.copiedSuccess');
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.copyFailedMsg'), [i18n.t('common.ok')]);
        });
    }

    // Validation
    function validateForm() {
        let isValid = true;
        const requiredFields = ['author'];

        requiredFields.forEach(field => {
            const input = formElements[field];
            if (input && !input.value.trim()) {
                input.classList.add('error');
                isValid = false;
            }
        });

        return isValid;
    }

    // Clear input error on typing
    function clearInputError(event) {
        if (event.target.classList.contains('error')) {
            event.target.classList.remove('error');
        }
    }

    // Clear all errors
    function clearErrors() {
        Object.values(formElements).forEach(input => {
            if (input && input.classList.contains('error')) {
                input.classList.remove('error');
            }
        });
    }

    // Deep Clean (metadata scrubber)
    const DEEP_CATEGORIES = [
        { key: 'docinfo', titleKey: 'editMetadata.deep-cat-docinfo-title', hintKey: 'editMetadata.deep-cat-docinfo-hint' },
        { key: 'xmp', titleKey: 'editMetadata.deep-cat-xmp-title', hintKey: 'editMetadata.deep-cat-xmp-hint' },
        { key: 'trailer-id', titleKey: 'editMetadata.deep-cat-trailer-id-title', hintKey: 'editMetadata.deep-cat-trailer-id-hint' },
        { key: 'history', titleKey: 'editMetadata.deep-cat-history-title', hintKey: 'editMetadata.deep-cat-history-hint' },
        { key: 'javascript', titleKey: 'editMetadata.deep-cat-javascript-title', hintKey: 'editMetadata.deep-cat-javascript-hint' },
        { key: 'embedded-files', titleKey: 'editMetadata.deep-cat-embedded-files-title', hintKey: 'editMetadata.deep-cat-embedded-files-hint' },
        { key: 'layers', titleKey: 'editMetadata.deep-cat-layers-title', hintKey: 'editMetadata.deep-cat-layers-hint' },
        { key: 'annotations', titleKey: 'editMetadata.deep-cat-annotations-title', hintKey: 'editMetadata.deep-cat-annotations-hint' },
        { key: 'form-fields', titleKey: 'editMetadata.deep-cat-form-fields-title', hintKey: 'editMetadata.deep-cat-form-fields-hint' },
        { key: 'image-metadata', titleKey: 'editMetadata.deep-cat-image-metadata-title', hintKey: 'editMetadata.deep-cat-image-metadata-hint' },
        { key: 'fonts', titleKey: 'editMetadata.deep-cat-fonts-title', hintKey: 'editMetadata.deep-cat-fonts-hint' },
    ];

    function deepCatMeta(key) {
        const entry = DEEP_CATEGORIES.find(c => c.key === key);
        if (!entry) return { title: key, hint: '' };
        return { title: i18n.t(entry.titleKey), hint: i18n.t(entry.hintKey) };
    }

    function setActiveTab(tab) {
        activeTab = tab;
        const isDeep = tab === 'deep';
        if (tabBasic) tabBasic.checked = !isDeep;
        if (tabDeep) tabDeep.checked = isDeep;
        if (metadataContainer) metadataContainer.style.display = isDeep ? 'none' : 'block';
        if (deepCleanContainer) deepCleanContainer.style.display = isDeep ? 'block' : 'none';
        if (savePdfBtn) savePdfBtn.style.display = isDeep ? 'none' : '';
        if (deepScrubBtn) deepScrubBtn.style.display = isDeep ? '' : 'none';
    }

    function resetDeepClean(stayOnTab = false) {
        deepFindings = null;
        if (deepResults) deepResults.style.display = 'none';
        if (deepChecklist) deepChecklist.innerHTML = '';
        if (deepWarning) {
            deepWarning.style.display = 'none';
            deepWarning.textContent = '';
        }
        if (deepSelectAll) {
            deepSelectAll.checked = false;
            deepSelectAll.indeterminate = false;
        }
        if (deepScrubBtn) deepScrubBtn.disabled = true;
        if (!stayOnTab) setActiveTab('basic');
    }
    
    async function handleDeepScan() {
        if (!currentFilePath) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.selectPdfFirst'), [i18n.t('common.ok')]);
            return;
        }
        try {
            loadingUI.show(i18n.t('editMetadataJS.deep-scanning'));
            deepScanBtn.disabled = true;
            const scanEndpoint = await API.pdf.metadataScrubScan;
            const result = await API.request.post(scanEndpoint, { filePath: currentFilePath });
            if (!result || result.success === false) {
                throw new Error((result && result.error) || 'Scan failed.');
            }
            deepFindings = {
                encrypted: !!result.encrypted,
                signed: !!result.signed,
                signatureDetail: result.signatureDetail || '',
                items: Array.isArray(result.findings) ? result.findings : [],
            };
            if (deepFindings.encrypted) {
                await customAlert.alert(
                    i18n.t('alerts.notice'),
                    i18n.t('editMetadataJS.deep-encrypted-scan'),
                    [i18n.t('common.ok')]
                );
                return;
            }
            const anyFound = deepFindings.items.some(item => item.found);
            renderDeepChecklist();
            if (!anyFound) {
                await customAlert.alert(
                    i18n.t('alerts.success'),
                    i18n.t('editMetadataJS.deep-clean-none'),
                    [i18n.t('common.ok')]
                );
            }
        } catch (error) {
            console.error('Error scanning for hidden data:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.deep-scan-failed') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            deepScanBtn.disabled = false;
        }
    }

    function renderDeepChecklist() {
        if (!deepFindings || !deepChecklist || !deepResults) return;
        deepResults.style.display = 'block';
        deepChecklist.innerHTML = '';
        deepFindings.items.forEach(item => {
            const meta = deepCatMeta(item.key);
            const label = document.createElement('label');
            label.className = `deep-item ${item.found ? 'found' : 'clean'}`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.key = item.key;
            checkbox.checked = false;
            checkbox.disabled = !item.found;
            checkbox.addEventListener('change', updateDeepSelectAllState);
            const text = document.createElement('span');
            text.className = 'deep-item-text';
            const title = document.createElement('span');
            title.className = 'deep-item-title';
            title.textContent = meta.title;
            const detail = document.createElement('span');
            detail.className = 'deep-item-detail';
            detail.textContent = item.found ? item.detail : `${i18n.t('editMetadataJS.deep-none-found')}${meta.hint}`;
            text.appendChild(title);
            text.appendChild(detail);
            label.appendChild(checkbox);
            label.appendChild(text);
            deepChecklist.appendChild(label);
        });
        if (deepWarning) {
            if (deepFindings.signed) {
                deepWarning.style.display = 'block';
                deepWarning.textContent = `${i18n.t('editMetadataJS.deep-signed-badge')}${deepFindings.signatureDetail}`;
            } else {
                deepWarning.style.display = 'none';
                deepWarning.textContent = '';
            }
        }
        updateDeepSelectAllState();
    }

    function updateDeepSelectAllState() {
        if (!deepSelectAll || !deepChecklist) return;
        const boxes = Array.from(deepChecklist.querySelectorAll('input[type="checkbox"]:not(:disabled)'));
        const checked = boxes.filter(b => b.checked);
        deepSelectAll.checked = boxes.length > 0 && checked.length === boxes.length;
        deepSelectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
        if (deepScrubBtn) deepScrubBtn.disabled = checked.length === 0;
    }

    function handleDeepSelectAll() {
        if (!deepChecklist) return;
        const boxes = deepChecklist.querySelectorAll('input[type="checkbox"]:not(:disabled)');
        boxes.forEach(box => {
            box.checked = deepSelectAll.checked;
        });
        updateDeepSelectAllState();
    }

    function getSelectedDeepKeys() {
        if (!deepChecklist) return [];
        return Array.from(deepChecklist.querySelectorAll('input[type="checkbox"]:checked')).map(box => box.dataset.key);
    }


    async function handleDeepScrub() {
        const selected = getSelectedDeepKeys();
        if (selected.length === 0) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.deep-select-one'), [i18n.t('common.ok')]);
            return;
        }
        if (!currentFilePath) {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.selectPdfFirst'), [i18n.t('common.ok')]);
            return;
        }
        if (deepFindings && deepFindings.signed) {
            const choice = await customAlert.alert(
                i18n.t('alerts.warning'),
                `${i18n.t('editMetadataJS.deep-signed-msg')}\n\n${deepFindings.signatureDetail}\n\n${i18n.t('editMetadataJS.deep-continue-q')}`,
                [i18n.t('editMetadata.cancel-btn'), i18n.t('editMetadataJS.deep-continue-btn')]
            );
            if (choice !== 1) return;
        }
        try {
            loadingUI.show(i18n.t('editMetadataJS.deep-scrubbing'));
            deepScrubBtn.disabled = true;
            const base = await API.init();
            const res = await fetch(`${base}/PdfMetadataScrubber/scrub`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: currentFilePath, categories: selected }),
            });
            if (!res.ok) {
                let message = `Request failed with status ${res.status}`;
                try {
                    const errJson = await res.json();
                    if (errJson && errJson.error) message = errJson.error;
                } catch { /* keep default message */ }
                if (/ENCRYPTED|password|encrypted/i.test(message)) {
                    await customAlert.alert(
                        i18n.t('alerts.notice'),
                        i18n.t('editMetadataJS.deep-encrypted-scrub'),
                        [i18n.t('common.ok')]
                    );
                    return;
                }
                throw new Error(message);
            }
            let removed = {};
            let notes = [];
            try {
                const header = res.headers.get('X-MetadataScrub-Result');
                if (header) {
                    const parsed = JSON.parse(atob(header));
                    removed = parsed.removed || {};
                    notes = parsed.notes || [];
                }
            } catch (parseErr) {
                console.warn('Could not parse scrub summary header:', parseErr);
            }
            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const defaultName = `${(selectedFile?.name || 'document.pdf').replace(/\.pdf$/i, '')}_deepclean.pdf`;
            const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);
            if (!savedPath) {
                await customAlert.alert(i18n.t('alerts.warning'), i18n.t('editMetadataJS.saveFailedMsg') + i18n.t('editMetadataJS.deep-save-cancelled'), [i18n.t('common.ok')]);
                return;
            }
            const lines = selected.map(key => {
                const label = deepCatMeta(key).title;
                const count = removed[key];
                return `• ${label} — ${typeof count === 'number' ? count : i18n.t('editMetadataJS.deep-removed-fallback')}`;
            });
            let summary = `${i18n.t('editMetadataJS.deep-summary-title')}\n${i18n.t('editMetadataJS.deep-saved-to')}${savedPath}\n\n${lines.join('\n')}\n\n${i18n.t('editMetadataJS.deep-full-rewrite')}`;
            if (notes.length > 0) summary += `\n\n${i18n.t('editMetadataJS.deep-notes')}\n${notes.map(n => `• ${n}`).join('\n')}`;
            await customAlert.alert(i18n.t('alerts.success'), summary, [i18n.t('common.ok')]);
            // Refresh findings so the checklist reflects the cleaned file state on next scan.
            resetDeepClean(true);
        } catch (error) {
            console.error('Error scrubbing PDF:', error);
            await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.deep-scrub-failed') + error.message, [i18n.t('common.ok')]);
        } finally {
            loadingUI.hide();
            deepScrubBtn.disabled = false;
        }
    }

    // Display error message
    function displayError(message) {
        Object.values(metaElements).forEach(el => {
            el.textContent = '';
            el.classList.add('error');
        });
        metaElements.title.textContent = message;
        metaElements.title.style.color = '#e74c3c';
    }

    // Clear all data
    function clearAll(preserveDroppedFilePath = false) {
        selectedFile = null;
        if (!preserveDroppedFilePath) {
            droppedFilePath = null;
        }
        currentFilePath = null;
        currentMetadata = null;
        isEditMode = false;
        hasUnsavedChanges = false;
        resetDeepClean();
        if (deepCleanContainer) deepCleanContainer.style.display = 'none';
        if (metadataTabs) metadataTabs.style.display = 'none';

        selectedFileInfo.style.display = 'none';
        metadataContainer.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        savePdfBtn.disabled = true;

        readonlyView.style.display = 'block';
        editableView.style.display = 'none';
        editActions.style.display = 'none';
        editToggleBtn.textContent = 'Edit Metadata';

        Object.values(metaElements).forEach(el => {
            el.textContent = '';
            el.style.color = '';
            el.classList.remove('error');
        });

        clearErrors();
    }

    // Get file size helper
    async function getFileSize(filePath) {
        try {
            if (window.electronAPI?.getFileInfo) {
                const info = await window.electronAPI.getFileInfo(filePath);
                return info.size || 0;
            }
            return 0;
        } catch {
            return 0;
        }
    }

    async function cleanupDroppedFile() {
        if (droppedFilePath) {
            try {
                await window.electronAPI.deleteFile(droppedFilePath);
                droppedFilePath = null;
            } catch (error) {
                console.error('Error cleaning up dropped file:', error);
            }
        }
    }

    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            if (pdfFiles.length > 1) {
                await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.dropOneFile'), [i18n.t('common.ok')]);
                return;
            }

            await cleanupDroppedFile();

            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({
                name: file.name,
                buffer: buffer
            });

            if (result.success) {
                const fileSize = file.size || 0;
                droppedFilePath = result.filePath;
                await handleFileSelected({
                    path: result.filePath,
                    name: file.name,
                    size: fileSize
                });
            } else {
                await customAlert.alert(i18n.t('alerts.error'), i18n.t('editMetadataJS.failedToSaveDrop') + result.error, [i18n.t('common.ok')]);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert(i18n.t('alerts.notice'), i18n.t('editMetadataJS.dropPdfFile'), [i18n.t('common.ok')]);
        }
    });

    const backBtn = document.querySelector('a[href="../../index.html"]');
    if (backBtn) {
        backBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await cleanupDroppedFile();
            clearAll();
            window.location.href = '../../index.html';
        });
    }

    // Initialize
    initializeEventListeners();
});