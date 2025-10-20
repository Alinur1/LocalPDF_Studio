// src/renderer/utils/loading.js

class LoadingUI {
    constructor() {
        this.overlay = null;
        this.loadingCount = 0;
    }

    show(message = 'Loading...') {
        this.loadingCount++;
        if (this.overlay) {
            const messageEl = this.overlay.querySelector('#loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            this.overlay.style.display = 'flex';
            return;
        }

        this.overlay = document.createElement('div');
        this.overlay.id = 'global-loading-overlay';
        this.overlay.className = 'loading-overlay';
        this.overlay.innerHTML = `
            <div class="loading-content">
                <h3 id="loading-message">${message}</h3>
                <div class="loading-spinner"></div>
            </div>
        `;
        document.body.appendChild(this.overlay);
        document.body.classList.add('loading-active');
    }

    hide() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0 && this.overlay) {
            this.overlay.style.display = 'none';
            document.body.classList.remove('loading-active');
        }
    }

    forceHide() {
        this.loadingCount = 0;
        if (this.overlay) {
            this.overlay.style.display = 'none';
            document.body.classList.remove('loading-active');
        }
    }

    async withLoading(message, asyncFunction) {
        this.show(message);
        try {
            const result = await asyncFunction();
            this.hide();
            return result;
        } catch (error) {
            this.forceHide();
            throw error;
        }
    }
}

const loadingUI = new LoadingUI();
export default loadingUI;
