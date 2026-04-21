# Publishing software in snap store

### 1. **Install Snapcraft:**  
```bash
sudo snap install snapcraft --classic
```

### 2. **Install LXD (build environment):**  
```bash
sudo snap install lxd
```

### 3. **Add your user to the LXD group:**  
```bash
sudo usermod -aG lxd $USER
```

### 4. **Reboot your PC** (important for group changes to apply).

### 5. **Check LXD version to confirm installation:**  
```bash
lxd --version
```

### 6. **Initialize LXD:**  
```bash
lxd init
```

> Choose all defaults for every option.

### 7. **Build the Snap package locally:**  
> Open a terminal in the project's root directory and paste these commands in the terminal.
```bash
mkdir build
```
```bash
snapcraft --output build/
```
> Make sure you have `snapcraft.yaml` file inside the `snap` folder and `localpdf-studio.desktop` file in your project's root folder.

### 8. **Test the Snap locally:**  
```bash
sudo snap install build/localpdf-studio_0.0.6_amd64.snap --dangerous
```
> Use the actual filename generated in the build folder.

### 9. **Now run the installed snap:**  
```bash
localpdf-studio
```
> This command must match with the `"name"` in the `snapcraft.yaml` file.
---
---

## To publish an app in the snapstore, the following steps are needed to be followed.

### 10. **Login to Snapcraft:**  
```bash
snapcraft login
```
> You need to create an `Ubuntu one` account from here: https://login.ubuntu.com/

### 11. **Reserve your Snap name to publish app in the snapstore (for new app):**  
```bash
snapcraft register localpdf-studio
```
> Must match with the `"name"` in `package.json` and `snapcraft.yaml` file.

### 12. **Upload and release the Snap:**  
```bash
snapcraft upload build/localpdf-studio_0.0.6_amd64.snap --release=stable
```
> Use the actual filename generated in the build folder.