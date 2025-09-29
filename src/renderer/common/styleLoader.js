// src/renderer/common/styleLoader.js

export function loadStyle(id, href) {
    if (!document.querySelector(`#${id}`)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}
