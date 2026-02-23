// src/renderer/tools/fillablePdfBuilder/fillablePdfBuilder.js

import * as pdfjsLib from '../../../pdf/build/pdf.mjs';
import customAlert from '../../utils/customAlert.js';
import loadingUI from '../../utils/loading.js';
import { initializeGlobalDragDrop } from '../../utils/globalDragDrop.js';
import { ThemeManager } from '../../utils/themeManager.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../pdf/build/pdf.worker.mjs';

document.addEventListener('DOMContentLoaded', async () => {
    ThemeManager.init();

    // ─── Constants ────────────────────────────────────────────────────────
    const PAGE_SIZES = {
        A4:      { width: 595.28, height: 841.89 },
        Letter:  { width: 612,    height: 792 },
        Legal:   { width: 612,    height: 1008 },
        A3:      { width: 841.89, height: 1190.55 },
        A5:      { width: 419.53, height: 595.28 },
    };

    const FIELD_DEFAULTS = {
        text:      { width: 200, height: 24 },
        textarea:  { width: 200, height: 80 },
        checkbox:  { width: 20,  height: 20 },
        radio:     { width: 20,  height: 20 },
        dropdown:  { width: 180, height: 24 },
        date:      { width: 140, height: 24 },
        signature: { width: 220, height: 60 },
        label:     { width: 120, height: 24 },
    };

    const FIELD_LABELS = {
        text: 'Text Field', textarea: 'Text Area', checkbox: 'Checkbox',
        radio: 'Radio', dropdown: 'Dropdown', date: 'Date (text)',
        signature: 'Signature', label: 'Label'
    };

    // ─── State ────────────────────────────────────────────────────────────
    let mode = null;                   // 'blank' | 'existing'
    let pages = [];                    // Array of page data: { fields[], pdfPageIndex, width, height }
    let currentPageIndex = 0;
    let fields = [];                   // All fields across all pages
    let selectedFieldId = null;
    let existingPdfBytes = null;       // ArrayBuffer of original PDF
    let existingPdfDoc = null;         // PDF.js document for rendering only
    let droppedFilePath = null;
    let selectedPdfPath = null;
    let zoom = 1.0;
    let fieldCounter = 0;
    let isDraggingField = false;
    let isResizingField = false;
    let dragOffsetX = 0, dragOffsetY = 0;
    let resizeStartX = 0, resizeStartY = 0;
    let resizeStartW = 0, resizeStartH = 0;
    let pageBackgroundColor = '#ffffff';

    // ─── DOM References ───────────────────────────────────────────────────
    const modeSelection   = document.getElementById('mode-selection');
    const blankSetup      = document.getElementById('blank-setup');
    const existingSetup   = document.getElementById('existing-setup');
    const builderWorkspace = document.getElementById('builder-workspace');
    const exportActions   = document.getElementById('export-actions');

    const selectPdfBtn    = document.getElementById('select-pdf-btn');
    const removePdfBtn    = document.getElementById('remove-pdf-btn');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const pdfNameEl       = document.getElementById('pdf-name');
    const pdfSizeEl       = document.getElementById('pdf-size');
    const loadExistingBtn = document.getElementById('load-existing-pdf');

    const pdfRenderCanvas = document.getElementById('pdf-render-canvas');
    const fieldsOverlay   = document.getElementById('fields-overlay');
    const pageCanvasWrapper = document.getElementById('page-canvas-wrapper');
    const pageThumbnails  = document.getElementById('page-thumbnails');
    const canvasPageInfo  = document.getElementById('canvas-page-info');
    const fieldCountLabel = document.getElementById('field-count-label');
    const zoomLevelEl     = document.getElementById('zoom-level');

    const propsEmpty      = document.getElementById('props-empty');
    const propsForm       = document.getElementById('props-form');
    const propsFieldTypeLabel = document.getElementById('props-field-type-label');

    const propName        = document.getElementById('prop-name');
    const propPlaceholder = document.getElementById('prop-placeholder');
    const propDefault     = document.getElementById('prop-default');
    const propFontSize    = document.getElementById('prop-fontsize');
    const propRequired    = document.getElementById('prop-required');
    const propReadonly    = document.getElementById('prop-readonly');
    const propX           = document.getElementById('prop-x');
    const propY           = document.getElementById('prop-y');
    const propW           = document.getElementById('prop-w');
    const propH           = document.getElementById('prop-h');
    const propOptionsGroup = document.getElementById('prop-options-group');
    const propOptions     = document.getElementById('prop-options');
    const propRadioGroup  = document.getElementById('prop-radio-group');
    const propRadioName   = document.getElementById('prop-radio-name');
    const propDefaultGroup = document.getElementById('prop-default-group');

    // ─── Mode Selection ───────────────────────────────────────────────────
    document.getElementById('mode-blank').addEventListener('click', () => {
        showScreen(blankSetup);
    });

    document.getElementById('mode-existing').addEventListener('click', () => {
        showScreen(existingSetup);
    });

    document.getElementById('back-to-mode').addEventListener('click', () => showScreen(modeSelection));
    document.getElementById('back-to-mode-2').addEventListener('click', () => showScreen(modeSelection));

    document.getElementById('back-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        await cleanupDroppedFile();
        window.location.href = '../../index.html';
    });

    function showScreen(screen) {
        [modeSelection, blankSetup, existingSetup].forEach(s => s.style.display = 'none');
        builderWorkspace.style.display = 'none';
        exportActions.style.display = 'none';
        screen.style.display = 'flex';
    }

    // ─── Page background color ────────────────────────────────────────────
    const pageBgColor = document.getElementById('page-bg-color');
    const pageBgPreview = document.getElementById('page-bg-preview');
    pageBgColor.addEventListener('input', (e) => {
        pageBackgroundColor = e.target.value;
        pageBgPreview.style.backgroundColor = e.target.value;
    });

    // ─── Blank Mode Setup ─────────────────────────────────────────────────
    document.getElementById('create-blank').addEventListener('click', () => {
        const sizeKey = document.getElementById('page-size').value;
        const orientation = document.getElementById('page-orientation').value;
        const count = Math.max(1, Math.min(50, parseInt(document.getElementById('page-count').value) || 1));
        let { width, height } = PAGE_SIZES[sizeKey];
        if (orientation === 'landscape') [width, height] = [height, width];

        mode = 'blank';
        pages = [];
        for (let i = 0; i < count; i++) {
            pages.push({ fields: [], pdfPageIndex: i, width, height });
        }
        currentPageIndex = 0;
        fields = [];
        selectedFieldId = null;
        enterBuilder();
    });

    // ─── Existing PDF Setup ───────────────────────────────────────────────
    selectPdfBtn.addEventListener('click', async () => {
        loadingUI.show('Selecting PDF...');
        try {
            const files = await window.electronAPI.selectPdfs();
            if (files && files.length > 0) {
                await handlePdfSelected(files[0]);
            }
        } finally {
            loadingUI.hide();
        }
    });

    removePdfBtn.addEventListener('click', async () => {
        await cleanupDroppedFile();
        selectedPdfPath = null;
        existingPdfDoc = null;
        selectedFileInfo.style.display = 'none';
        selectPdfBtn.style.display = 'block';
        loadExistingBtn.disabled = true;
    });

    async function handlePdfSelected(filePath) {
        try {
            const fileName = filePath.split(/[\\/]/).pop();
            const fileInfo = await window.electronAPI.getFileInfo(filePath);
            pdfNameEl.textContent = fileName;
            pdfSizeEl.textContent = `(${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)`;
            selectPdfBtn.style.display = 'none';
            selectedFileInfo.style.display = 'flex';
            loadExistingBtn.disabled = false;
            selectedPdfPath = filePath;
        } catch (err) {
            await customAlert.alert('Error', 'Failed to read PDF: ' + err.message, ['OK']);
        }
    }

    loadExistingBtn.addEventListener('click', async () => {
        if (!selectedPdfPath) return;
        loadingUI.show('Loading PDF...');
        try {
            const loadingTask = pdfjsLib.getDocument(`file://${selectedPdfPath}`);
            existingPdfDoc = await loadingTask.promise;

            mode = 'existing';
            pages = [];
            fields = [];
            selectedFieldId = null;

            for (let i = 0; i < existingPdfDoc.numPages; i++) {
                const page = await existingPdfDoc.getPage(i + 1);
                const vp = page.getViewport({ scale: 1 });
                pages.push({ fields: [], pdfPageIndex: i, width: vp.width, height: vp.height });
            }
            currentPageIndex = 0;
            enterBuilder();
        } catch (err) {
            await customAlert.alert('Error', 'Failed to load PDF: ' + err.message, ['OK']);
        } finally {
            loadingUI.hide();
        }
    });

    // ─── Enter Builder ────────────────────────────────────────────────────
    function enterBuilder() {
        modeSelection.style.display = 'none';
        blankSetup.style.display = 'none';
        existingSetup.style.display = 'none';
        builderWorkspace.style.display = 'flex';
        exportActions.style.display = 'flex';

        buildPageThumbnails();
        renderCurrentPage();
        updateFieldCount();
        updatePageNav();
    }

    // ─── Page Navigation ──────────────────────────────────────────────────
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            renderCurrentPage();
            updatePageNav();
        }
    });

    document.getElementById('next-page-btn').addEventListener('click', () => {
        if (currentPageIndex < pages.length - 1) {
            currentPageIndex++;
            renderCurrentPage();
            updatePageNav();
        }
    });

    document.getElementById('add-page-btn').addEventListener('click', () => {
        if (mode === 'existing') {
            customAlert.alert('Notice', 'Cannot add pages when editing an existing PDF.', ['OK']);
            return;
        }
        const ref = pages[0] || { width: PAGE_SIZES.A4.width, height: PAGE_SIZES.A4.height };
        pages.push({ fields: [], pdfPageIndex: pages.length, width: ref.width, height: ref.height });
        buildPageThumbnails();
        currentPageIndex = pages.length - 1;
        renderCurrentPage();
        updatePageNav();
    });

    document.getElementById('delete-page-btn').addEventListener('click', async () => {
        if (pages.length <= 1) {
            await customAlert.alert('Notice', 'You must have at least one page.', ['OK']);
            return;
        }
        const result = await customAlert.alert('Delete Page', `Delete page ${currentPageIndex + 1}? All fields on this page will be removed.`, ['Cancel', 'Delete']);
        if (result !== 1) return;

        pages.splice(currentPageIndex, 1);
        if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
        buildPageThumbnails();
        renderCurrentPage();
        updatePageNav();
        updateFieldCount();
    });

    function updatePageNav() {
        canvasPageInfo.textContent = `Page ${currentPageIndex + 1} of ${pages.length}`;
        document.getElementById('prev-page-btn').disabled = currentPageIndex === 0;
        document.getElementById('next-page-btn').disabled = currentPageIndex === pages.length - 1;
        document.querySelectorAll('.page-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === currentPageIndex);
        });
    }

    function buildPageThumbnails() {
        pageThumbnails.innerHTML = '';
        pages.forEach((_, i) => {
            const thumb = document.createElement('button');
            thumb.className = 'page-thumb' + (i === currentPageIndex ? ' active' : '');
            thumb.textContent = `Page ${i + 1}`;
            thumb.addEventListener('click', () => {
                currentPageIndex = i;
                renderCurrentPage();
                updatePageNav();
            });
            pageThumbnails.appendChild(thumb);
        });
    }

    // ─── Zoom ─────────────────────────────────────────────────────────────
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        zoom = Math.min(3.0, zoom + 0.25);
        renderCurrentPage();
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        zoom = Math.max(0.25, zoom - 0.25);
        renderCurrentPage();
    });

    document.getElementById('zoom-fit-btn').addEventListener('click', () => {
        const wrapper = document.getElementById('canvas-scroll-wrapper');
        const page = pages[currentPageIndex];
        if (!page) return;
        const availW = wrapper.clientWidth - 64;
        const availH = wrapper.clientHeight - 64;
        zoom = Math.min(availW / page.width, availH / page.height, 1.5);
        zoom = Math.round(zoom * 4) / 4;
        renderCurrentPage();
    });

    function updateZoomDisplay() {
        zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
    }

    // ─── Render Current Page ──────────────────────────────────────────────
    async function renderCurrentPage() {
        const page = pages[currentPageIndex];
        if (!page) return;

        updateZoomDisplay();
        deselectField();

        const scaledW = Math.round(page.width * zoom);
        const scaledH = Math.round(page.height * zoom);

        pageCanvasWrapper.style.width = scaledW + 'px';
        pageCanvasWrapper.style.height = scaledH + 'px';
        pdfRenderCanvas.width = scaledW;
        pdfRenderCanvas.height = scaledH;

        const ctx = pdfRenderCanvas.getContext('2d');

        if (mode === 'blank') {
            ctx.fillStyle = pageBackgroundColor;
            ctx.fillRect(0, 0, scaledW, scaledH);
        } else if (mode === 'existing' && existingPdfDoc) {
            try {
                const pdfPage = await existingPdfDoc.getPage(page.pdfPageIndex + 1);
                const viewport = pdfPage.getViewport({ scale: zoom });
                await pdfPage.render({ canvasContext: ctx, viewport }).promise;
            } catch (err) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, scaledW, scaledH);
            }
        }

        renderFieldsForPage();
    }

    // ─── Field Rendering ──────────────────────────────────────────────────
    function renderFieldsForPage() {
        fieldsOverlay.innerHTML = '';
        const page = pages[currentPageIndex];
        if (!page) return;

        page.fields.forEach(field => {
            const el = createFieldElement(field);
            fieldsOverlay.appendChild(el);
        });
    }

    function createFieldElement(field) {
        const el = document.createElement('div');
        el.className = 'field-element' + (field.id === selectedFieldId ? ' selected' : '');
        el.dataset.fieldId = field.id;

        el.style.left   = Math.round(field.x * zoom) + 'px';
        el.style.top    = Math.round(field.y * zoom) + 'px';
        el.style.width  = Math.round(field.width * zoom) + 'px';
        el.style.height = Math.round(field.height * zoom) + 'px';

        // Type tag
        const typeTag = document.createElement('div');
        typeTag.className = 'field-type-tag';
        typeTag.textContent = FIELD_LABELS[field.type] || field.type;
        el.appendChild(typeTag);

        // Name tag (not shown for labels — content is shown instead)
        if (field.type === 'label') {
            el.classList.add('field-type-label');
            const contentEl = document.createElement('div');
            contentEl.className = 'field-label-content';
            contentEl.textContent = field.labelContent || 'Label:';
            contentEl.style.fontWeight = field.labelWeight || 'normal';
            contentEl.style.fontSize = (field.fontSize || 12) + 'px';
            el.appendChild(contentEl);
        } else {
            const nameTag = document.createElement('div');
            nameTag.className = 'field-name-tag';
            nameTag.textContent = field.name || '(unnamed)';
            el.appendChild(nameTag);
        }

        // Resize handle
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        el.appendChild(handle);

        // Events
        el.addEventListener('mousedown', (e) => {
            if (e.target === handle) return; // let handle handler take it
            e.stopPropagation();
            selectField(field.id);
            startDrag(e, field);
        });

        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            selectField(field.id);
            startResize(e, field);
        });

        return el;
    }

    // ─── Field Selection ──────────────────────────────────────────────────
    function selectField(id) {
        selectedFieldId = id;
        document.getElementById('delete-field-btn').disabled = false;
        renderFieldsForPage();
        const field = getFieldById(id);
        if (field) showFieldProps(field);
    }

    function deselectField() {
        selectedFieldId = null;
        document.getElementById('delete-field-btn').disabled = true;
        propsEmpty.style.display = 'flex';
        propsForm.style.display = 'none';
    }

    // Click on canvas background to deselect
    pageCanvasWrapper.addEventListener('mousedown', (e) => {
        if (e.target === pdfRenderCanvas || e.target === fieldsOverlay) {
            deselectField();
        }
    });

    // ─── Add Field by clicking palette ───────────────────────────────────
    document.querySelectorAll('.palette-field-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const page = pages[currentPageIndex];
            if (!page) return;

            const defaults = FIELD_DEFAULTS[type];
            const newField = {
                id: `field_${++fieldCounter}`,
                type,
                name: `${type}_${fieldCounter}`,
                placeholder: type === 'date' ? 'DD/MM/YYYY' : '',
                defaultValue: '',
                labelContent: type === 'label' ? 'Label:' : '',
                labelWeight: 'normal',
                fontSize: 12,
                required: false,
                readonly: false,
                options: type === 'dropdown' ? ['Option 1', 'Option 2', 'Option 3'] : [],
                radioGroupName: type === 'radio' ? 'group1' : '',
                // Place in center of current view
                x: Math.max(10, Math.round((page.width / 2) - (defaults.width / 2))),
                y: Math.max(10, Math.round((page.height / 2) - (defaults.height / 2))),
                width: defaults.width,
                height: defaults.height,
                page: currentPageIndex,
            };

            page.fields.push(newField);
            renderFieldsForPage();
            selectField(newField.id);
            updateFieldCount();
        });
    });

    // ─── Delete Field ─────────────────────────────────────────────────────
    document.getElementById('delete-field-btn').addEventListener('click', async () => {
        if (!selectedFieldId) return;
        const result = await customAlert.alert('Delete Field', 'Delete this field?', ['Cancel', 'Delete']);
        if (result !== 1) return;
        removeField(selectedFieldId);
    });

    function removeField(id) {
        const page = pages[currentPageIndex];
        if (!page) return;
        page.fields = page.fields.filter(f => f.id !== id);
        deselectField();
        renderFieldsForPage();
        updateFieldCount();
    }

    // ─── Drag to Move ─────────────────────────────────────────────────────
    function startDrag(e, field) {
        isDraggingField = true;
        const elLeft  = field.x * zoom;
        const elTop   = field.y * zoom;
        const rect    = pageCanvasWrapper.getBoundingClientRect();
        dragOffsetX   = e.clientX - rect.left - elLeft;
        dragOffsetY   = e.clientY - rect.top  - elTop;

        const onMove = (ev) => {
            if (!isDraggingField) return;
            const r = pageCanvasWrapper.getBoundingClientRect();
            const page = pages[currentPageIndex];
            const newX = Math.max(0, Math.min((ev.clientX - r.left - dragOffsetX) / zoom, page.width  - field.width));
            const newY = Math.max(0, Math.min((ev.clientY - r.top  - dragOffsetY) / zoom, page.height - field.height));
            field.x = Math.round(newX);
            field.y = Math.round(newY);
            const el = fieldsOverlay.querySelector(`[data-field-id="${field.id}"]`);
            if (el) {
                el.style.left = Math.round(field.x * zoom) + 'px';
                el.style.top  = Math.round(field.y * zoom) + 'px';
            }
            updatePropsPosition(field);
        };

        const onUp = () => {
            isDraggingField = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ─── Drag to Resize ───────────────────────────────────────────────────
    function startResize(e, field) {
        isResizingField = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = field.width;
        resizeStartH = field.height;

        const onMove = (ev) => {
            if (!isResizingField) return;
            const dx = (ev.clientX - resizeStartX) / zoom;
            const dy = (ev.clientY - resizeStartY) / zoom;
            field.width  = Math.max(20,  Math.round(resizeStartW + dx));
            field.height = Math.max(10, Math.round(resizeStartH + dy));
            const el = fieldsOverlay.querySelector(`[data-field-id="${field.id}"]`);
            if (el) {
                el.style.width  = Math.round(field.width  * zoom) + 'px';
                el.style.height = Math.round(field.height * zoom) + 'px';
            }
            updatePropsPosition(field);
        };

        const onUp = () => {
            isResizingField = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ─── Properties Panel ─────────────────────────────────────────────────
    function showFieldProps(field) {
        propsEmpty.style.display = 'none';
        propsForm.style.display = 'flex';
        propsFieldTypeLabel.textContent = FIELD_LABELS[field.type] || field.type;

        propName.value        = field.name || '';
        propPlaceholder.value = field.placeholder || '';
        propDefault.value     = field.defaultValue || '';
        propFontSize.value    = field.fontSize || 12;
        propRequired.checked  = !!field.required;
        propReadonly.checked  = !!field.readonly;
        propX.value = Math.round(field.x);
        propY.value = Math.round(field.y);
        propW.value = Math.round(field.width);
        propH.value = Math.round(field.height);

        const isLabel = field.type === 'label';
        const isDate  = field.type === 'date';

        // Label-specific
        document.getElementById('prop-label-content-group').style.display = isLabel ? 'block' : 'none';
        document.getElementById('prop-label-weight-group').style.display  = isLabel ? 'block' : 'none';
        document.getElementById('prop-label-content').value = field.labelContent || '';
        document.getElementById('prop-label-weight').value  = field.labelWeight  || 'normal';

        // Date note
        document.getElementById('prop-date-note').style.display = isDate ? 'block' : 'none';

        // Hide name/placeholder/required for labels — they're static text
        document.getElementById('prop-name-group').style.display    = isLabel ? 'none' : 'block';
        document.getElementById('prop-default-group').style.display =
            (isLabel || ['checkbox', 'radio', 'signature'].includes(field.type)) ? 'none' : 'block';

        // Show/hide type-specific panels
        propOptionsGroup.style.display = field.type === 'dropdown' ? 'block' : 'none';
        propRadioGroup.style.display   = field.type === 'radio'    ? 'block' : 'none';

        // Hide required/readonly for labels
        document.querySelector('#prop-required').closest('.option-group').style.display = isLabel ? 'none' : 'block';
        document.querySelector('#prop-readonly').closest('.option-group').style.display = isLabel ? 'none' : 'block';
        document.querySelector('#prop-placeholder').closest('.option-group').style.display = isLabel ? 'none' : 'block';

        if (field.type === 'dropdown') propOptions.value = (field.options || []).join('\n');
        if (field.type === 'radio')    propRadioName.value = field.radioGroupName || '';
    }

    function updatePropsPosition(field) {
        if (selectedFieldId !== field.id) return;
        propX.value = Math.round(field.x);
        propY.value = Math.round(field.y);
        propW.value = Math.round(field.width);
        propH.value = Math.round(field.height);
    }

    // Live property updates
    function bindPropInput(el, key, transform = v => v) {
        el.addEventListener('input', () => {
            const field = getFieldById(selectedFieldId);
            if (!field) return;
            field[key] = transform(el.value);
            if (['name'].includes(key)) {
                const nameTag = fieldsOverlay.querySelector(`[data-field-id="${field.id}"] .field-name-tag`);
                if (nameTag) nameTag.textContent = field.name || '(unnamed)';
            }
        });
    }

    bindPropInput(propName, 'name');
    bindPropInput(propPlaceholder, 'placeholder');
    bindPropInput(propDefault, 'defaultValue');
    bindPropInput(propFontSize, 'fontSize', v => Math.max(6, Math.min(72, parseInt(v) || 12)));
    bindPropInput(propRadioName, 'radioGroupName');

    // Label-specific live bindings
    document.getElementById('prop-label-content').addEventListener('input', (e) => {
        const field = getFieldById(selectedFieldId);
        if (!field || field.type !== 'label') return;
        field.labelContent = e.target.value;
        const contentEl = fieldsOverlay.querySelector(`[data-field-id="${field.id}"] .field-label-content`);
        if (contentEl) contentEl.textContent = field.labelContent || 'Label:';
    });

    document.getElementById('prop-label-weight').addEventListener('change', (e) => {
        const field = getFieldById(selectedFieldId);
        if (!field || field.type !== 'label') return;
        field.labelWeight = e.target.value;
        const contentEl = fieldsOverlay.querySelector(`[data-field-id="${field.id}"] .field-label-content`);
        if (contentEl) contentEl.style.fontWeight = field.labelWeight;
    });

    propRequired.addEventListener('change', () => {
        const f = getFieldById(selectedFieldId); if (f) f.required = propRequired.checked;
    });
    propReadonly.addEventListener('change', () => {
        const f = getFieldById(selectedFieldId); if (f) f.readonly = propReadonly.checked;
    });
    propOptions.addEventListener('input', () => {
        const f = getFieldById(selectedFieldId);
        if (f && f.type === 'dropdown') f.options = propOptions.value.split('\n').map(s => s.trim()).filter(Boolean);
    });

    // Position/size numeric inputs
    [propX, propY, propW, propH].forEach((el, i) => {
        el.addEventListener('input', () => {
            const field = getFieldById(selectedFieldId);
            if (!field) return;
            const val = parseInt(el.value) || 0;
            if (i === 0) field.x = val;
            if (i === 1) field.y = val;
            if (i === 2) field.width  = Math.max(20, val);
            if (i === 3) field.height = Math.max(10, val);
            renderFieldsForPage();
            selectField(field.id);
        });
    });

    // ─── Duplicate Field ──────────────────────────────────────────────────
    document.getElementById('duplicate-field-btn').addEventListener('click', () => {
        const field = getFieldById(selectedFieldId);
        if (!field) return;
        const page = pages[currentPageIndex];
        const copy = JSON.parse(JSON.stringify(field));
        copy.id   = `field_${++fieldCounter}`;
        copy.name = `${field.name}_copy`;
        copy.x    = Math.min(field.x + 20, page.width  - field.width);
        copy.y    = Math.min(field.y + 20, page.height - field.height);
        page.fields.push(copy);
        renderFieldsForPage();
        selectField(copy.id);
        updateFieldCount();
    });

    // ─── Field Count ──────────────────────────────────────────────────────
    function updateFieldCount() {
        const total = pages.reduce((sum, p) => sum + p.fields.length, 0);
        fieldCountLabel.textContent = `${total} field${total !== 1 ? 's' : ''} in this document`;
    }

    // ─── Utility ──────────────────────────────────────────────────────────
    function getFieldById(id) {
        for (const page of pages) {
            const f = page.fields.find(f => f.id === id);
            if (f) return f;
        }
        return null;
    }

    // ─── Template Save/Load ───────────────────────────────────────────────
    document.getElementById('save-template-btn').addEventListener('click', async () => {
        const template = {
            version: 1,
            mode,
            pages: pages.map(p => ({
                width: p.width,
                height: p.height,
                pdfPageIndex: p.pdfPageIndex,
                fields: p.fields
            }))
        };
        const json = JSON.stringify(template, null, 2);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(json);
        const savedPath = await window.electronAPI.saveTextFile('form_template.json', json);
        if (savedPath) {
            await customAlert.alert('Success', 'Template saved to:\n' + savedPath, ['OK']);
        }
    });

    document.getElementById('load-template-btn').addEventListener('click', () => {
        document.getElementById('load-template-input').click();
    });

    document.getElementById('load-template-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const template = JSON.parse(text);
            if (!template.pages) throw new Error('Invalid template file');
            pages = template.pages.map(p => ({
                width: p.width,
                height: p.height,
                pdfPageIndex: p.pdfPageIndex,
                fields: p.fields || []
            }));
            mode = template.mode || 'blank';
            currentPageIndex = 0;
            fieldCounter = pages.reduce((max, p) => {
                p.fields.forEach(f => {
                    const n = parseInt(f.id.split('_')[1]) || 0;
                    if (n > max) max = n;
                });
                return max;
            }, fieldCounter);
            buildPageThumbnails();
            renderCurrentPage();
            updateFieldCount();
            updatePageNav();
            await customAlert.alert('Success', 'Template loaded successfully.', ['OK']);
        } catch (err) {
            await customAlert.alert('Error', 'Failed to load template: ' + err.message, ['OK']);
        }
        e.target.value = '';
    });

    // ─── Export: Build PDF via IPC ────────────────────────────────────────
    async function buildPdf(fillable) {
        const result = await window.electronAPI.buildFillablePdf({
            mode,
            pages: pages.map(p => ({
                width: p.width,
                height: p.height,
                pdfPageIndex: p.pdfPageIndex,
                fields: p.fields,   // includes label fields — main process handles them
            })),
            existingPdfPath: mode === 'existing' ? selectedPdfPath : null,
            fillable,
            pageBackgroundColor
        });

        if (!result.success) throw new Error(result.error);
        return new Uint8Array(result.data);
    }

    // ─── Export Buttons ───────────────────────────────────────────────────
    document.getElementById('export-fillable-btn').addEventListener('click', async () => {
        await exportPdf(true);
    });

    document.getElementById('export-flattened-btn').addEventListener('click', async () => {
        await exportPdf(false);
    });

    async function exportPdf(fillable) {
        const total = pages.reduce((s, p) => s + p.fields.length, 0);
        if (total === 0) {
            await customAlert.alert('No Fields', 'Please add at least one form field before exporting.', ['OK']);
            return;
        }

        loadingUI.show(fillable ? 'Building fillable PDF...' : 'Building flattened PDF...');
        try {
            const pdfBytes = await buildPdf(fillable);
            const suffix   = fillable ? '_fillable' : '_flattened';
            const baseName = mode === 'existing' && pdfNameEl.textContent
                ? pdfNameEl.textContent.replace('.pdf', '')
                : 'form';
            const fileName = `${baseName}${suffix}.pdf`;

            const savedPath = await window.electronAPI.savePdfFile(fileName, pdfBytes.buffer);
            if (savedPath) {
                await customAlert.alert(
                    'Success',
                    `${fillable ? 'Fillable' : 'Flattened'} PDF saved to:\n${savedPath}`,
                    ['OK']
                );
            } else {
                await customAlert.alert('Warning', 'Save was cancelled or failed.', ['OK']);
            }
        } catch (err) {
            console.error('Export error:', err);
            await customAlert.alert('Error', 'Export failed: ' + err.message, ['OK']);
        } finally {
            loadingUI.hide();
        }
    }

    // ─── Drag and Drop ────────────────────────────────────────────────────
    initializeGlobalDragDrop({
        onFilesDropped: async (pdfFiles) => {
            // Only process if we're on the existing-setup screen
            if (existingSetup.style.display === 'none') return;

            if (pdfFiles.length > 1) {
                await customAlert.alert('Notice', 'Please drop one PDF file at a time.', ['OK']);
                return;
            }

            await cleanupDroppedFile();
            const file = pdfFiles[0];
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.saveDroppedFile({ name: file.name, buffer });

            if (result.success) {
                droppedFilePath = result.filePath;
                await handlePdfSelected(result.filePath);
            } else {
                await customAlert.alert('Error', 'Failed to process dropped file: ' + result.error, ['OK']);
            }
        },
        onInvalidFiles: async () => {
            await customAlert.alert('Notice', 'Please drop a valid PDF file.', ['OK']);
        }
    });

    async function cleanupDroppedFile() {
        if (droppedFilePath) {
            try {
                await window.electronAPI.deleteFile(droppedFilePath);
                droppedFilePath = null;
            } catch (err) {
                console.error('Cleanup error:', err);
            }
        }
    }

    // ─── Keyboard shortcuts ───────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (!selectedFieldId) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeField(selectedFieldId);
        }
        if (e.key === 'Escape') {
            deselectField();
        }

        // Arrow key nudge (1px, or 10px with shift)
        const step = e.shiftKey ? 10 : 1;
        const field = getFieldById(selectedFieldId);
        if (!field) return;

        if (e.key === 'ArrowLeft')  { e.preventDefault(); field.x = Math.max(0, field.x - step); }
        if (e.key === 'ArrowRight') { e.preventDefault(); field.x = field.x + step; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); field.y = Math.max(0, field.y - step); }
        if (e.key === 'ArrowDown')  { e.preventDefault(); field.y = field.y + step; }

        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
            renderFieldsForPage();
            selectField(field.id);
        }
    });
});