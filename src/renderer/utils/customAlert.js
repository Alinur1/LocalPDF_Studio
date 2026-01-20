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


// src/renderer/utils/customAlert.js

/**
 * Enhanced Custom Alert with internationalization support
 * Returns button indices (0, 1, 2...) instead of text for language-agnostic comparisons
 * 
 * @example
 * // Basic usage (returns index)
 * const result = await customAlert.alert('Title', 'Message', ['Cancel', 'Delete']);
 * if (result === 1) { // Delete button (second button)
 *   // Handle delete
 * }
 * 
 * // With translation
 * const result = await customAlert.alert(
 *   i18n.t('titleKey'),
 *   i18n.t('messageKey'),
 *   [i18n.t('alerts.cancel'), i18n.t('alerts.delete')]
 * );
 * if (result === 1) { // Still works with any language!
 *   // Handle delete
 * }
 * 
 * // Backward compatibility (returns text)
 * const result = await customAlert.alertLegacy('Title', 'Message', ['OK']);
 * if (result === 'OK') { // String comparison still works
 *   // Handle OK
 * }
 */

class CustomAlert {
    constructor() {
        this.container = null;
        this.createContainer();

        // Button index constants (for readability)
        this.BUTTON = {
            // For 1-button alerts
            OK: 0,

            // For 2-button alerts (OK/Cancel pattern)
            OK_CANCEL: {
                OK: 0,
                CANCEL: 1
            },

            // For 2-button alerts (Cancel/Action pattern)
            CANCEL_ACTION: {
                CANCEL: 0,
                ACTION: 1  // DELETE, CLEAR_ALL, etc.
            },

            // For 3-button alerts
            OK_CANCEL_CONTINUE: {
                OK: 0,
                CANCEL: 1,
                CONTINUE: 2
            },

            // Common patterns
            YES_NO: {
                NO: 0,     // Usually first button
                YES: 1     // Usually second button
            },

            SAVE_DISCARD: {
                DISCARD: 0,
                SAVE: 1
            }
        };
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'custom-alert-container';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: system-ui, -apple-system, sans-serif;
        `;
        document.body.appendChild(this.container);
    }

    /**
     * Main alert method - returns button index (0, 1, 2...)
     * @param {string} title - Alert title
     * @param {string} description - Alert message
     * @param {Array} buttons - Array of button texts
     * @returns {Promise<number>} Button index that was clicked
     */
    alert(title, description, buttons = ['OK']) {
        return new Promise((resolve) => {
            // Create modal content
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #2c3e50;
                padding: 1.5rem;
                border-radius: 8px;
                width: 600px;
                max-width: 90vw;
                color: #ecf0f1;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
                position: relative;
            `;

            // Copy button (top right corner)
            const copyButton = document.createElement('button');
            copyButton.innerHTML = '📋';
            copyButton.title = 'Copy message to clipboard';
            copyButton.style.cssText = `
                position: absolute;
                top: 0.5rem;
                right: 0.5rem;
                background: transparent;
                border: none;
                color: #bdc3c7;
                font-size: 1.2rem;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 4px;
                transition: all 0.2s ease;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            copyButton.addEventListener('mouseenter', () => {
                copyButton.style.background = '#34495e';
                copyButton.style.color = '#3498db';
                copyButton.style.transform = 'scale(1.1)';
            });

            copyButton.addEventListener('mouseleave', () => {
                copyButton.style.background = 'transparent';
                copyButton.style.color = '#bdc3c7';
                copyButton.style.transform = 'scale(1)';
            });

            copyButton.addEventListener('click', async () => {
                const textToCopy = `${title}\n\n${description}`;
                try {
                    await navigator.clipboard.writeText(textToCopy);

                    // Visual feedback
                    const originalHTML = copyButton.innerHTML;
                    copyButton.innerHTML = '✅';
                    copyButton.style.color = '#2ecc71';

                    setTimeout(() => {
                        copyButton.innerHTML = originalHTML;
                        copyButton.style.color = '#bdc3c7';
                    }, 2000);

                } catch (err) {
                    // Fallback for older browsers
                    try {
                        const textArea = document.createElement('textarea');
                        textArea.value = textToCopy;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);

                        // Visual feedback for fallback
                        const originalHTML = copyButton.innerHTML;
                        copyButton.innerHTML = '✅';
                        copyButton.style.color = '#2ecc71';

                        setTimeout(() => {
                            copyButton.innerHTML = originalHTML;
                            copyButton.style.color = '#bdc3c7';
                        }, 2000);
                    } catch (fallbackErr) {
                        console.error('Failed to copy text: ', fallbackErr);
                        copyButton.innerHTML = '❌';
                        copyButton.style.color = '#e74c3c';

                        setTimeout(() => {
                            copyButton.innerHTML = '📋';
                            copyButton.style.color = '#bdc3c7';
                        }, 2000);
                    }
                }
            });

            // Header container for title and copy button
            const headerContainer = document.createElement('div');
            headerContainer.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 1rem;
                padding-right: 2rem; /* Space for copy button */
            `;

            // Title
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                margin: 0;
                font-size: 1.3rem;
                color: #ecf0f1;
                flex: 1;
            `;

            headerContainer.appendChild(titleEl);

            // Description
            const descEl = document.createElement('div');
            descEl.textContent = description;
            descEl.style.cssText = `
                margin-bottom: 1.5rem;
                line-height: 1.4;
                white-space: pre-line;
                background: #34495e;
                padding: 1rem;
                border-radius: 6px;
                border-left: 4px solid #3498db;
                max-height: 300px;
                overflow-y: auto;
            `;

            // Buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
            `;

            // Create buttons
            buttons.forEach((buttonText, index) => {
                const button = document.createElement('button');
                button.textContent = buttonText;
                button.style.cssText = `
                    background: ${index === 0 ? '#3498db' : '#34495e'};
                    color: #ecf0f1;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all 0.2s ease;
                    min-width: 80px;
                `;

                button.addEventListener('mouseenter', () => {
                    button.style.background = index === 0 ? '#2980b9' : '#3d566e';
                    button.style.transform = 'translateY(-1px)';
                });

                button.addEventListener('mouseleave', () => {
                    button.style.background = index === 0 ? '#3498db' : '#34495e';
                    button.style.transform = 'translateY(0)';
                });

                button.addEventListener('click', () => {
                    this.hide();
                    resolve(index); // Return button index instead of text
                });

                buttonsContainer.appendChild(button);
            });

            // Assemble modal
            modal.appendChild(copyButton);
            modal.appendChild(headerContainer);
            modal.appendChild(descEl);
            modal.appendChild(buttonsContainer);

            // Clear previous and show new
            this.container.innerHTML = '';
            this.container.appendChild(modal);
            this.show();

            // Focus first action button (not copy button)
            const firstActionButton = buttonsContainer.querySelector('button');
            if (firstActionButton) firstActionButton.focus();
        });
    }

    /**
     * Legacy alert method - returns button text (for backward compatibility)
     * Use this if you're not ready to update your comparisons yet
     */
    alertLegacy(title, description, buttons = ['OK']) {
        return new Promise((resolve) => {
            this.alert(title, description, buttons).then((index) => {
                // Return the button text instead of index
                resolve(buttons[index]);
            });
        });
    }

    /**
     * Quick confirmation dialog with Yes/No buttons
     * Returns: 0 for No (first), 1 for Yes (second)
     */
    confirm(title, description) {
        return this.alert(title, description, ['No', 'Yes']);
    }

    /**
     * Quick OK dialog
     * Returns: 0 for OK
     */
    ok(title, description) {
        return this.alert(title, description, ['OK']);
    }

    /**
     * Quick error dialog with OK button
     */
    error(title, description) {
        return this.alert(title, description, ['OK']);
    }

    /**
     * Quick warning dialog with OK button
     */
    warning(title, description) {
        return this.alert(title, description, ['OK']);
    }

    /**
     * Quick success dialog with OK button
     */
    success(title, description) {
        return this.alert(title, description, ['OK']);
    }

    /**
     * Helper to migrate code from string comparisons to index comparisons
     * Call this method in console to get migration hints
     * @param {string} code - The code snippet to analyze
     */
    static getMigrationHint(code) {
        const hints = [];

        // Check for string comparisons
        const stringComparisons = code.match(/result\s*===?\s*['"]([^'"]+)['"]/g);
        if (stringComparisons) {
            hints.push("⚠️ Found string comparisons. Update to use button indices:");
            stringComparisons.forEach(comp => {
                hints.push(`   Change: ${comp}`);
                hints.push(`   To:     // Check button index instead`);
            });
        }

        // Check for switch statements on result
        if (code.includes('switch (result)') || code.includes('switch(result)')) {
            hints.push("⚠️ Found switch statement on result. Update case values to indices:");
            hints.push("   case 'Delete': → case 1:");
            hints.push("   case 'Cancel': → case 0:");
        }

        if (hints.length === 0) {
            hints.push("✅ Code looks good! Using button indices.");
        }

        return hints.join('\n');
    }

    /**
     * Example patterns for common button layouts
     * @returns {Object} Example patterns
     */
    static getExamplePatterns() {
        return {
            // Pattern 1: OK/Cancel (2 buttons)
            okCancel: {
                buttons: ['OK', 'Cancel'],
                explanation: "result: 0 = OK, 1 = Cancel"
            },

            // Pattern 2: Cancel/Delete (2 buttons)
            cancelDelete: {
                buttons: ['Cancel', 'Delete'],
                explanation: "result: 0 = Cancel, 1 = Delete"
            },

            // Pattern 3: Cancel/Clear All (2 buttons)
            cancelClearAll: {
                buttons: ['Cancel', 'Clear All'],
                explanation: "result: 0 = Cancel, 1 = Clear All"
            },

            // Pattern 4: OK only (1 button)
            okOnly: {
                buttons: ['OK'],
                explanation: "result: 0 = OK (always)"
            },

            // Pattern 5: Three buttons
            threeButtons: {
                buttons: ['OK', 'Cancel', 'Continue Anyway'],
                explanation: "result: 0 = OK, 1 = Cancel, 2 = Continue Anyway"
            }
        };
    }

    show() {
        this.container.style.display = 'flex';
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    hide() {
        this.container.style.display = 'none';
        document.body.style.overflow = '';
        // Restore focus
        setTimeout(() => document.body.focus(), 50);
    }
}

