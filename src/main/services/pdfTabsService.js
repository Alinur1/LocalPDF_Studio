// src/main/services/pdfTabsService.js

const { getDB } = require('../db/sqliteManager');
const queries = require('../db/sqlQueries');
const logger = require('./loggerService.js');

const pdfTabsService = {

    // Atomically replace every saved tab with the current renderer state.
    saveTabs(tabs, activeTabId) {
        const db = getDB();
        if (!db) return false;

        try {
            const replaceAll = db.transaction(() => {
                db.prepare(queries.DELETE_ALL_TABS).run();

                const upsert = db.prepare(queries.UPSERT_PDF_TAB);
                tabs.forEach(({ tabId, filePath, title, tabOrder }) => {
                    upsert.run(tabId, filePath, title, tabOrder);
                });

                db.prepare(queries.UPSERT_APP_SETTING).run('active_tab_id', activeTabId || null);
            });

            replaceAll();
            return true;
        } catch (err) {
            logger.insert("saveTabs error, pdfTabsService: " + err);
            console.error('pdfTabsService.saveTabs error:', err);
            return false;
        }
    },

    // Returns { tabs: [...], activeTabId } for session restore.
    loadTabs() {
        const db = getDB();
        if (!db) return { tabs: [], activeTabId: null };

        try {
            const tabs = db.prepare(queries.GET_ALL_TABS).all();
            const row = db.prepare(queries.GET_APP_SETTING).get('active_tab_id');
            return {
                tabs: tabs,
                activeTabId: row ? row.value : null
            };
        } catch (err) {
            logger.insert("loadTabs error, pdfTabsService: " + err);
            console.error('pdfTabsService.loadTabs error:', err);
            return { tabs: [], activeTabId: null };
        }
    },

    clearTabs() {
        const db = getDB();
        if (!db) return false;
        try {
            db.prepare(queries.DELETE_ALL_TABS).run();
            return true;
        } catch (err) {
            logger.insert("clearTabs error, pdfTabsService: " + err);
            console.error('pdfTabsService.clearTabs error:', err);
            return false;
        }
    },

    // Add or update an entry in the search index.
    addSearchEntry(filePath) {
        const db = getDB();
        if (!db) return false;

        try {
            const fileName = filePath.split(/[\\/]/).pop();
            const lastOpened = new Date().toISOString();
            db.prepare(queries.UPSERT_SEARCH_ENTRY).run(filePath, fileName, lastOpened);
            return true;
        } catch (err) {
            logger.insert("addSearchEntry error, pdfTabsService: " + err);
            console.error('pdfTabsService.addSearchEntry error:', err);
            return false;
        }
    },

    // Full-text search across file_name and file_path.
    searchFiles(query) {
        const db = getDB();
        if (!db) return [];

        try {
            const like = `%${query}%`;
            return db.prepare(queries.SEARCH_FILES).all(like, like, like);
        } catch (err) {
            logger.insert("searchFiles error, pdfTabsService: " + err);
            console.error('pdfTabsService.searchFiles error:', err);
            return [];
        }
    },

    getAllSearchEntries() {
        const db = getDB();
        if (!db) return [];
        try {
            return db.prepare(queries.GET_ALL_SEARCH_ENTRIES).all();
        } catch (err) {
            logger.insert("getAllSearchEntries error, pdfTabsService: " + err);
            console.error('pdfTabsService.getAllSearchEntries error:', err);
            return [];
        }
    },

    clearSearchIndex() {
        const db = getDB();
        if (!db) return false;
        try {
            db.prepare(queries.CLEAR_SEARCH_INDEX).run();
            return true;
        } catch (err) {
            logger.insert("clearSearchIndex error, pdfTabsService: " + err);
            console.error('pdfTabsService.clearSearchIndex error:', err);
            return false;
        }
    }
};

module.exports = pdfTabsService;