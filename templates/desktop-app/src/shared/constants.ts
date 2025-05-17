/**
 * API channels for IPC communication between main and renderer processes
 */
export const API_CHANNELS = {
  // App info
  GET_APP_INFO: 'app:get-info',
  GET_APP_VERSION: 'app:get-version',
  GET_APP_PATH: 'app:get-path',
  
  // File operations
  OPEN_FILE: 'file:open',
  SAVE_FILE: 'file:save',
  SAVE_FILE_AS: 'file:save-as',
  
  // Settings operations
  GET_SETTINGS: 'settings:get',
  SET_SETTING: 'settings:set',
  
  // Update operations
  CHECK_FOR_UPDATES: 'update:check',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_DOWNLOADED: 'update:downloaded',
  INSTALL_UPDATE: 'update:install',
  
  // Window control
  MINIMIZE_WINDOW: 'window:minimize',
  MAXIMIZE_WINDOW: 'window:maximize',
  CLOSE_WINDOW: 'window:close',
  
  // Theme
  THEME_CHANGED: 'theme:changed',
};

/**
 * App settings defaults
 */
export const DEFAULT_SETTINGS = {
  theme: 'system', // 'light', 'dark', or 'system'
  fontSize: 14,
  autoSave: true,
  autoUpdate: true,
};

/**
 * Application paths
 */
export const APP_PATHS = {
  DOCUMENTS: 'documents',
  DOWNLOADS: 'downloads',
  PICTURES: 'pictures',
  MUSIC: 'music',
  VIDEOS: 'videos',
  TEMP: 'temp',
  USER_DATA: 'userData',
  APP_DATA: 'appData',
  LOGS: 'logs',
};

/**
 * Application menu item IDs
 */
export const MENU_ITEM_IDS = {
  OPEN_FILE: 'open-file',
  SAVE_FILE: 'save-file',
  SAVE_FILE_AS: 'save-file-as',
  SETTINGS: 'settings',
  CHECK_FOR_UPDATES: 'check-for-updates',
};