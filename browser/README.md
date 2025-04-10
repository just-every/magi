# MAGI Browser Extension

This folder contains the Chrome extension and native messaging host bridge that allows MAGI to interact with your web browser.

## Components

- **extension/**: Chrome extension files
  - manifest.json: Extension configuration
  - background.js: Background service worker for handling messages
  - dom_processor.js: Content script for DOM manipulation
  - img/: Icon files

- **bridge/**: Native messaging host implementation
  - bridge.ts: TypeScript implementation of the native messaging host
  - bridge_runner.sh: Shell script that launches the bridge
  - com.withmagi.magi_native_host.json: Native messaging host manifest template
    - Contains placeholders `YOUR_EXTENSION_ID_HERE` and `./bridge_runner.sh` that are replaced during setup
  - tsconfig.json: TypeScript configuration

## Installation

The extension can be installed automatically using the setup script:

```bash
npm run setup:browser
```

### Manual Installation

If you prefer to install the extension manually:

1. **Install the Chrome Extension**:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" using the toggle in the top-right corner
   - Click "Load unpacked" and select the `browser/extension` folder
   - Note the extension ID (shown under the extension name)

2. **Configure the Native Messaging Host**:
   - Edit `browser/bridge/com.withmagi.magi_native_host.json`
   - Replace `YOUR_EXTENSION_ID_HERE` with your extension ID
   - Update the path to `bridge_runner.sh` with the full absolute path
   - Copy this file to the appropriate location:
     - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
     - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
     - Windows: Registry key `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.withmagi.magi_native_host`

3. **Make the Bridge Runner Executable**:
   ```bash
   chmod +x browser/bridge/bridge_runner.sh
   ```

4. **Add the Extension ID to .env**:
   ```
   CHROME_EXTENSION_ID=your_extension_id_here
   ```

## Usage

Once installed, the MAGI browser agent can interact with Chrome using the extension. The extension communicates with the native messaging host bridge, which in turn communicates with MAGI.

### Starting the Bridge

The bridge is automatically started when you run `npm run dev`. However, you can also manage it separately:

```bash
# Start the bridge
npm run bridge:start

# Stop the bridge
npm run bridge:stop
```

The bridge runs as a background process and communicates with the Chrome extension via native messaging protocol and with the MAGI system via WebSockets.

### Communication Flow

```
MAGI Browser Agent → Native Messaging Host Bridge → Chrome Extension → Browser Tab
```

### Permissions

The extension requires the following permissions:
- nativeMessaging: For communication with the native messaging host
- tabs: For managing browser tabs
- scripting: For executing scripts in browser tabs
- debugger: For advanced browser control and debugging
- storage: For saving extension state
- activeTab: For interacting with the active tab
- alarms: For keeping the service worker alive and reconnecting to the native host
- host_permissions (<all_urls>): To interact with any website

When installing the extension, Chrome will prompt you to approve these permissions. All permissions are necessary for the extension to function properly and allow MAGI to control the browser.

## Troubleshooting

1. **Check Extension Installation**:
   - Open `chrome://extensions` and ensure the extension is enabled
   - Check for any error messages in the extension details
   - If you see "Service worker registration failed. Status code: 15", reload the extension

2. **Check Extension Console Logs**:
   - In Chrome, go to `chrome://extensions`
   - Find the MAGI Browser Controller extension
   - Click on "background page" or "service worker" under "Inspect views"
   - Check the Console tab for error messages
   - Common errors:
     - "Cannot read properties of undefined (reading 'create')" - The extension is missing the 'alarms' permission
     - "Native host disconnected: Native host has exited." - The bridge process is not running or is exiting unexpectedly
     - Permission-related errors may require you to uninstall and reinstall the extension after fixing the manifest

3. **Check Native Messaging Host**:
   - Verify the manifest file is in the correct location:
     - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
     - Linux: `~/.config/google-chrome/NativeMessagingHosts/`
     - Windows: Registry key `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.withmagi.magi_native_host`
   - Make sure the manifest contains the full absolute path to `bridge_runner.sh`, not a relative path
   - Ensure the extension ID in the manifest matches your extension ID
   - Check permissions on `bridge_runner.sh` (should be executable with `chmod +x`)

4. **Check Bridge Runner and Logs**:
   - Check if bridge-runner.log exists in the browser/bridge directory
   - If it exists, check its contents for errors: `cat browser/bridge/bridge-runner.log`
   - Check the main bridge log: `cat browser-bridge.log` in the project root 
   - Make sure the TypeScript file is compiled: `cd browser/bridge && npx tsc`
   - Verify Node.js is in your PATH: `which node`
   - Try running the bridge manually: `cd browser/bridge && ./bridge_runner.sh`

5. **Native Host Issues (macOS/Linux)**:
   - Re-run the setup: `npm run setup:browser`
   - Manually copy the manifest:
     ```bash
     mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
     cp browser/bridge/com.withmagi.magi_native_host.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
     ```
   - Make sure the bridge runner is called with full path in the manifest file:
     ```json
     "path": "/full/path/to/browser/bridge/bridge_runner.sh"
     ```
   - If you see "node: command not found" in bridge-runner.log:
     ```bash
     # Restart the bridge with our improved script that finds Node.js
     scripts/stop-bridge.sh
     scripts/start-bridge.sh
     ```
     This is because Chrome runs the native messaging host with a limited PATH environment where Node.js may not be found.

6. **Reset Everything**:
   - Try disabling and re-enabling the extension
   - Restart Chrome after making changes
   - Run `npm run bridge:stop` followed by `npm run bridge:start` to restart the bridge
   - Make sure only one instance of the bridge is running
   - If all else fails, uninstall and reinstall the extension