// Create global instance
const customAlert = new CustomAlert();

// Export for module use
export default customAlert;

// Also add to window for global access
window.customAlert = customAlert;

// Add helper to window for easy debugging
window.CustomAlertHelpers = {
    /**
     * Get migration instructions for a file
     */
    migrateFile: function (fileContent) {
        console.log("=== Migration Analysis ===");

        // Find all customAlert calls
        const alertCalls = fileContent.match(/customAlert\.(alert|alertLegacy)\(([\s\S]*?)\)/g);
        if (alertCalls) {
            alertCalls.forEach((call, index) => {
                console.log(`\nCall #${index + 1}: ${call.substring(0, 100)}...`);

                // Check if it's using alertLegacy (backward compatible)
                if (call.includes('alertLegacy')) {
                    console.log("   → Already using alertLegacy (backward compatible)");
                } else {
                    console.log("   → Using alert (returns index)");

                    // Try to guess button count
                    const buttonMatch = call.match(/\[(.*?)\]/);
                    if (buttonMatch) {
                        const buttons = buttonMatch[1].split(',').filter(b => b.trim());
                        console.log(`   → Detected ${buttons.length} button(s)`);

                        if (buttons.length === 2) {
                            console.log("   → Common pattern: result 0 = first button, 1 = second button");
                        }
                    }
                }
            });
        }

        // Find comparisons
        console.log("\n=== String Comparisons Found ===");
        const comparisons = fileContent.match(/result\s*===?\s*['"]([^'"]+)['"]/g);
        if (comparisons) {
            comparisons.forEach(comp => {
                console.log(`   ${comp}`);
                console.log(`   → Change to: // Check button index`);
            });
        } else {
            console.log("   No string comparisons found ✓");
        }

        console.log("\n=== Migration Summary ===");
        console.log("1. Update customAlert.alert() calls to use translated text");
        console.log("2. Change string comparisons to index comparisons (0, 1, 2...)");
        console.log("3. Test each dialog to ensure buttons work correctly");
    },

    /**
     * Show common patterns
     */
    showPatterns: function () {
        const patterns = CustomAlert.getExamplePatterns();
        console.log("=== Common Button Patterns ===");
        Object.keys(patterns).forEach(key => {
            console.log(`\n${key}:`);
            console.log(`  Buttons: ${JSON.stringify(patterns[key].buttons)}`);
            console.log(`  Result:  ${patterns[key].explanation}`);
        });
    }
};


