// src/renderer/about/about.js

document.addEventListener('DOMContentLoaded', () => {
    const viewSourceBtn = document.getElementById('view-source');
    const starRepoBtn = document.getElementById('star-repo');
    const reportIssueBtn = document.getElementById('report-issue');

    if (viewSourceBtn) {
        viewSourceBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio');
        });
    }
    if (starRepoBtn) {
        starRepoBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio');
        });
    }
    if (reportIssueBtn) {
        reportIssueBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio/issues');
        });
    }

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
    const tooltipItems = document.querySelectorAll('[data-tooltip]');
    tooltipItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
        });
    });
}

function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}
