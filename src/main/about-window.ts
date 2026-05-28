import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

let aboutWindow: BrowserWindow | null = null;

export function showAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
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
    title: '关于',
    show: false,
    webPreferences: {
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
