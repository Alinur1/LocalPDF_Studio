![LocalPDF Studio](https://github.com/Alinur1/LocalPDF_Studio/blob/main/Screenshots/LPS2.png?raw=true)

# LocalPDF Studio

### Your Complete Offline PDF Toolkit — No Internet. No Uploads. No Compromise.

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/Alinur1/LocalPDF_Studio/total?style=for-the-badge&logo=github&label=Total%20downloads&color=383838&cacheSeconds=10800)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-informational?style=for-the-badge)](https://github.com/Alinur1/LocalPDF_Studio/releases)

---

## Support the Project

If LocalPDF Studio is useful to you, the best thing you can do is **pass it on**.

💖 [Support on Patreon](https://www.patreon.com/cw/MdAlinurHossain?vanity=MdAlinurHossain)

⭐ Leave a review on [AlternativeTo](https://alternativeto.net/software/localpdf-studio/about/)

📣 [Facebook Page](https://web.facebook.com/profile.php?id=61587042059878)

The only thing that keeps a project like this alive is people who believe in what it stands for.

---

## Main author

[Md. Alinur Hossain](https://www.linkedin.com/in/md-alinur-hossain-368240250/)

[Md Shahzad Hussain Rayied](https://www.linkedin.com/in/rayied/)

---

## The Real Cost of Free Tools

Most online PDF tools are free. That's never been the problem.

The problem is *why* they're free.

Every time you upload a document to a random PDF website, your file is processed on servers you don't control — owned by companies whose privacy policies nobody reads. That legal contract you're compressing. That financial statement you're splitting. That medical report you're editing. **Uploaded. Processed. Stored — sometimes indefinitely.**

You're not paying with money. You're paying with your data.

**LocalPDF Studio exists because your files should never have to leave your machine.**

We're not a company. We're not monetizing anything. We're just building for the community because we believe this tool should exist — and that privacy shouldn't be a premium feature.

---

## The Problem

| Online PDF Tools | LocalPDF Studio |
|---|---|
| Files uploaded to third-party servers | Files never leave your machine |
| Privacy policies nobody reads | No policy needed — no data collected |
| Stored indefinitely | Nothing stored, ever |
| Free with hidden costs | Free. Full stop. |
| Telemetry and tracking | Zero telemetry |

---

## The Solution

A fully offline, fully open-source PDF toolkit that runs entirely on your machine.

- **No server.** No upload. No account.
- **No tracking.** No telemetry. No analytics.
- **No catch.** Free forever under AGPL-3.0.

Your files stay local — because they always should have.

---

## Features

### Core PDF Operations
- 📦 **Compress PDFs** — Reduce file size without cloud processing
- 🔀 **Merge PDFs** — Combine multiple files into one
- ✂️ **Split PDFs** — Extract pages or split by range
- ✂️ **Split PDF (Vertical)** — Split pages down the middle
- 🔢 **Extract & Reorder Pages** — Rearrange or pull specific pages
- ✂️ **Crop Pages** — Trim page margins or regions

### Conversion
- 📄 **PDF to PDF/A** — Convert to archival format
- 📝 **PDF to Markdown** — Extract content as structured text
- 🖼️ **PDF Pages to Images** — Export pages as high-quality images
- 🖼️ **Images to PDF** — Bundle images into a single PDF
- 🔍 **OCR** — Make scanned PDFs and images searchable

### Editing & Annotation
- ✏️ **Add Comments, Highlights, Drawings, Text & Signatures** *(Powered by Mozilla PDF.js)*
- 🖊️ **Hand Signatures** — Sign documents locally
- 🖼️ **Basic Image Editor** — Edit embedded images
- 🏗️ **Basic Fillable PDF Builder** — Create simple forms
  - Build fillable PDFs with text fields, checkboxes, and dropdowns
  - Flatten filled forms into a static, non-editable PDF
  - Save and load form templates for reuse

### Privacy & Security
- 🔒 **Lock / Unlock PDFs** — Password protect or remove protection
- ⬛ **Redact PDF Content** — Permanently remove sensitive text or regions
- 🏷️ **Edit or Remove Metadata** — Strip hidden document information
- 🖤 **Grayscale Converter** — Convert to black and white

### Utilities
- 🔢 **Add Page Numbers** — Auto-number pages
- 💧 **Add Watermarks** — Text or image watermarks
- 🖼️ **Extract Images** — Pull embedded images from PDFs
- 📊 **Presentation Mode** — View PDFs fullscreen
- 🌐 **Multi-Language Support** — Available in multiple languages

---

## Impact

- ✅ Protects sensitive documents from third-party exposure
- ✅ Replaces tools you never fully trusted
- ✅ Works in air-gapped, offline, or restricted environments
- ✅ No account or registration wall stopping access
- ✅ Open source — audit every line, fork freely, contribute openly

If this tool protects your data, replaces something you never fully trusted, or just makes your day a little smoother — share it with someone who needs it. That matters more than anything else.

---

## Download


**[⬇️ Download LocalPDF Studio](https://github.com/Alinur1/LocalPDF_Studio/releases)**

Supported on **Windows**, **Linux**, and **macOS** (x86_64).

---

## System Requirements

| Component | Requirement |
|---|---|
| **Node.js** | v24 or later |
| **Git** | Any recent version |
| **.NET SDK** | 8 (recommended) |
| **Python** | 3.8.10+ *(optional)* |
| **Architecture** | x86_64 (Intel/AMD) |

> **ARM64 users:** See the ***ARM64 build guide*** below.

---

## For Developers

LocalPDF Studio is built with modern web technologies and follows open-source principles. Contributions are welcome from developers who believe in privacy-focused, offline-first software.

### Run Locally

1. Clone the repository
```bash
git clone https://github.com/Alinur1/LocalPDF_Studio.git
```

2. Enter the project folder
```bash
cd LocalPDF_Studio
```

3. Install dependencies
```bash
npm install
```

4. Start the app
```bash
npm run start
```

### Build an installer for distribution

```bash
npm run dist
```

---

## ⚠️ ARM64 Custom Build

LocalPDF Studio currently bundles **x86_64** binaries only. ARM64 is unsupported but buildable by advanced users.

### Steps

**1. Update the build target** in `scripts/setup-backend.js`:

| Platform | Change `rid` to |
|---|---|
| Windows ARM | `win-arm64` |
| Apple Silicon (M1/M2/M3) | `osx-arm64` |
| ARM Linux | `linux-arm64` |

**2. Update the Python engine URLs** to Python 3.12.13 ARM64 standalone builds:

- [Windows ARM64](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-pc-windows-msvc-install_only.tar.gz)
- [macOS ARM64](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-apple-darwin-install_only.tar.gz)
- [Linux ARM64](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-unknown-linux-gnu-install_only.tar.gz)

Or browse all builds: [python-build-standalone releases](https://github.com/astral-sh/python-build-standalone/releases/tag/20260414)

> ⚠️ Ensure .NET 8 SDK is installed before building.

---

## Linux Snap Package

See the `docs/` folder for detailed build instructions.

---

## Contributing

1. Fork the repository
2. Clone your fork locally
3. Make your changes
4. **Test thoroughly** *(required)*
5. Commit with clear messages
6. Push and open a Pull Request

---

*Licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0). Free forever. No catch.*