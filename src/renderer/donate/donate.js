// src/renderer/donate/donate.js

document.addEventListener('DOMContentLoaded', () => {
    // Initialize modals and event listeners
    initializeDonationHandlers();
    initializeSupportHandlers();
    initializeQRModal();
    initializeSponsors();
});

function initializeDonationHandlers() {
    // bKash QR Code
    const bkashBtn = document.getElementById('show-bkash-qr');
    if (bkashBtn) {
        bkashBtn.addEventListener('click', () => {
            const modal = document.getElementById('bkash-qr-modal');
            if (modal) {
                modal.classList.remove('hidden');
            }
        });
    }

    // Gumroad
    const gumroadBtn = document.getElementById('gumroad-option')?.querySelector('.donate-btn');
    if (gumroadBtn) {
        gumroadBtn.addEventListener('click', () => {
            const gumroadLink = 'https://alinur3.gumroad.com/coffee';
            openExternalLink(gumroadLink);
        });
    }
}

function initializeSupportHandlers() {
    // Alternative support buttons
    const starBtn = document.getElementById('alt-star');
    if (starBtn) {
        starBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio');
        });
    }

    const shareBtn = document.getElementById('alt-share');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            await shareApp();
        });
    }

    const reportBtn = document.getElementById('alt-report');
    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio/issues');
        });
    }

    const suggestBtn = document.getElementById('alt-suggest');
    if (suggestBtn) {
        suggestBtn.addEventListener('click', () => {
            openExternalLink('https://github.com/Alinur1/LocalPDF_Studio/issues/new?template=feature_request.md');
        });
    }
}

function initializeQRModal() {
    const qrModal = document.getElementById('bkash-qr-modal');
    const qrCloseBtn = document.getElementById('qr-close');

    // Close QR modal
    if (qrCloseBtn) {
        qrCloseBtn.addEventListener('click', () => {
            if (qrModal) {
                qrModal.classList.add('hidden');
            }
        });
    }

    // Close modal when clicking outside
    if (qrModal) {
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) {
                qrModal.classList.add('hidden');
            }
        });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && qrModal && !qrModal.classList.contains('hidden')) {
            qrModal.classList.add('hidden');
        }
    });
}

function openExternalLink(url) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

async function shareApp() {
    const shareText = 'Check out LocalPDF Studio - A complete offline PDF toolkit! Free, open source, and privacy-focused.';
    const shareUrl = 'https://github.com/Alinur1/LocalPDF_Studio';

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'LocalPDF Studio',
                text: shareText,
                url: shareUrl
            });
        } catch (err) {
            console.log('Share cancelled or failed:', err);
            // Fallback to clipboard
            await copyToClipboard(shareText, shareUrl);
        }
    } else {
        // Fallback for desktop
        await copyToClipboard(shareText, shareUrl);
    }
}

async function copyToClipboard(text, url) {
    const fullText = `${text} ${url}`;
    try {
        await navigator.clipboard.writeText(fullText);
        showSimpleAlert('Share link copied to clipboard! 📋\n\nYou can now paste it anywhere to share.');
    } catch (err) {
        showSimpleAlert(`Share this link:\n\n${url}\n\nCopy and share with others!`);
    }
}

function showSimpleAlert(message) {
    if (window.customAlert && window.customAlert.alert) {
        window.customAlert.alert('LocalPDF Studio', message, ['OK']);
    } else {
        alert(message);
    }
}

// Initialize sponsors section (hidden by default)
function initializeSponsors() {
    const sponsorsGrid = document.getElementById('sponsors-grid');
    const noSponsors = document.getElementById('no-sponsors');

    if (sponsorsGrid && noSponsors) {
        // For now, keep sponsors hidden and show "no sponsors" message
        sponsorsGrid.classList.add('hidden');
        noSponsors.classList.remove('hidden');
    }

    // Later, when you have sponsors, you can call:
    // showSponsors(sponsorData);
}

// Function to show sponsors (for future use)
function showSponsors(sponsors) {
    const sponsorsGrid = document.getElementById('sponsors-grid');
    const noSponsors = document.getElementById('no-sponsors');

    if (!sponsorsGrid || !noSponsors) return;

    if (sponsors.length === 0) {
        sponsorsGrid.classList.add('hidden');
        noSponsors.classList.remove('hidden');
        return;
    }

    // Clear existing sponsors
    sponsorsGrid.innerHTML = '';

    // Add each sponsor
    sponsors.forEach(sponsor => {
        const sponsorCard = createSponsorCard(sponsor);
        sponsorsGrid.appendChild(sponsorCard);
    });

    sponsorsGrid.classList.remove('hidden');
    noSponsors.classList.add('hidden');
}

// Function to create sponsor card (for future use)
function createSponsorCard(sponsor) {
    const card = document.createElement('div');
    card.className = 'sponsor-card';

    card.innerHTML = `
        <img src="${sponsor.avatar}" alt="${sponsor.name}" class="sponsor-avatar">
        <h3 class="sponsor-name">${sponsor.name}</h3>
        <p class="sponsor-tier">${sponsor.tier}</p>
        ${sponsor.website ? `<a href="${sponsor.website}" class="sponsor-website">Visit Website</a>` : ''}
    `;

    return card;
}