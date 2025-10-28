// src/renderer/about/about.js

document.addEventListener('DOMContentLoaded', () => {
    fixImagePaths();
    setupButtons();
    initializeTooltips();
});

async function fixImagePaths() {
    if (!window.electronAPI?.resolveAsset) return;
    const images = document.querySelectorAll('img[data-local-asset]');
    for (const img of images) {
        const relativePath = img.getAttribute('data-local-asset');
        if (!relativePath) continue;

        try {
            const resolvedPath = await window.electronAPI.resolveAsset(relativePath);
            if (resolvedPath) {
                img.src = resolvedPath;
            } else {
                console.warn(`Could not resolve asset: ${relativePath}`);
            }
        } catch (err) {
            console.error(`Error resolving asset: ${relativePath}`, err);
        }
    }
}

function setupButtons() {
    const viewSourceBtn = document.getElementById('view-source');
    const currentlyWorkingOnBtn = document.getElementById('currently-working-on');
    const starRepoBtn = document.getElementById('star-repo');
    const reportIssueBtn = document.getElementById('report-issue');

    if (viewSourceBtn) {
        viewSourceBtn.addEventListener('click', () => openExternalLink('https://github.com/Alinur1/LocalPDF_Studio'));
    }
    if (currentlyWorkingOnBtn) {
        currentlyWorkingOnBtn.addEventListener('click', () => openExternalLink('https://docs.google.com/document/d/1wcbxeCYDs7yDEdKZFABC8Jow5mxG0XUqfbuB_fO3-hI/edit?usp=sharing'));
    }
    if (starRepoBtn) {
        starRepoBtn.addEventListener('click', () => openExternalLink('https://github.com/Alinur1/LocalPDF_Studio'));
    }
    if (reportIssueBtn) {
        reportIssueBtn.addEventListener('click', () => openExternalLink('https://github.com/Alinur1/LocalPDF_Studio/issues'));
    }
}

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
        item.addEventListener('click', e => e.preventDefault());
    });
}

function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}
