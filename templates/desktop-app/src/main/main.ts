import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import dotenv from 'dotenv';

// Load .env file during development
if (process.env.NODE_ENV === 'development') {
  // The cwd when running `electron-forge start` is the project root,
  // which is where `.env` should live.
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

import { createAppMenu } from './menu/appMenu';
import { setupTray } from './tray/tray';
import { registerIpcHandlers } from './ipc/handlers';

// Initialize store for app settings
const store = new Store();

// Configure logger
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Setup auto-updater events
autoUpdater.on('update-available', () => {
  log.info('Update available');
});

autoUpdater.on('update-downloaded', () => {
  log.info('Update downloaded');
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart the application to apply the updates.',
      buttons: ['Restart', 'Later'],
    })
    .then((result: Electron.MessageBoxReturnValue) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

// Keep a global reference of the window object to avoid garbage collection
let mainWindow: BrowserWindow | null = null;

// Define isDevelopment flag
const isDevelopment = process.env.NODE_ENV === 'development';

// Create main window
function createWindow(): void {
  // Get window position from store
  const windowState = store.get('windowState', {
    width: 1024,
    height: 768,
    x: undefined,
    y: undefined,
  });

  // Create the main window
  mainWindow = new BrowserWindow({
    width: windowState.width as number,
    height: windowState.height as number,
    x: windowState.x as number | undefined,
    y: windowState.y as number | undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Hide until ready-to-show
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
  });

  // Save window position when closing
  mainWindow.on('close', () => {
    if (mainWindow) {
      const { width, height } = mainWindow.getBounds();
      const position = mainWindow.getPosition();
      store.set('windowState', {
        width,
        height,
        x: position[0],
        y: position[1],
      });
    }
  });

  // Load the entry point
  const entryUrl = isDevelopment
    ? 'http://localhost:3000' // Dev server URL
    : `file://${path.join(__dirname, '../renderer/index.html')}`; // Production build path

  mainWindow.loadURL(entryUrl);

  // Show window when ready to show
  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // Open DevTools in development
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Set up menu
  createAppMenu(mainWindow);

  // Set up tray
  setupTray(mainWindow);
}

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Create new window when app is activated (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Initialize app when ready
app.whenReady().then(() => {
  // Register IPC handlers
  registerIpcHandlers();

  // Create the main window
  createWindow();

  // Check for updates in production
  if (!isDevelopment) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});
