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


// src/main/db/sqliteManager.js

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const queries = require('./sqlQueries');

let db;

function initDB() {
    const dbPath = path.join(app.getPath('userData'), 'localpdf-studio.db');
    db = new Database(dbPath);

    // Setup table and cleanup old logs
    db.prepare(queries.INIT_LOG_TABLE).run();
    db.prepare(queries.PRUNE_LOGS).run();

    // PDF Tabs + shared settings row
    db.prepare(queries.INIT_PDF_TABS_TABLE).run();
    db.prepare(queries.INIT_APP_SETTINGS_TABLE).run();

    // Search index
    db.prepare(queries.INIT_PDF_SEARCH_TABLE).run();
    db.prepare(queries.PRUNE_SEARCH_INDEX).run();

    return db;
}

function getDB() {
    try
    {
        if (!db) return initDB();
        return db;
    }
    catch (err)
    {
        console.error('CRITICAL: Failed to initialize the database.', err);
        return null;
    }
}

module.exports = { getDB };