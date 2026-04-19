const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;
const osFolder = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';

const backendDir = path.join(__dirname, '..', 'assets', `backend_${osFolder}`, 'PyBackend');
const engineDir = path.join(backendDir, 'Engine');
const vendorDir = path.join(backendDir, 'vendor');
const requirements = path.join(__dirname, '..', 'PyBackend', 'requirements.txt');

async function setup() {
    const urls = {
        win32: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-pc-windows-msvc-install_only.tar.gz",
        linux: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-unknown-linux-gnu-install_only.tar.gz",
        darwin: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13+20260414-x86_64-apple-darwin-install_only.tar.gz"
    };

    const pythonExe = platform === 'win32' ?
        path.join(engineDir, 'python.exe') :
        path.join(engineDir, 'bin', 'python3');

    //Provision Engine if missing
    if (!fs.existsSync(pythonExe)) {
        console.log(`Provisioning Python for ${osFolder}...`);
        try {
            if (!fs.existsSync(engineDir)) fs.mkdirSync(engineDir, { recursive: true });
            console.log("Downloading Standalone Python...");
            execSync(`curl -L ${urls[platform]} | tar -xz -C "${engineDir}" --strip-components=1`);
            if (platform !== 'win32') {
                console.log("Applying executable permissions for Unix-like system...");
                // Grant executable permissions (755) to the python binary
                fs.chmodSync(pythonExe, '755');
                const binDir = path.join(engineDir, 'bin');
                if (fs.existsSync(binDir)) {
                    const binaries = fs.readdirSync(binDir);
                    binaries.forEach(bin => {
                        fs.chmodSync(path.join(binDir, bin), '755');
                    });
                }
            }
            console.log("Installing Python packages to vendor folder...");
            execSync(`"${pythonExe}" -m pip install -r "${requirements}" --target "${vendorDir}"`);
        } catch (err) {
            console.error("Engine setup failed:", err.message);
            process.exit(1);
        }
    } else {
        console.log(`Python Engine for ${osFolder} already exists.`);
    }

    //Always sync scripts so changes reflect immediately
    try {
        console.log("Syncing Python scripts...");
        const sourceScripts = path.join(__dirname, '..', 'PyBackend', 'Scripts');
        const targetScripts = path.join(backendDir, 'Scripts');

        if (!fs.existsSync(targetScripts)) fs.mkdirSync(targetScripts, { recursive: true });

        const files = fs.readdirSync(sourceScripts);
        files.forEach(file => {
            if (file.endsWith('.py')) {
                fs.copyFileSync(path.join(sourceScripts, file), path.join(targetScripts, file));
            }
        });
        console.log("Backend Assets Prepared.");
    } catch (err) {
        console.error("Script sync failed:", err.message);
    }
}

setup();