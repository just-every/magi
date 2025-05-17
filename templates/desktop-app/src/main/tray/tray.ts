import { app, Menu, Tray, BrowserWindow, nativeImage } from 'electron';
import path from 'path';

let tray: Tray | null = null;

/**
 * Sets up the application tray icon and menu
 */
export function setupTray(mainWindow: BrowserWindow): Tray {
  // Create tray icon
  const iconPath = path.join(__dirname, '../../assets/icons/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  
  // Create or reuse the tray instance
  if (tray === null) {
    tray = new Tray(icon);
  } else {
    tray.setImage(icon);
  }
  
  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      },
    },
    { type: 'separator' },
    {
      label: 'New Document',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('menu:new-file');
      },
    },
    {
      label: 'Open Document...',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('menu:open-file');
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('menu:navigate', '/settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
  
  // Set tray properties
  tray.setToolTip(app.name);
  tray.setContextMenu(contextMenu);
  
  // Show app on tray click (Windows/Linux behavior)
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    });
  }
  
  return tray;
}