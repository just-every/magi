# MAGI Browser Extension

This Chrome extension allows the MAGI system to control the browser programmatically through native messaging.

## Features

- Tab management
- Page navigation and content extraction
- Interactive element detection and interaction
- Screenshot capture
- JavaScript execution
- Keyboard input simulation

## Development

### Setup

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Watch for changes during development:
```bash
npm run watch
```

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the extension directory

### Native Messaging Host

This extension communicates with a native messaging host called `com.withmagi.magi_native_host`. Make sure the host manifest is correctly installed in your system.

## Project Structure

- `src/`: TypeScript source files
  - `background.ts`: Main service worker entry point
  - `config/`: Configuration constants
  - `state/`: Global state management
  - `communication/`: Native messaging interface
  - `debugger/`: Chrome debugger control
  - `tab-management/`: Tab and session management
  - `storage/`: Element map storage
  - `dom-processor/`: DOM analysis and extraction
  - `commands/`: Command handlers for native messaging requests
  - `types.ts`: TypeScript type definitions
- `dist/`: Compiled JavaScript output
- `img/`: Extension icons
- `manifest.json`: Extension manifest file