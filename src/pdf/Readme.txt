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

===================================================================================================================================
===================================================================================================================================

Important notes:
enableScripting: true - (should stay enabled for signatures to work)
annotationMode: 2 - (keep at 2 for annotation support)
annotationEditorMode: 0 - (keep at 0 for disabled by default)