/*
================================================================
EXAMPLES & MIGRATION GUIDE
================================================================

// OLD WAY (returns text - will break with translations)
const result = await customAlert.alert('Title', 'Message', ['Cancel', 'Delete']);
if (result === 'Delete') {
    // delete logic
}

// NEW WAY (returns index - works with any language)
const result = await customAlert.alert('Title', 'Message', ['Cancel', 'Delete']);
if (result === 1) { // Second button (Delete)
    // delete logic
}

// WITH TRANSLATION (recommended)
const result = await customAlert.alert(
    i18n.t('alerts.confirmDelete'),
    i18n.t('alerts.deleteMessage'),
    [i18n.t('alerts.cancel'), i18n.t('alerts.delete')]
);
if (result === 1) { // Still works with any language!
    // delete logic
}

// BACKWARD COMPATIBILITY (if you're not ready to change)
const result = await customAlert.alertLegacy('Title', 'Message', ['OK']);
if (result === 'OK') { // String comparison still works
    // OK logic
}

// QUICK HELPERS
await customAlert.ok('Success', 'Operation completed!'); // Returns 0
await customAlert.error('Error', 'Something went wrong'); // Returns 0
const confirm = await customAlert.confirm('Confirm', 'Are you sure?');
// confirm = 0 (No) or 1 (Yes)

// DEBUGGING HELP
// In browser console:
CustomAlertHelpers.showPatterns();
CustomAlertHelpers.migrateFile(yourFileContent);

// GET MIGRATION HINTS
console.log(CustomAlert.getMigrationHint(`
const result = await customAlert.alert('Title', 'Message', ['Cancel', 'Delete']);
if (result === 'Delete') {
    console.log('Deleted');
}
`));
*/