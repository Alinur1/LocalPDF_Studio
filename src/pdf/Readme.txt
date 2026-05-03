Readme.txt:

In viewer.mjs, change the following value after appying every PDF.js update. Current PDF.js version: v5.4.449

===================================================================================================================================
===================================================================================================================================

From
const DEFAULT_SCALE_VALUE = "auto";
---------------------------------------------------------------

enableSignatureEditor: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  }
---------------------------------------------------------------

enableSignatureEditor: false,

---------------------------------------------------------------

annotationStorage.onSetModified = () => {
      window.addEventListener("beforeunload", beforeUnload);
      this._annotationStorageModified = true;
    };

---------------------------------------------------------------

enableComment: {
  value: false,
  kind: OptionKind.VIEWER + OptionKind.PREFERENCE
},

---------------------------------------------------------------

enableHighlightFloatingButton: {
  value: false,
  kind: OptionKind.VIEWER + OptionKind.PREFERENCE
},

---------------------------------------------------------------

class BasePreferences {
  #defaults = Object.freeze({
    .......
    enableComment: false,
    enableHighlightFloatingButton: false,
    .......

---------------------------------------------------------------

if (isPinchToZoom && supportsPinchToZoom) {
  scaleFactor = this._accumulateFactor(pdfViewer.currentScale, scaleFactor, "_wheelUnusedFactor");
  this.updateZoom(null, scaleFactor, origin);
} else {
  const delta = normalizeWheelEventDirection(evt);
  let ticks = 0;
  if (deltaMode === WheelEvent.DOM_DELTA_LINE || deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    ticks = Math.abs(delta) >= 1 ? Math.sign(delta) : this._accumulateTicks(delta, "_wheelUnusedTicks");
  } else {
    const PIXELS_PER_LINE_SCALE = 30;
    ticks = this._accumulateTicks(delta / PIXELS_PER_LINE_SCALE, "_wheelUnusedTicks");
  }
  this.updateZoom(ticks, null, origin);
}

===================================================================================================================================
===================================================================================================================================

TO
const DEFAULT_SCALE_VALUE = "1.0";
---------------------------------------------------------------

enableSignatureEditor: {
    value: true,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  }
---------------------------------------------------------------

enableSignatureEditor: true,

---------------------------------------------------------------

annotationStorage.onSetModified = () => {
      //window.addEventListener("beforeunload", beforeUnload);
      this._annotationStorageModified = true;
    };

---------------------------------------------------------------

enableComment: {
  value: true,
  kind: OptionKind.VIEWER + OptionKind.PREFERENCE
},

---------------------------------------------------------------

enableHighlightFloatingButton: {
  value: true,
  kind: OptionKind.VIEWER + OptionKind.PREFERENCE
},

---------------------------------------------------------------

class BasePreferences {
  #defaults = Object.freeze({
    .......
    enableComment: true,
    enableHighlightFloatingButton: true,
    .......

---------------------------------------------------------------

if (isPinchToZoom && supportsPinchToZoom) {
  scaleFactor = this._accumulateFactor(pdfViewer.currentScale, scaleFactor, "_wheelUnusedFactor");
  this.updateZoom(null, scaleFactor, origin);
} else {
  const delta = normalizeWheelEventDirection(evt);
  let ticks = 0;
  if (Math.abs(delta) > 0.5) {
    ticks = Math.sign(delta);
  }
  this.updateZoom(ticks, null, origin);
}


===================================================================================================================================
===================================================================================================================================

Important notes:
enableScripting: true - (should stay enabled for signatures to work)
annotationMode: 2 - (keep at 2 for annotation support)
annotationEditorMode: 0 - (keep at 0 for disabled by default)

===================================================================================================================================
===================================================================================================================================

Add this at the very end of viewer.mjs just right before the export:

// LocalPDF Studio — forward Ctrl+W and Ctrl+Tab to parent tab manager
window.addEventListener('keydown', function (e) {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  // Forward Ctrl+W to close tab
  if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'close-active-tab' }, '*');
    }
  }

  // Forward Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab for tab switching
  if (ctrlOrCmd && e.key === 'Tab') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'switch-tab',
        direction: e.shiftKey ? 'previous' : 'next'
      }, '*');
    }
  }
}, true);

// LocalPDF Studio — handle save, print, find, and zoom reset commands from parent
window.addEventListener('message', function (event) {
  if (event.data?.type === 'pdf-save') {
    if (typeof PDFViewerApplication !== 'undefined') {
      PDFViewerApplication.save();
    }
  }
  if (event.data?.type === 'pdf-print') {
    if (typeof PDFViewerApplication !== 'undefined') {
      PDFViewerApplication.triggerPrinting();
    }
  }
  if (event.data?.type === 'pdf-find') {
    if (typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.findBar) {
      PDFViewerApplication.findBar.open();
    }
  }
  if (event.data?.type === 'pdf-zoom-reset') {
    if (typeof PDFViewerApplication !== 'undefined' && PDFViewerApplication.pdfViewer) {
      PDFViewerApplication.pdfViewer.currentScaleValue = '1';
    }
  }
  if (event.data?.type === 'pdf-zoom-in') {
    if (typeof PDFViewerApplication !== 'undefined') {
      PDFViewerApplication.zoomIn();
    }
  }
  if (event.data?.type === 'pdf-zoom-out') {
    if (typeof PDFViewerApplication !== 'undefined') {
      PDFViewerApplication.zoomOut();
    }
  }
});