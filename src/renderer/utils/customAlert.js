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
                width: 400px;
                max-width: 90vw;
                color: #ecf0f1;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            `;

            // Title
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            titleEl.style.cssText = `
                margin: 0 0 1rem 0;
                font-size: 1.3rem;
                color: #ecf0f1;
            `;

            // Description
            const descEl = document.createElement('div');
            descEl.textContent = description;
            descEl.style.cssText = `
                margin-bottom: 1.5rem;
                line-height: 1.4;
                white-space: pre-line;
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
                    transition: background 0.2s;
                `;

                button.addEventListener('mouseenter', () => {
                    button.style.background = index === 0 ? '#2980b9' : '#3d566e';
                });

                button.addEventListener('mouseleave', () => {
                    button.style.background = index === 0 ? '#3498db' : '#34495e';
                });

                button.addEventListener('click', () => {
                    this.hide();
                    resolve(buttonText);
                });

                buttonsContainer.appendChild(button);
            });

            // Assemble modal
            modal.appendChild(titleEl);
            modal.appendChild(descEl);
            modal.appendChild(buttonsContainer);

            // Clear previous and show new
            this.container.innerHTML = '';
            this.container.appendChild(modal);
            this.show();

            // Focus first button
            const firstButton = modal.querySelector('button');
            if (firstButton) firstButton.focus();
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