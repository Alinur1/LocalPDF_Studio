// src/renderer/about/about.js

document.addEventListener('DOMContentLoaded', () => {
    const viewSourceBtn = document.getElementById('view-source');
    const currentlyWorkingOnBtn = document.getElementById('currently-working-on');
    const starRepoBtn = document.getElementById('star-repo');
    const reportIssueBtn = document.getElementById('report-issue');

    if (viewSourceBtn) {
        viewSourceBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio');
        });
    }
    if (currentlyWorkingOnBtn) {
        currentlyWorkingOnBtn.addEventListener('click', () => {
            openExternalLink('https://docs.google.com/document/d/1wcbxeCYDs7yDEdKZFABC8Jow5mxG0XUqfbuB_fO3-hI/edit?usp=sharing');
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
