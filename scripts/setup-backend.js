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


// scripts/setup-backend.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;
const osFolder = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
const rid = platform === 'win32' ? 'win-x64' : platform === 'darwin' ? 'osx-x64' : 'linux-x64';
const projectRoot = path.join(__dirname, '..');
const apiProjectDir = path.join(projectRoot, 'LocalPDF_Studio_api', 'LocalPDF_Studio_api');
const targetBackendDir = path.join(projectRoot, 'assets', `backend_${osFolder}`);

async function setup() {
    console.log(`--- Starting Full Backend Setup for ${osFolder} ---`);

    // 1. BUILD C# PROJECT
    try {
        console.log(`Building C# API (Self-Contained: ${rid})...`);
        // Using --output to publish directly into the assets folder
        execSync(`dotnet publish "${apiProjectDir}" -c Release -r ${rid} --self-contained true /p:PublishSingleFile=false -o "${targetBackendDir}"`, { stdio: 'inherit' });
        console.log("C# API Build Successful.");
    } catch (err) {
        console.error("C# Build failed. Make sure .NET SDK is installed:", err.message);
        process.exit(1);
    }

    // 2. SETUP PYTHON ENGINE & VENDOR
    const pyBackendDir = path.join(targetBackendDir, 'PyBackend');
    const engineDir = path.join(pyBackendDir, 'Engine');
    const vendorDir = path.join(pyBackendDir, 'vendor');
    const requirements = path.join(projectRoot, 'PyBackend', 'requirements.txt');

    const urls = {
        win32: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-pc-windows-msvc-install_only.tar.gz",
        linux: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-unknown-linux-gnu-install_only.tar.gz",
        darwin: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-apple-darwin-install_only.tar.gz"
    };

    const pythonExe = platform === 'win32' ?
        path.join(engineDir, 'python.exe') :
        path.join(engineDir, 'bin', 'python3');

    if (!fs.existsSync(pythonExe)) {
        console.log("Provisioning Python Engine...");
        try {
            if (!fs.existsSync(engineDir)) fs.mkdirSync(engineDir, { recursive: true });

            // Apply Windows-specific pipe fix for Windows 10/11 compatibility
            const tarCmd = platform === 'win32'
                ? `curl -L ${urls[platform]} | tar -xzf - -C "${engineDir}" --strip-components=1`
                : `curl -L ${urls[platform]} | tar -xz -C "${engineDir}" --strip-components=1`;

            execSync(tarCmd);

            if (platform !== 'win32') {
                fs.chmodSync(pythonExe, '755');
                const binDir = path.join(engineDir, 'bin');
                if (fs.existsSync(binDir)) {
                    fs.readdirSync(binDir).forEach(bin => fs.chmodSync(path.join(binDir, bin), '755'));
                }
            }

            console.log("Installing Python packages...");
            execSync(`"${pythonExe}" -m pip install -r "${requirements}" --target "${vendorDir}"`);
        } catch (err) {
            console.error("Python Engine setup failed:", err.message);
            process.exit(1);
        }
    }

    // 3. SYNC PYTHON SCRIPTS
    try {
        console.log("Syncing Python scripts...");
        const sourceScripts = path.join(projectRoot, 'PyBackend', 'Scripts');
        const targetScripts = path.join(pyBackendDir, 'Scripts');

        if (!fs.existsSync(targetScripts)) fs.mkdirSync(targetScripts, { recursive: true });

        fs.readdirSync(sourceScripts).forEach(file => {
            if (file.endsWith('.py')) {
                fs.copyFileSync(path.join(sourceScripts, file), path.join(targetScripts, file));
            }
        });
        console.log("--- Backend Assets Fully Prepared ---");
    } catch (err) {
        console.error("Script sync failed:", err.message);
    }
}

setup();