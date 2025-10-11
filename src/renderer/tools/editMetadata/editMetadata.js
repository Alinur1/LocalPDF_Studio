// src/renderer/tools/editMetadata/editMetadata.js

import { API } from '../../api/api.js';

document.addEventListener('DOMContentLoaded', async () => {
    await API.init();

    // DOM Elements
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

    // Views
    const readonlyView = document.getElementById('readonly-view');
    const editableView = document.getElementById('editable-view');
    const editActions = document.getElementById('edit-actions');

    // Read-only metadata elements
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

    // Editable form elements
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
    let currentMetadata = null;
    let isEditMode = false;

    function copyMetadataToClipboard() {
        if (!currentMetadata) return;

        const formatDate = (dateString) => {
            if (!dateString) return 'Not set';
            try {
                if (dateString.startsWith('D:')) {
                    const dateStr = dateString.substring(2);
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    const hour = dateStr.substring(8, 10);
                    const minute = dateStr.substring(10, 12);
                    const second = dateStr.substring(12, 14);
                    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                }
                return dateString;
            } catch {
                return dateString;
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

        // Use the modern Clipboard API
        navigator.clipboard.writeText(metadataText).then(() => {
            // Show success feedback
            const copyBtn = document.getElementById('copy-metadata-btn');
            const originalText = copyBtn.textContent;

            copyBtn.textContent = '✅ Copied!';
            copyBtn.classList.add('copied');

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);

        }).catch(err => {
            console.error('Failed to copy metadata: ', err);
            alert('Failed to copy metadata to clipboard. Please try again.');
        });
    }

    // Initialize Event Listeners
    function initializeEventListeners() {
        // File selection
        selectPdfBtn.addEventListener('click', handleFileSelection);
        removePdfBtn.addEventListener('click', clearAll);

        // Edit mode toggles
        editToggleBtn.addEventListener('click', toggleEditMode);
        cancelEditBtn.addEventListener('click', cancelEdit);

        // Save actions
        saveMetadataBtn.addEventListener('click', saveMetadata);
        savePdfBtn.addEventListener('click', savePdfWithMetadata);

        const copyMetadataBtn = document.getElementById('copy-metadata-btn');
        copyMetadataBtn.addEventListener('click', copyMetadataToClipboard);

        // Form input validation
        Object.values(formElements).forEach(input => {
            if (input) {
                input.addEventListener('input', clearInputError);
            }
        });
    }

    // File Selection Handler
    async function handleFileSelection() {
        const files = await window.electronAPI.selectPdfs();
        if (files && files.length > 0) {
            const filePath = files[0];
            const fileName = filePath.split(/[\\/]/).pop();
            const fileSize = await getFileSize(filePath);

            handleFileSelected({
                path: filePath,
                name: fileName,
                size: fileSize
            });
        }
    }

    // Handle File Selected
    async function handleFileSelected(file) {
        clearAll();
        selectedFile = file;

        pdfNameEl.textContent = file.name;
        pdfSizeEl.textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;

        selectPdfBtn.style.display = 'none';
        selectedFileInfo.style.display = 'flex';

        // Load and display metadata
        await loadMetadata(file.path);
    }

    // Load PDF Metadata
    async function loadMetadata(filePath) {
        try {
            metadataContainer.style.display = 'block';

            // Show loading state
            Object.values(metaElements).forEach(el => {
                el.textContent = 'Loading...';
            });

            const requestBody = {
                filePath: filePath,
                operation: 'read'
            };

            const endpoint = await API.pdf.metadata;
            const result = await API.request.post(endpoint, requestBody);

            if (result && result.metadata) {
                currentMetadata = result.metadata;
                displayMetadata(currentMetadata);
                savePdfBtn.disabled = false;
            } else {
                throw new Error('Failed to load metadata');
            }
        } catch (error) {
            console.error('Error loading metadata:', error);
            displayError('Failed to load PDF metadata. The file might be corrupted or encrypted.');
            savePdfBtn.disabled = true;
        }
    }

    // Display Metadata in Read-only View
    function displayMetadata(metadata) {
        // Format dates
        const formatDate = (dateString) => {
            if (!dateString) return 'Not set';
            try {
                // PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
                if (dateString.startsWith('D:')) {
                    const dateStr = dateString.substring(2);
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    const hour = dateStr.substring(8, 10);
                    const minute = dateStr.substring(10, 12);
                    const second = dateStr.substring(12, 14);

                    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
                }
                return dateString;
            } catch {
                return dateString;
            }
        };

        // Update read-only view
        metaElements.title.textContent = metadata.title || '';
        metaElements.author.textContent = metadata.author || '';
        metaElements.subject.textContent = metadata.subject || '';
        metaElements.keywords.textContent = metadata.keywords || '';
        metaElements.creator.textContent = metadata.creator || '';
        metaElements.producer.textContent = metadata.producer || '';
        metaElements.creationDate.textContent = formatDate(metadata.creationDate);
        metaElements.modDate.textContent = formatDate(metadata.modificationDate);
        metaElements.pageCount.textContent = metadata.pageCount || 'Unknown';

        // Populate form fields for edit mode
        formElements.title.value = metadata.title || '';
        formElements.author.value = metadata.author || '';
        formElements.subject.value = metadata.subject || '';
        formElements.keywords.value = metadata.keywords || '';
        formElements.creator.value = metadata.creator || '';
        formElements.producer.value = metadata.producer || '';
        formElements.description.value = metadata.description || '';
    }

    // Toggle Edit Mode
    function toggleEditMode() {
        isEditMode = !isEditMode;

        if (isEditMode) {
            // Switch to edit mode
            readonlyView.style.display = 'none';
            editableView.style.display = 'block';
            editActions.style.display = 'flex';
            editToggleBtn.textContent = 'View Metadata';
            savePdfBtn.disabled = true; // Disable main save until metadata is saved
        } else {
            // Switch back to read-only mode
            cancelEdit();
        }
    }

    // Cancel Edit
    function cancelEdit() {
        isEditMode = false;
        readonlyView.style.display = 'block';
        editableView.style.display = 'none';
        editActions.style.display = 'none';
        editToggleBtn.textContent = 'Edit Metadata';
        savePdfBtn.disabled = false;

        // Reset form to original values
        if (currentMetadata) {
            displayMetadata(currentMetadata);
        }

        clearErrors();
    }

    // Save Metadata (within edit mode)
    async function saveMetadata() {
        if (!validateForm()) {
            alert('Please fill in all required fields correctly.');
            return;
        }

        try {
            saveMetadataBtn.disabled = true;
            saveMetadataBtn.textContent = 'Saving...';

            // Update current metadata with form values
            currentMetadata = {
                ...currentMetadata,
                title: formElements.title.value.trim(),
                author: formElements.author.value.trim(),
                subject: formElements.subject.value.trim(),
                keywords: formElements.keywords.value.trim(),
                creator: formElements.creator.value.trim(),
                producer: formElements.producer.value.trim(),
                description: formElements.description.value.trim()
            };

            // Show success feedback
            displayMetadata(currentMetadata);

            // Switch back to read-only mode
            isEditMode = false;
            readonlyView.style.display = 'block';
            editableView.style.display = 'none';
            editActions.style.display = 'none';
            editToggleBtn.textContent = 'Edit Metadata';
            savePdfBtn.disabled = false;

            // Show success message
            showMessage('Metadata updated successfully! Click "Save PDF with Updated Metadata" to apply changes.', 'success');

        } catch (error) {
            console.error('Error saving metadata:', error);
            alert('Failed to save metadata. Please try again.');
        } finally {
            saveMetadataBtn.disabled = false;
            saveMetadataBtn.textContent = 'Save Metadata';
        }
    }

    // Save PDF with Updated Metadata
    async function savePdfWithMetadata() {
        if (!selectedFile || !currentMetadata) {
            alert('Please select a PDF file first.');
            return;
        }

        try {
            savePdfBtn.disabled = true;
            savePdfBtn.textContent = 'Saving...';

            const requestBody = {
                filePath: selectedFile.path,
                operation: 'write',
                metadata: currentMetadata
            };

            const endpoint = await API.pdf.metadata;
            const result = await API.request.post(endpoint, requestBody);

            if (result instanceof Blob) {
                const arrayBuffer = await result.arrayBuffer();
                const defaultName = selectedFile.name.replace('.pdf', '_updated.pdf');
                const savedPath = await window.electronAPI.savePdfFile(defaultName, arrayBuffer);

                if (savedPath) {
                    showMessage('PDF saved successfully with updated metadata!\nSaved to: ' + savedPath, 'success');
                } else {
                    alert('Operation cancelled or failed to save.');
                }
            } else {
                alert(`Error: ${JSON.stringify(result)}`);
            }
        } catch (error) {
            console.error('Save PDF Error:', error);
            alert(`An error occurred:\n${error.message}`);
        } finally {
            savePdfBtn.disabled = false;
            savePdfBtn.textContent = 'Save PDF with Updated Metadata';
        }
    }

    // Form Validation
    function validateForm() {
        let isValid = true;
        const requiredFields = ['title', 'author']; // Make title and author required

        requiredFields.forEach(field => {
            const input = formElements[field];
            if (input && !input.value.trim()) {
                input.classList.add('error');
                isValid = false;
            }
        });

        return isValid;
    }

    // Clear Input Error State
    function clearInputError(event) {
        if (event.target.classList.contains('error')) {
            event.target.classList.remove('error');
        }
    }

    // Clear All Errors
    function clearErrors() {
        Object.values(formElements).forEach(input => {
            if (input && input.classList.contains('error')) {
                input.classList.remove('error');
            }
        });
    }

    // Display Error Message
    function displayError(message) {
        Object.values(metaElements).forEach(el => {
            el.textContent = 'Error';
            el.style.color = '#e74c3c';
        });
        metaElements.title.textContent = message;
    }

    // Show Message
    function showMessage(message, type = 'info') {
        // Simple message display - you could enhance this with a toast notification
        if (type === 'success') {
            alert('✅ ' + message);
        } else {
            alert('ℹ️ ' + message);
        }
    }

    // Clear All Data
    function clearAll() {
        selectedFile = null;
        currentMetadata = null;
        isEditMode = false;

        selectedFileInfo.style.display = 'none';
        metadataContainer.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        savePdfBtn.disabled = true;

        // Reset views
        readonlyView.style.display = 'block';
        editableView.style.display = 'none';
        editActions.style.display = 'none';
        editToggleBtn.textContent = 'Edit Metadata';

        // Clear metadata display
        Object.values(metaElements).forEach(el => {
            el.textContent = '';
            el.style.color = '';
        });

        clearErrors();
    }

    // Get File Size
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

    // Initialize the application
    initializeEventListeners();
});
