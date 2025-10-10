// src/renderer/api/api.js

let API_BASE = null;

// Initialize API base URL with dynamic port
async function initializeAPI() {
    if (!API_BASE) {
        const port = await window.electronAPI.getApiPort();
        API_BASE = `http://localhost:${port}/api`;
    }
    return API_BASE;
}

// Generic request wrapper
async function request(endpoint, options = {}) {
    try {
        // Ensure API is initialized
        await initializeAPI();

        const res = await fetch(endpoint, {
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
            ...options,
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || `Request failed with status ${res.status}`);
        }

        // Auto-handle JSON or Blob
        const contentType = res.headers.get("content-type");
        if (contentType?.includes("application/json")) {
            return await res.json();
        } else {
            return await res.blob();
        }
    } catch (err) {
        console.error("API Error:", err);
        throw err;
    }
}

// Convenience methods
const api = {
    get: (endpoint) => request(endpoint, { method: "GET" }),
    post: (endpoint, body) => request(endpoint, { method: "POST", body: JSON.stringify(body) }),
    put: (endpoint, body) => request(endpoint, { method: "PUT", body: JSON.stringify(body) }),
    delete: (endpoint) => request(endpoint, { method: "DELETE" }),
};

// Build endpoint paths dynamically
async function getEndpoints() {
    const base = await initializeAPI();
    return {
        merge: `${base}/PdfMerge/merge`,
        split: `${base}/PdfSplit/split`,
        removePages: `${base}/PdfRemove/remove`,
        organize: `${base}/PdfOrganize/organize`,
        compress: `${base}/PdfCompress/compress`,
        toJpg: `${base}/PdfToImage/convert`,
        addPageNumbers: `${base}/AddPageNumbers/add`,
        addWatermark: `${base}/PdfWatermark/add`,
        crop: `${base}/PdfCrop/crop`,
        // lock: `${base}/pdf/lock`,
        // unlock: `${base}/pdf/unlock`,
        // sign: `${base}/pdf/sign`,
        // metadata: `${base}/pdf/metadata`,
    };
}

export const API = {
    get base() {
        return API_BASE;
    },
    async init() {
        return await initializeAPI();
    },
    get pdf() {
        // Return a proxy that resolves endpoints on access
        return new Proxy({}, {
            get(target, prop) {
                return getEndpoints().then(endpoints => endpoints[prop]);
            }
        });
    },
    request: api,
};
