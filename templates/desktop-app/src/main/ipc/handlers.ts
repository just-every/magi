import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import { API_CHANNELS, DEFAULT_SETTINGS } from '../../shared/constants';

// Initialize store for app settings
const store = new Store();

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers() {
  // App info handlers
  registerAppInfoHandlers();
  
  // File operation handlers
  registerFileHandlers();
  
  // Settings handlers
  registerSettingsHandlers();
  
  // Update handlers
  registerUpdateHandlers();
  
  // Window control handlers
  registerWindowHandlers();
}

/**
 * Register app info related handlers
 */
function registerAppInfoHandlers() {
  // Get app info
  ipcMain.handle(API_CHANNELS.GET_APP_INFO, () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
    };
  });
  
  // Get app version
  ipcMain.handle(API_CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion();
  });
  
  // Get app path
  ipcMain.handle(API_CHANNELS.GET_APP_PATH, (event, name) => {
    return app.getPath(name);
  });
}

/**
 * Register file operation handlers
 */
function registerFileHandlers() {
  // Open file dialog
  ipcMain.handle(API_CHANNELS.OPEN_FILE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (canceled || filePaths.length === 0) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filePaths[0], 'utf8');
      return {
        path: filePaths[0],
        content
      };
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  });
  
  // Save file
  ipcMain.handle(API_CHANNELS.SAVE_FILE, async (event, content) => {
    const currentFilePath = store.get('currentFile');
    
    if (!currentFilePath) {
      return ipcMain.handle(API_CHANNELS.SAVE_FILE_AS, (event, content));
    }
    
    try {
      fs.writeFileSync(currentFilePath as string, content, 'utf8');
      return { success: true, path: currentFilePath };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Save file as
  ipcMain.handle(API_CHANNELS.SAVE_FILE_AS, async (event, content) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (canceled || !filePath) {
      return { success: false };
    }
    
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      store.set('currentFile', filePath);
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Register settings handlers
 */
function registerSettingsHandlers() {
  // Get all settings
  ipcMain.handle(API_CHANNELS.GET_SETTINGS, () => {
    return store.get('settings', DEFAULT_SETTINGS);
  });
  
  // Set a specific setting
  ipcMain.handle(API_CHANNELS.SET_SETTING, (event, key, value) => {
    const settings = store.get('settings', DEFAULT_SETTINGS);
    const updatedSettings = { ...settings, [key]: value };
    store.set('settings', updatedSettings);
    
    // Notify about theme changes
    if (key === 'theme') {
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send(API_CHANNELS.THEME_CHANGED, value);
      });
    }
    
    return updatedSettings;
  });
}

/**
 * Register update handlers
 */
function registerUpdateHandlers() {
  // Check for updates
  ipcMain.on(API_CHANNELS.CHECK_FOR_UPDATES, () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
  
  // Install update
  ipcMain.on(API_CHANNELS.INSTALL_UPDATE, () => {
    autoUpdater.quitAndInstall();
  });
}

/**
 * Register window control handlers
 */
function registerWindowHandlers() {
  // Minimize window
  ipcMain.on(API_CHANNELS.MINIMIZE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  
  // Maximize window
  ipcMain.on(API_CHANNELS.MAXIMIZE_WINDOW, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });
  
  // Close window
  ipcMain.on(API_CHANNELS.CLOSE_WINDOW, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}