import { app, Menu, BrowserWindow, shell, dialog } from 'electron';
import { is } from 'electron-util';
import { MENU_ITEM_IDS } from '../../shared/constants';

/**
 * Creates the application menu
 */
export function createAppMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin';
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Preferences...',
                accelerator: 'CmdOrCtrl+,',
                click: () => {
                  mainWindow.webContents.send('menu:navigate', '/settings');
                },
              },
              { type: 'separator' },
              {
                label: 'Check for Updates...',
                id: MENU_ITEM_IDS.CHECK_FOR_UPDATES,
                click: () => {
                  mainWindow.webContents.send('menu:check-updates');
                },
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu:new-file');
          },
        },
        {
          label: 'Open...',
          id: MENU_ITEM_IDS.OPEN_FILE,
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu:open-file');
          },
        },
        { type: 'separator' },
        {
          label: 'Save',
          id: MENU_ITEM_IDS.SAVE_FILE,
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu:save-file');
          },
        },
        {
          label: 'Save As...',
          id: MENU_ITEM_IDS.SAVE_FILE_AS,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu:save-file-as');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
        ...(!isMac
          ? [
              { type: 'separator' },
              {
                label: 'Preferences',
                id: MENU_ITEM_IDS.SETTINGS,
                accelerator: 'Ctrl+,',
                click: () => {
                  mainWindow.webContents.send('menu:navigate', '/settings');
                },
              },
            ]
          : []),
      ],
    },
    
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(is.development ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ]
          : [{ role: 'close' }]),
      ],
    },
    
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://electronjs.org');
          },
        },
        {
          label: 'About',
          click: () => {
            mainWindow.webContents.send('menu:navigate', '/about');
          },
        },
        ...(!isMac
          ? [
              {
                label: 'Check for Updates...',
                id: MENU_ITEM_IDS.CHECK_FOR_UPDATES,
                click: () => {
                  mainWindow.webContents.send('menu:check-updates');
                },
              },
            ]
          : []),
      ],
    },
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}