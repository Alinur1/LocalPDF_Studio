// src/renderer/utils/settings.js

export default function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const saveBtn = document.getElementById('save-settings');
    const openSettingsBtn = document.getElementById('open-settings');

    // Open modal
    openSettingsBtn.addEventListener('click', async () => {
        const settings = await window.electronAPI.getSettings();
        document.querySelectorAll('input[name="pdfViewer"]').forEach(radio => {
            radio.checked = (radio.value === settings.pdfViewer);
        });
        modal.style.display = 'flex';
    });

    // Save settings
    saveBtn.addEventListener('click', async () => {
        const selected = document.querySelector('input[name="pdfViewer"]:checked').value;
        await window.electronAPI.setSettings({ pdfViewer: selected });
        modal.style.display = 'none';
        alert("Settings saved successfully!");
    });

    // Close when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}
