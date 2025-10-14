// src/renderer/about/about.js

document.addEventListener('DOMContentLoaded', () => {
    // External link handlers
    const viewSourceBtn = document.getElementById('view-source');
    const starRepoBtn = document.getElementById('star-repo');
    const reportIssueBtn = document.getElementById('report-issue');

    if (viewSourceBtn) {
        viewSourceBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/tooldeck');
        });
    }

    if (starRepoBtn) {
        starRepoBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/tooldeck');
        });
    }

    if (reportIssueBtn) {
        reportIssueBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/tooldeck/issues');
        });
    }

    // Tooltip enhancement
    initializeTooltips();
});

function openExternalLink(url) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

function initializeTooltips() {
    // Tooltips are handled by CSS, but we can add additional functionality here if needed
    const tooltipItems = document.querySelectorAll('[data-tooltip]');

    tooltipItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
        });
    });
}

// Simple alert function that doesn't rely on imports
function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}