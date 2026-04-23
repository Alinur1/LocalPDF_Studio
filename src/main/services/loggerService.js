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

const { getDB } = require('../db/sqliteManager');
const queries = require('../db/sqlQueries');

const loggerService = {
    insert: (level, message) => {
        const db = getDB();
        if (!db) return;
        try {
            db.prepare(queries.INSERT_LOG).run(level, message);
        } catch (err) {
            console.error('Logging Service Error:', err);
        }
    },

    fetchAll: () => {
        const db = getDB();
        if (!db) return [];
        try {
            return db.prepare(queries.GET_ALL_LOGS).all();
        } catch (err) {
            console.error('Failed to fetch logs:', err);
            return [];
        }
    },

    clearAll: () => {
        try {
            const db = getDB();
            db.prepare(queries.CLEAR_LOGS).run();
            return true;
        } catch (err) {
            console.error('Failed to clear logs:', err);
            return false;
        }
    }
};

module.exports = loggerService;