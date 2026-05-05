/**
 * LocalPDF Studio - Offline PDF Toolkit
 * ======================================
 * 
 * @author      Md. Alinur Hossain <alinur1160@gmail.com>
 * @license     AGPL 3.0 (GNU Affero General Public License version 3)
 * @website     https://alinur1.github.io/LocalPDF_Studio_Website/
 * @repository  https://github.com/Alinur1/LocalPDF_Studio
 * 
 * Copyright (c) 2025 Md. Alinur Hossain. All rights reserved.
 * 
 * Architecture:
 * - Frontend: Electron + HTML/CSS/JS
 * - Backend: ASP.NET Core Web API, Python
 * - PDF Engine: PdfSharp + Mozilla PDF.js
**/


// src/renderer/utils/clockManager.js
export class ClockManager {
    constructor() {
        this.timeElement = document.getElementById('time');
        this.dateElement = document.getElementById('date');
        this.dayElement = document.getElementById('day');
        this.clockContainer = document.getElementById('clock-container'); // Add this
        this.intervalId = null;
        this.isEnabled = true;

        console.log('ClockManager initialized - Elements found:', {
            time: !!this.timeElement,
            date: !!this.dateElement,
            day: !!this.dayElement,
            clockContainer: !!this.clockContainer
        });

        this.loadSettings();
    }

    loadSettings() {
        const clockEnabled = localStorage.getItem('clockEnabled');
        this.isEnabled = clockEnabled === null ? true : clockEnabled === 'true';
        console.log('Clock enabled setting:', this.isEnabled);

        if (!this.isEnabled && this.clockContainer) {
            this.clockContainer.style.display = 'none';
        }
    }

    start() {
        if (!this.isEnabled) {
            console.log('Clock not enabled, not starting');
            return;
        }

        console.log('Starting clock...');

        // Show clock container when starting
        if (this.clockContainer) {
            this.clockContainer.style.display = 'block';
        }

        this.updateClock();
        this.intervalId = setInterval(() => this.updateClock(), 1000);
    }

    stop() {
        if (this.intervalId) {
            console.log('Stopping clock...');
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Hide clock container when stopping
        if (this.clockContainer && !this.isEnabled) {
            this.clockContainer.style.display = 'none';
        }
    }

    updateClock() {
        if (!this.isEnabled || !this.timeElement || !this.dateElement || !this.dayElement) {
            return;
        }

        try {
            const now = new Date();

            // Format time (06:44 PM)
            const time = now.toLocaleTimeString('en-US', {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit'
            });

            // Format date (17- October - 2025)
            const date = now.toLocaleDateString('en-US', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            }).replace(/,/g, '').replace(/(\d+) (\w+) (\d+)/, '$1- $2 -$3');

            // Format day (Friday)
            const day = now.toLocaleDateString('en-US', { weekday: 'long' });

            this.timeElement.textContent = time;
            this.dateElement.textContent = date;
            this.dayElement.textContent = day;
        } catch (error) {
            console.error('Error updating clock:', error);
        }
    }

    setEnabled(enabled) {
        console.log('Setting clock enabled:', enabled);
        this.isEnabled = enabled;
        localStorage.setItem('clockEnabled', enabled.toString());

        if (enabled) {
            // Show clock container and start
            if (this.clockContainer) {
                this.clockContainer.style.display = 'block';
            }
            this.start();
        } else {
            // Hide clock container and stop
            this.stop();
            if (this.clockContainer) {
                this.clockContainer.style.display = 'none';
            }
        }
    }
}