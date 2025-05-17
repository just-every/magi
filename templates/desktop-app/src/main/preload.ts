import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNELS } from '../shared/constants';

// API exposed to renderer
const api = {
  // Invoke handlers (async request-response pattern)
  invoke: {
    // App info
    getAppInfo: () => ipcRenderer.invoke(API_CHANNELS.GET_APP_INFO),
    getAppVersion: () => ipcRenderer.invoke(API_CHANNELS.GET_APP_VERSION),
    getAppPath: () => ipcRenderer.invoke(API_CHANNELS.GET_APP_PATH),
    
    // File operations
    openFile: () => ipcRenderer.invoke(API_CHANNELS.OPEN_FILE),
    saveFile: (content: string) => ipcRenderer.invoke(API_CHANNELS.SAVE_FILE, content),
    saveFileAs: (content: string) => ipcRenderer.invoke(API_CHANNELS.SAVE_FILE_AS, content),
    
    // Settings operations
    getSettings: () => ipcRenderer.invoke(API_CHANNELS.GET_SETTINGS),
    setSetting: (key: string, value: any) => ipcRenderer.invoke(API_CHANNELS.SET_SETTING, key, value),
  },
  
  // Event handlers (subscribe to events)
  on: {
    // App events
    updateAvailable: (callback: () => void) => 
      ipcRenderer.on(API_CHANNELS.UPDATE_AVAILABLE, () => callback()),
    updateDownloaded: (callback: () => void) => 
      ipcRenderer.on(API_CHANNELS.UPDATE_DOWNLOADED, () => callback()),
    
    // Custom events
    themeChanged: (callback: (event: any, theme: string) => void) => 
      ipcRenderer.on(API_CHANNELS.THEME_CHANGED, callback),
  },
  
  // Event removers (unsubscribe from events)
  off: {
    updateAvailable: () => ipcRenderer.removeAllListeners(API_CHANNELS.UPDATE_AVAILABLE),
    updateDownloaded: () => ipcRenderer.removeAllListeners(API_CHANNELS.UPDATE_DOWNLOADED),
    themeChanged: () => ipcRenderer.removeAllListeners(API_CHANNELS.THEME_CHANGED),
  },
  
  // Send events (fire and forget)
  send: {
    // App control
    checkForUpdates: () => ipcRenderer.send(API_CHANNELS.CHECK_FOR_UPDATES),
    installUpdate: () => ipcRenderer.send(API_CHANNELS.INSTALL_UPDATE),
    
    // Window control
    minimizeWindow: () => ipcRenderer.send(API_CHANNELS.MINIMIZE_WINDOW),
    maximizeWindow: () => ipcRenderer.send(API_CHANNELS.MAXIMIZE_WINDOW),
    closeWindow: () => ipcRenderer.send(API_CHANNELS.CLOSE_WINDOW),
  },
};

// Expose API to renderer process
contextBridge.exposeInMainWorld('electron', api);