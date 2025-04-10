/**
 * Setup script for the MAGI Browser extension and native messaging host.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// Load existing .env file if it exists
const envConfig: Record<string, string> = {};
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') {
        return;
      }

      // Split by first = sign
      const separatorIndex = line.indexOf('=');
      if (separatorIndex > 0) {
        const key = line.substring(0, separatorIndex).trim();
        const value = line.substring(separatorIndex + 1).trim();
        
        if (value && !value.includes('your_') && !value.includes('_here')) {
          envConfig[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.error("Error reading .env file:", error);
}

// Platform-specific paths for Chrome Native Messaging Host manifests
const getNativeMessagingHostPath = (): string | null => {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  } else if (platform === 'linux') {
    return path.join(homeDir, '.config/google-chrome/NativeMessagingHosts');
  } else if (platform === 'win32') {
    // On Windows, the installation requires registry edits which is more complex
    return null;
  } else {
    return null;
  }
};

/**
 * Prompts the user for input with a question
 */
const askQuestion = async (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

/**
 * Updates or creates the .env file with new values
 */
const updateEnvFile = async (newValues: Record<string, string>): Promise<void> => {
  const envPath = path.resolve(process.cwd(), '.env');
  let existingContent = '';
  let existingLines: string[] = [];
  
  // Read existing content if file exists
  if (fs.existsSync(envPath)) {
    existingContent = fs.readFileSync(envPath, 'utf8');
    existingLines = existingContent.split('\n');
  }
  
  // Update or add new values
  for (const [key, value] of Object.entries(newValues)) {
    const lineIndex = existingLines.findIndex(line => 
      line.startsWith(key + '=') || line.startsWith(key + ' =')
    );
    
    if (lineIndex >= 0) {
      // Replace existing line
      existingLines[lineIndex] = `${key}=${value}`;
    } else {
      // Add new line with comment
      existingLines.push(`# ${key} added by browser setup`);
      existingLines.push(`${key}=${value}`);
      existingLines.push(''); // Empty line after new entry
    }
  }
  
  // Write back to file
  fs.writeFileSync(envPath, existingLines.join('\n'));
  console.log(`Updated .env file with new values`);
};

/**
 * Installs the Chrome extension native messaging host
 */
export async function setupBrowserExtension(): Promise<boolean> {
  console.log("Setting up MAGI Browser extension...");
  
  try {
    // 1. Check if we have the extension ID in .env already
    let extensionId = envConfig.CHROME_EXTENSION_ID || '';
    
    if (!extensionId) {
      console.log('\n\x1b[33m%s\x1b[0m', 'Chrome Extension installation:');
      console.log('\x1b[33m%s\x1b[0m', '1. Open Chrome and navigate to chrome://extensions');
      console.log('\x1b[33m%s\x1b[0m', '2. Enable "Developer mode" using the toggle in the top-right corner');
      console.log('\x1b[33m%s\x1b[0m', '3. Click "Load unpacked" and select the "browser/extension" folder from this project');
      console.log('\x1b[33m%s\x1b[0m', '4. After installation, copy the extension ID (a string like "abcdefghijklmnopqrstuvwxyzabcdef")');
      console.log('\x1b[33m%s\x1b[0m', '   The ID appears under the extension name in the extensions list\n');
      
      extensionId = await askQuestion("Enter the Chrome extension ID: ");
      
      if (!extensionId || extensionId.length < 32) {
        console.log('\x1b[31m%s\x1b[0m', 'Invalid extension ID. Please try again with a valid ID.');
        return false;
      }
      
      // Save to .env file
      await updateEnvFile({ CHROME_EXTENSION_ID: extensionId });
    }
    
    // 2. Install the native messaging host manifest
    const nativeMessagingHostDir = getNativeMessagingHostPath();
    
    if (!nativeMessagingHostDir) {
      console.log('\x1b[31m%s\x1b[0m', 'Unsupported platform for automatic native messaging host installation.');
      console.log('\x1b[33m%s\x1b[0m', 'Please manually install the native messaging host manifest:');
      console.log('\x1b[33m%s\x1b[0m', '1. Edit browser/bridge/com.withmagi.magi_native_host.json');
      console.log('\x1b[33m%s\x1b[0m', '2. Replace YOUR_EXTENSION_ID_HERE with your extension ID');
      console.log('\x1b[33m%s\x1b[0m', '3. Update the "path" value to the full absolute path to bridge_runner.sh');
      console.log('\x1b[33m%s\x1b[0m', '4. Place this file in the appropriate location for your OS');
      console.log('\x1b[33m%s\x1b[0m', '   - macOS: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/');
      console.log('\x1b[33m%s\x1b[0m', '   - Linux: ~/.config/google-chrome/NativeMessagingHosts/');
      console.log('\x1b[33m%s\x1b[0m', '   - Windows: Registry HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\');
      return false;
    }
    
    // Make sure the directory exists
    if (!fs.existsSync(nativeMessagingHostDir)) {
      fs.mkdirSync(nativeMessagingHostDir, { recursive: true });
    }
    
    // Create and install the manifest with correct paths
    const sourceManifestPath = path.resolve(process.cwd(), 'browser/bridge/com.withmagi.magi_native_host.json');
    const targetManifestPath = path.join(nativeMessagingHostDir, 'com.withmagi.magi_native_host.json');
    const bridgeRunnerPath = path.resolve(process.cwd(), 'browser/bridge/bridge_runner.sh');
    
    // Read the manifest template
    let manifestContent = fs.readFileSync(sourceManifestPath, 'utf8');
    
    // Update with the correct extension ID and absolute path to bridge_runner.sh
    manifestContent = manifestContent.replace('YOUR_EXTENSION_ID_HERE', extensionId);
    manifestContent = manifestContent.replace('./bridge_runner.sh', bridgeRunnerPath);
    
    // Write the updated manifest to the target location
    fs.writeFileSync(targetManifestPath, manifestContent);
    
    // Make bridge_runner.sh executable
    fs.chmodSync(bridgeRunnerPath, '755');
    
    // Update the bridge_runner.sh file with the enhanced version for better debugging
    const bridgeRunnerContent = `#!/bin/bash
# Enhanced bridge runner with diagnostics and path resolution

# Get the absolute path of the script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
LOG_FILE="$SCRIPT_DIR/bridge-runner.log"

# Function to log messages with timestamps
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >&2
}

# Create/truncate the log file
echo "=== MAGI Bridge Runner Log ===" > "$LOG_FILE"
log "Starting bridge runner"

# Find Node.js executable
NODE_PATH=""
# Try to locate node in common places
for path in \\
  "$(which node 2>/dev/null)" \\
  "/usr/local/bin/node" \\
  "/opt/homebrew/bin/node" \\
  "$NVM_DIR/current/bin/node" \\
  "$HOME/.nvm/current/bin/node" \\
  "$HOME/.nvm/versions/node/*/bin/node" \\
  "/opt/node/bin/node" \\
  "/usr/bin/node"
do
  if [ -x "$path" ]; then
    NODE_PATH="$path"
    break
  fi
done

# Fallback to checking for node in custom locations
if [ -z "$NODE_PATH" ]; then
  # Try to find nvm installations
  if [ -d "$HOME/.nvm" ]; then
    # Look for the newest node version in nvm
    for nvmnode in $(find "$HOME/.nvm/versions/node" -name "node" -type f -perm -u+x | sort -r); do
      NODE_PATH="$nvmnode"
      break
    done
  fi
  
  # Try to find homebrew installations
  if [ -z "$NODE_PATH" ] && [ -d "/opt/homebrew" ]; then
    for brewnode in $(find "/opt/homebrew" -name "node" -type f -perm -u+x | sort -r); do
      NODE_PATH="$brewnode"
      break
    done
  fi
fi

# Check if we found node
if [ -z "$NODE_PATH" ]; then
  log "ERROR: Could not find Node.js executable. Please ensure node is installed and in PATH."
  log "Current PATH: $PATH"
  
  # As a last resort, try to run a node process to get the executable path
  NODE_CHECK=$(ps -ef | grep node | grep -v grep | head -1 | awk '{print $8}')
  if [ -n "$NODE_CHECK" ] && [ -x "$NODE_CHECK" ]; then
    log "Found node process at: $NODE_CHECK"
    NODE_PATH="$NODE_CHECK"
  else
    # Try to use the node from the npm command's path
    NPM_PATH=$(which npm 2>/dev/null)
    if [ -n "$NPM_PATH" ]; then
      NPM_DIR=$(dirname "$NPM_PATH")
      if [ -x "$NPM_DIR/node" ]; then
        NODE_PATH="$NPM_DIR/node"
        log "Found node alongside npm at: $NODE_PATH"
      fi
    fi
  fi
  
  # If still not found, exit
  if [ -z "$NODE_PATH" ]; then
    log "ERROR: Node.js not found after exhaustive search. Cannot run bridge."
    exit 1
  fi
fi

log "Using Node.js at: $NODE_PATH"

# Check if the compiled JS file exists
JS_FILE="$SCRIPT_DIR/dist/bridge.js"
if [ ! -f "$JS_FILE" ]; then
  log "ERROR: Bridge JS file not found at $JS_FILE"
  log "Current directory: $(pwd)"
  log "Checking for TypeScript file..."
  
  if [ -f "$SCRIPT_DIR/bridge.ts" ]; then
    log "Found TypeScript file, attempting to compile it"
    
    # Check if TypeScript is installed
    if command -v npx &> /dev/null; then
      log "Compiling TypeScript file with npx tsc"
      mkdir -p "$SCRIPT_DIR/dist"
      cd "$SCRIPT_DIR" && npx tsc
      
      if [ $? -eq 0 ]; then
        log "TypeScript compilation successful"
      else
        log "ERROR: TypeScript compilation failed"
        exit 1
      fi
    else
      log "ERROR: npx not found, cannot compile TypeScript"
      exit 1
    fi
  else
    log "ERROR: bridge.ts also not found. Cannot continue."
    exit 1
  fi
fi

# Log environment info
log "Node version: $($NODE_PATH --version 2>/dev/null || echo 'Version check failed')"
log "PWD: $(pwd)"
log "SCRIPT_DIR: $SCRIPT_DIR"
log "PATH: $PATH"
log "JS_FILE: $JS_FILE"

# Execute the Node script, with proper path
cd "$SCRIPT_DIR"
log "Executing: $NODE_PATH $JS_FILE"
"$NODE_PATH" "$JS_FILE" "$@" 2>> "$LOG_FILE"

EXIT_CODE=$?
log "Bridge process exited with code $EXIT_CODE"
exit $EXIT_CODE`;

    // Write the enhanced bridge_runner.sh
    fs.writeFileSync(bridgeRunnerPath, bridgeRunnerContent);
    fs.chmodSync(bridgeRunnerPath, '755');
    
    console.log('\x1b[32m%s\x1b[0m', 'Successfully installed the native messaging host manifest.');
    console.log('\x1b[32m%s\x1b[0m', `Manifest location: ${targetManifestPath}`);
    console.log('\x1b[32m%s\x1b[0m', `Bridge runner path: ${bridgeRunnerPath}`);
    
    return true;
  } catch (error) {
    console.error(`Error setting up browser extension: ${error}`);
    return false;
  }
}

// Allow running directly as ES module
if (import.meta.url === `file://${process.argv[1]}`) {
  setupBrowserExtension().catch(console.error);
}