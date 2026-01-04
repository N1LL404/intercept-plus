# Fetch Extension

A professional Chrome DevTools extension for capturing, inspecting, and exporting network requests with cURL generation.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

## Features

- 🔍 **Real-time Request Capture** - Automatically logs all network requests
- 🎯 **URL Filtering** - Filter requests using glob patterns (e.g., `*facebook.com*`)
- 📋 **cURL Generation** - Generate valid bash cURL commands with proper escaping
- 📦 **Response Viewer** - View raw response bodies
- 💾 **Export to TXT** - Download filtered requests with cURL + Response format
- 📝 **Preserve Log** - Keep requests across page navigations
- 🎨 **Dark Glassmorphism UI** - Modern, professional design
- ↔️ **Resizable Panels** - Drag the divider to adjust panel widths

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `Fetch Extension` folder

## Usage

1. Open DevTools (F12 or Right-click → Inspect)
2. Find the **"Fetch Logger"** tab (may be in the `>>` overflow menu)
3. Reload the page to start capturing requests
4. Click on any request to view its cURL command and response

### Filtering

Enter a filter pattern in the search box:
- `*facebook*` - Match URLs containing "facebook"
- `*.json` - Match URLs ending with ".json"
- `api/*` - Match URLs with "api/" in the path

### Export Format

Downloaded files follow this format:

```
curl 'https://example.com/api' \
  -H 'accept: application/json' \
  -H 'user-agent: Mozilla/5.0...' \
  -b 'session=abc123'

Response :
{"status": "ok", "data": {...}}

==========================================================================================
```

## Keyboard Shortcuts

| Action | Description |
|--------|-------------|
| Click request | View cURL and Response |
| Drag divider | Resize panels |

## Permissions

- `clipboardWrite` - Copy to clipboard
- `storage` - Save preferences
- `activeTab` - Access current tab
- `<all_urls>` - Capture requests from any domain

## Development

```
Fetch Extension/
├── manifest.json      # Extension configuration
├── devtools.html      # DevTools entry point
├── devtools.js        # Panel creation
├── panel.html         # Main UI
├── panel.css          # Styles (dark theme)
├── panel.js           # Core logic
└── background.js      # Service worker
```

## License

MIT License - Feel free to modify and distribute.

---

Made with ❤️ for developers who love clean network debugging.
