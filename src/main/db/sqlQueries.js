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
            message TEXT
        )
    `,

    INSERT_LOG: `INSERT INTO logs (message) VALUES (?)`,

    GET_ALL_LOGS: `SELECT * FROM logs ORDER BY timestamp ASC`,

    PRUNE_LOGS: `DELETE FROM logs WHERE timestamp < date('now', '-7 days')`,

    CLEAR_LOGS: `DELETE FROM logs`,

    INIT_PDF_TABS_TABLE: `
        CREATE TABLE IF NOT EXISTS pdf_tabs (
            tab_id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            title TEXT NOT NULL,
            tab_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    `,

    // Active-tab
    INIT_APP_SETTINGS_TABLE: `
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `,

    // Tab CRUD
    UPSERT_PDF_TAB: `
        INSERT INTO pdf_tabs (tab_id, file_path, title, tab_order)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tab_id) DO UPDATE SET
            file_path = excluded.file_path,
            title = excluded.title,
            tab_order = excluded.tab_order
    `,
    DELETE_PDF_TAB: `DELETE FROM pdf_tabs WHERE tab_id = ?`,

    DELETE_ALL_TABS: `DELETE FROM pdf_tabs`,

    GET_ALL_TABS: `SELECT * FROM pdf_tabs ORDER BY tab_order ASC`,

    // App settings (used for active_tab_id)
    UPSERT_APP_SETTING: `
        INSERT INTO app_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,

    GET_APP_SETTING: `SELECT value FROM app_settings WHERE key = ?`,

    INIT_PDF_SEARCH_TABLE: `
        CREATE TABLE IF NOT EXISTS pdf_search_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            file_name TEXT NOT NULL,
            last_opened DATETIME NOT NULL,
            open_count INTEGER NOT NULL DEFAULT 1
        )
    `,

    UPSERT_SEARCH_ENTRY: `
        INSERT INTO pdf_search_index (file_path, file_name, last_opened, open_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(file_path) DO UPDATE SET
            last_opened = excluded.last_opened,
            open_count  = open_count + 1
    `,

    SEARCH_FILES: `
        SELECT file_path, file_name, last_opened, open_count
        FROM pdf_search_index
        WHERE file_name LIKE ? OR file_path LIKE ?
        ORDER BY
            CASE WHEN file_name LIKE ? THEN 0 ELSE 1 END,
            last_opened DESC
        LIMIT 8
    `,

    GET_ALL_SEARCH_ENTRIES: `
        SELECT file_path, file_name, last_opened, open_count
        FROM pdf_search_index
        ORDER BY last_opened DESC
    `,

    CLEAR_SEARCH_INDEX: `DELETE FROM pdf_search_index`,

    PRUNE_SEARCH_INDEX: `
        DELETE FROM pdf_search_index
        WHERE id NOT IN (
            SELECT id FROM pdf_search_index
            ORDER BY last_opened DESC
            LIMIT 500
        )
    `
};