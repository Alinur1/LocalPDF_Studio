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


// src/renderer/utils/emojiLoader.js

async function resolveEmoji(el) {
    const name = el.getAttribute('data-emoji');
    if (!name || !window.electronAPI?.resolveAsset) return;

    try {
        const resolvedPath = await window.electronAPI.resolveAsset(`icons/emoji/${name}.png`);
        if (!resolvedPath) {
            console.warn(`[EmojiLoader] Could not resolve emoji: ${name}`);
            return;
        }

        const img = document.createElement('img');
        img.src = resolvedPath;
        img.alt = name;
        img.setAttribute('aria-hidden', 'true');

        const width = el.getAttribute('width');
        const height = el.getAttribute('height');
        if (width) img.width = width;
        if (height) img.height = height;

        el.textContent = '';
        el.appendChild(img);

    } catch (err) {
        console.error(`[EmojiLoader] Error loading emoji: ${name}`, err);
    }
}

// For entire page — call once on DOMContentLoaded
export async function loadEmojiImages() {
    const elements = document.querySelectorAll('[data-emoji]');
    for (const el of elements) {
        await resolveEmoji(el);
    }
}

// For dynamically created elements — call after innerHTML is set
export async function loadEmojiImagesIn(rootElement) {
    const elements = rootElement.querySelectorAll('[data-emoji]');
    for (const el of elements) {
        await resolveEmoji(el);
    }
}

/*

import in js file:
import { loadEmojiImages } from './utils/emojiLoader.js';

in DOMContentLoaded:
await loadEmojiImages();
=====================================================================================================
Usage in html files:
<!-- Fixed size -->
<span data-emoji="gear" width="24" height="24"></span>

<!-- Only width, height auto -->
<span data-emoji="palette" width="32"></span>

<!-- No attributes — falls back to CSS .emoji-icon sizing -->
<span data-emoji="lock"></span>
=====================================================================================================
Usage in js files:
import { loadEmojiImagesIn } from "./emojiLoader.js";

someElement.innerHTML = `<span data-emoji="gear" width="20" height="20"></span>`;
await loadEmojiImagesIn(someElement);

*/