![LocalPDF Studio](<https://github.com/Alinur1/LocalPDF_Studio/blob/main/Screenshots/LPS2.png?raw=true>)

# LocalPDF Studio

##  Your Complete Offline PDF Toolkit.

### Stop uploading your PDF files in some random websites.
This software is completely free, open-source, and privacy-focused.

> All your popular PDF tools in one place.

> Runs without internet.

> No signup or account needed.

> Unlimited usage.

### Donate: [Patreon](https://www.patreon.com/cw/MdAlinurHossain?vanity=MdAlinurHossain)

### ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/Alinur1/LocalPDF_Studio/total?style=for-the-badge&logo=github&label=Total%20Downloads&cacheSeconds=43200)

## For the developers
LocalPDF Studio is built with modern web technologies and follows open-source principles. We welcome contributions from developers who believe in privacy-focused, offline-first software.

---
---
### > Development Setup
- Node.JS v24 or later
- Git
- .NET 8 SDK (recommended)
- Python Minimum version 3.8.10 (not necessary actually)

---
---
### > Run the project after installing NodeJS and .NET SDK
- Clone the project:
```bash
git clone https://github.com/Alinur1/LocalPDF_Studio.git
```
- Now enter into the project's root folder:
```bash
cd LocalPDF_Studio
```
- Now install node dependencies:
```bash
npm install
```
- Now run the project:
```bash
npm run start
```

---
---
### > How to build one for yourself
- Just run the following command:
```bash
npm run dist
```
---

---

### ⚠️ System Compatibility Note

**LocalPDF Studio** currently supports **x86_64** (Intel/AMD) architectures only. Due to the nature of the self-contained backend, pre-compiled **ARM64** binaries are not bundled by default.

> **Note for ARM Users:** Advanced users may attempt an unsupported custom build by manually adjusting the target architecture in `scripts/setup-backend.js`.

#### Quick Guide for ARM64 (Windows, macOS, & Linux)
To build for ARM64, you must update the `rid` (Runtime Identifier) and the Python download URLs in the setup script:

1. **Update the Build Target:**
   Change the `rid` in `scripts/setup-backend.js` to match your hardware:
   - **Windows ARM:** Change `win-x64` to `win-arm64`.
   - **Apple Silicon (M1/M2/M3):** Change `osx-x64` to `osx-arm64`.
   - **ARM Linux:** Change `linux-x64` to `linux-arm64`.

2. **Update the Python Engine:**
   Replace the URLs in the `urls` object with the appropriate **Python 3.12.13** standalone builds:
   - [**Windows ARM64**](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-pc-windows-msvc-install_only.tar.gz)
   - [**macOS ARM64**](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-apple-darwin-install_only.tar.gz)
   - [**Linux ARM64**](https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-aarch64-unknown-linux-gnu-install_only.tar.gz)
   
   **OR**
   Get the suitable python standalone build from here: https://github.com/astral-sh/python-build-standalone/releases/tag/20260414

*Please note: Custom ARM builds are unsupported. Ensure you have the .NET 8 SDK installed before building.*

---
---
### > How to build snap package for linux
- Please see the "docs" folder for detailed instructions.

---
---

### > Quick Contribution Guide:
- Fork the repository on GitHub
- Clone your fork locally.
- Make changes.
- Test your code. (Must)
- Commit with clear messages.
- Push and create a Pull Request