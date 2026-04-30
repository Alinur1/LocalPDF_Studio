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


// src/main/services/loggerService.js

const Datastore = require('@seald-io/nedb');
const path = require('path');
const { app } = require('electron');

const logsDB = new Datastore({
    filename: path.join(app.getPath('userData'), 'localpdf-logs.db'),
    autoload: true
});

// Index timestamp for fast pruning and chronological fetching
logsDB.ensureIndex({ fieldName: 'timestamp' });
logsDB.ensureIndex({ fieldName: 'timestamp_iso' });

// Prune logs older than 7 days on startup.
(async () => {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        await logsDB.removeAsync(
            { timestamp_iso: { $lt: cutoff.toISOString() } },
            { multi: true }
        );
    } catch (err) {
        console.error('loggerService: startup prune failed:', err);
    }
})();

// Format the Date like => 29-April-2026 04:52PM
function formatTimestamp(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}-${month}-${year} ${hoursStr}:${minutes}${ampm}`;
}

const loggerService = {
    insert: async (message) => {
        try {
            const now = new Date();
            await logsDB.insertAsync({
                timestamp: formatTimestamp(now),
                timestamp_iso: now.toISOString(),
                message: String(message)
            });
            console.log(`[Log] ${message}`);
        } catch (err) {
            console.error('loggerService.insert error:', err);
        }
    },

    // Return all log entries sorted oldest-first.
    fetchAll: async () => {
        try {
            return await logsDB.findAsync({}).sort({ timestamp: 1 });
        } catch (err) {
            console.error('loggerService.fetchAll error:', err);
            return [];
        }
    },

    // Delete all log entries.
    clearAll: async () => {
        try {
            await logsDB.removeAsync({}, { multi: true });
            return true;
        } catch (err) {
            console.error('loggerService.clearAll error:', err);
            return false;
        }
    }
};

module.exports = loggerService;


/*
Usage example:

In main.js (async context):
    const logger = require('./services/loggerService.js');
    logger.insert("App started, API port: " + apiPort);

In renderer / other JS files (via the IPC bridge):
    localpdfStudio.log("Error occurred at createPdfTab.js: " + err);
*/