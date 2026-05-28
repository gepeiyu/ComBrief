import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { Messages } from './i18n';

let aboutWindow: BrowserWindow | null = null;

export function showAboutWindow(messages: Messages): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.setTitle(messages.about.windowTitle);
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 480,
    height: 248,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: messages.about.windowTitle,
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'settings-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const htmlPath = join(__dirname, '..', 'renderer', 'about.html');
  void aboutWindow.loadFile(htmlPath, {
    query: { v: app.getVersion() },
  });

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  aboutWindow.once('ready-to-show', () => aboutWindow?.show());
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}
