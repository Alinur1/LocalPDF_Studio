// src/renderer/api/api.js

const API_BASE = "http://localhost:5295/api";

// Generic request wrapper
async function request(endpoint, options = {}) {
    try {
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

export const API = {
    base: API_BASE,
    pdf: {
        merge: `${API_BASE}/pdf/merge`,
        // split: `${API_BASE}/pdf/split`,
        // removePages: `${API_BASE}/pdf/remove-pages`,
        // extractPages: `${API_BASE}/pdf/extract`,
        // organize: `${API_BASE}/pdf/organize`,
        // compress: `${API_BASE}/pdf/compress`,
        // toJpg: `${API_BASE}/pdf/to-jpg`,
        // toWord: `${API_BASE}/pdf/to-word`,
        // toPowerPoint: `${API_BASE}/pdf/to-ppt`,
        // toExcel: `${API_BASE}/pdf/to-excel`,
        // addPageNumbers: `${API_BASE}/pdf/add-page-numbers`,
        // watermark: `${API_BASE}/pdf/watermark`,
        // crop: `${API_BASE}/pdf/crop`,
        // lock: `${API_BASE}/pdf/lock`,
        // unlock: `${API_BASE}/pdf/unlock`,
        // sign: `${API_BASE}/pdf/sign`,
        // metadata: `${API_BASE}/pdf/metadata`,
    },
    request: api, // expose wrapper
};
