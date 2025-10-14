// src/renderer/utils/customAlert.js

class CustomAlert {
    constructor() {
        this.container = null;
        this.createContainer();
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
                    resolve(buttonText);
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


/*
Example usage:


// Import in the modules
import customAlert from '../utils/customAlert.js';

// Basic usage (replaces alert)
await custom.alert('LocalPDF Studio - Error', 'Something went wrong. Try again.');

// With error message
await custom.alert(
    'LocalPDF Studio - Error', 
    `Something went wrong. Try again.\n${error.message}`, 
    ['OK']
);

// Multiple buttons
const result = await custom.alert(
    'Confirm Action',
    'Are you sure you want to delete this file?',
    ['Cancel', 'Yes, Delete']
);

if (result === 'Yes, Delete') {
    // Perform deletion
}

// Complex scenarios
const action = await custom.alert(
    'Processing Complete',
    'What would you like to do next?',
    ['Open File', 'Show in Folder', 'Close']
);

switch (action) {
    case 'Open File':
        // Open file logic
        break;
    case 'Show in Folder':
        // Show in folder logic
        break;
    case 'Close':
        // Close logic
        break;
}




*/