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


// src/renderer/utils/consoleLogger.js

const originalMethods = {
    log: console.log,
    error: console.error,
    warn: console.warn
};

export const initGlobalLogging = () => {
    Object.keys(originalMethods).forEach(level => {
        console[level] = (...args) => {
            const message = args.map(arg => {
                try {
                    return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                } catch (e) {
                    return "[Unserializable Object]";
                }
            }).join(' ');

            if (window.loggerAPI) {
                window.loggerAPI.send(level.toUpperCase(), message);
            }

            originalMethods[level](...args);
        };
    });
};