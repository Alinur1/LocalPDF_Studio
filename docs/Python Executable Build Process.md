# Python Executable Build Process (Updated)
## Single executable — all features bundled

All 5 Python features (watermark, extract_images, convert_pdf_images, grayscale, redact)
are now combined into a single entry point: `localpdf_studio_python.py`

This means ONE build per platform instead of five, and ~40MB total instead of ~190MB.

---

## Install dependencies

```bash
pip install PyMuPDF pikepdf pyinstaller pillow
```

On Linux, if you encounter errors related to binutils:
```bash
sudo apt update
sudo apt install binutils
```

---

## Build commands

### Windows
```bash
pyinstaller --onefile --name localpdf_studio_python --hidden-import=fitz --hidden-import=PyMuPDF --hidden-import=PIL --hidden-import=PIL.Image --hidden-import=PIL.ImageDraw --hidden-import=PIL.ImageFont --collect-all fitz --collect-all PyMuPDF --collect-all PIL localpdf_studio_python.py
```
Output: `dist/localpdf_studio_python.exe`
Place in: `assets/backend_windows/`

---

### Linux
```bash
pyinstaller --onefile --name localpdf_studio_python --hidden-import=fitz --hidden-import=PyMuPDF --hidden-import=PIL --hidden-import=PIL.Image --hidden-import=PIL.ImageDraw --hidden-import=PIL.ImageFont --collect-all fitz --collect-all PyMuPDF --collect-all PIL localpdf_studio_python.py

chmod +x dist/localpdf_studio_python
```
Output: `dist/localpdf_studio_python`
Place in: `assets/backend_linux/`

---

### macOS
```bash
pyinstaller --onefile --name localpdf_studio_python --hidden-import=fitz --hidden-import=PyMuPDF --hidden-import=PIL --hidden-import=PIL.Image --hidden-import=PIL.ImageDraw --hidden-import=PIL.ImageFont --collect-all fitz --collect-all PyMuPDF --collect-all PIL localpdf_studio_python.py

chmod +x dist/localpdf_studio_python
```
Output: `dist/localpdf_studio_python`
Place in: `assets/backend_macos/`

---

## New folder structure

```
assets/
├── backend_windows/
│   └── scripts/
│       └── localpdf_studio_python.exe
├── backend_linux/
│   └── scripts/
│       └── localpdf_studio_python
├── backend_macos/
│   └── scripts/
│       └── localpdf_studio_python
```

---

## How commands are dispatched

The executable takes a command name as the first argument, followed by the original arguments:

| Feature          | Old executable          | New command                              |
|------------------|-------------------------|------------------------------------------|
| Watermark        | add_watermark(.exe)     | localpdf_studio_python watermark ...     |
| Extract images   | extract_images(.exe)    | localpdf_studio_python extract_images ...  |
| Convert to images| convert_pdf_images(.exe)| localpdf_studio_python convert_pdf_images ...|
| Grayscale        | pdf_to_grayscale(.exe)  | localpdf_studio_python grayscale ...     |
| Redact           | redact_pdf(.exe)        | localpdf_studio_python redact ...        |

---

## C# service update required

In each service's `GetPythonExecutablePath()`, change the exe name:

```csharp
// OLD (one per service):
string exeName = "add_watermark.exe";       // WatermarkService
string exeName = "extract_images.exe";      // ExtractImagesService
string exeName = "convert_pdf_images.exe";  // PdfToImageService
string exeName = "pdf_to_grayscale.exe";    // GrayscaleService
string exeName = "redact_pdf.exe";          // RedactService

// NEW (same for all services):
string exeName = "localpdf_studio_python.exe";
```

And prepend the command name as the first argument in each service's argument list:

```csharp
// WatermarkService
var arguments = new List<string> { "watermark", $"\"{request.FilePath}\"", ... };

// ExtractImagesService
Arguments = $"extract_images \"{tempJsonFile}\"",

// PdfToImageService
var arguments = new List<string> { "convert_pdf_images", $"\"{request.FilePath}\"", ... };

// GrayscaleService
var arguments = new List<string> { "grayscale", $"\"{request.FilePath}\"", ... };

// RedactService
var arguments = new List<string> { "redact", $"\"{request.FilePath}\"", ... };
```