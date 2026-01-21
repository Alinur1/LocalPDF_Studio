// src/renderer/utils/themeManager.js

export class ThemeManager {
    static init() {
        // Get saved theme or default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.applyTheme(savedTheme);

        // Listen for system theme changes if using system theme
        if (savedTheme === 'system') {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                this.applyTheme('system');
            });
        }
    }

    static applyTheme(theme) {
        // Remove any existing theme classes
        document.body.classList.remove('light', 'dark');

        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.classList.add(isDark ? 'dark' : 'light');
        } else {
            document.body.classList.add(theme);
        }
    }
}

// Auto-initialize when module loads
ThemeManager.init();