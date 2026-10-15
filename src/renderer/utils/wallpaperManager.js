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


// src/renderer/utils/wallpaperManager.js

import { pathToFileURL } from './fileUrl.js';

export const BUILTIN_WALLPAPERS = ['wallpaper-1', 'wallpaper-2', 'wallpaper-3', 'wallpaper-4'];
export const MAX_CUSTOM = 10;

export function getActiveWallpaper() {
    return localStorage.getItem('activeWallpaper') || 'none';
}

export function isCustomId(id) {
    return typeof id === 'string' && id.startsWith('custom:');
}

export function customNameFromId(id) {
    return isCustomId(id) ? id.slice('custom:'.length) : null;
}

export async function listCustomWallpapers() {
    try {
        if (!window.electronAPI?.listWallpapers) return [];
        const list = await window.electronAPI.listWallpapers();
        return Array.isArray(list) ? list : [];
    } catch (err) {
        console.error('listCustomWallpapers error:', err);
        return [];
    }
}

/** Resolve a wallpaper id to a CSS-usable URL, or null for 'none'/missing. */
export function resolveWallpaperUrl(id, customList = []) {
    if (!id || id === 'none') return null;
    if (BUILTIN_WALLPAPERS.includes(id)) return `./wallpapers/${id}.jpg`;
    if (isCustomId(id)) {
        const found = customList.find(w => w.id === id || w.name === customNameFromId(id));
        if (found) return found.fileUrl || pathToFileURL(found.filePath);
        return null; // file was deleted externally
    }
    return null;
}

export function applyWallpaper(id, customList = []) {
    const emptyState = document.getElementById('empty-state');
    if (!emptyState) return;
    const url = resolveWallpaperUrl(id, customList);
    emptyState.style.backgroundImage = url ? `url("${url}")` : 'none';
}

/**
 * Render custom tiles into the grid, just before the + tile.
 * Calls onSelect(id) when a tile is picked, onRemove(name) for the X button.
 */
export function renderCustomTiles(grid, customList, activeId, { onSelect, onRemove } = {}) {
    if (!grid) return;
    grid.querySelectorAll('.wallpaper-option[data-custom]').forEach(el => el.remove());
    const addTile = grid.querySelector('#wallpaper-add');
    for (const item of customList) {
        const tile = document.createElement('div');
        tile.className = 'wallpaper-option' + (activeId === item.id ? ' selected' : '');
        tile.dataset.wallpaper = item.id;
        tile.dataset.custom = 'true';
        tile.title = item.name;
        const url = item.fileUrl || pathToFileURL(item.filePath);
        tile.style.backgroundImage = `url("${url}")`;

        const del = document.createElement('button');
        del.className = 'wallpaper-remove';
        del.title = 'Remove wallpaper';
        del.setAttribute('aria-label', `Remove ${item.name}`);
        del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            onRemove?.(item.name);
        });
        tile.appendChild(del);

        tile.addEventListener('click', () => {
            grid.querySelectorAll('.wallpaper-option').forEach(b => b.classList.remove('selected'));
            tile.classList.add('selected');
            onSelect?.(item.id);
        });
        if (addTile) grid.insertBefore(tile, addTile);
        else grid.appendChild(tile);
    }
}
