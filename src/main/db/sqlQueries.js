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


// src/main/db/sqlQueries.js

module.exports = {
    INIT_LOG_TABLE: `
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
            level TEXT,
            message TEXT
        )
    `,
    INSERT_LOG: `INSERT INTO logs (level, message) VALUES (?, ?)`,
    GET_ALL_LOGS: `SELECT * FROM logs ORDER BY timestamp ASC`,
    PRUNE_LOGS: `DELETE FROM logs WHERE timestamp < date('now', '-7 days')`,
    CLEAR_LOGS: `DELETE FROM logs`
};