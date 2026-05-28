import { BrowserWindow } from 'electron';
import type { App } from 'electron';

let backgroundWindow: BrowserWindow | null = null;
let quitting = false;

function electronApp(): App {
  // Lazy require avoids `app` being undefined during circular module init.
  const { app } = require('electron') as typeof import('electron');
  return app;
}

export function needsBackgroundWindow(): boolean {
  return process.platform === 'win32' || process.platform === 'linux';
}

export function ensureBackgroundWindow(): BrowserWindow | null {
  if (!needsBackgroundWindow()) return null;

  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    return backgroundWindow;
  }

  backgroundWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    skipTaskbar: true,
    frame: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  backgroundWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      backgroundWindow?.hide();
    }
  });

  void backgroundWindow.loadURL('data:text/html,<html></html>');
  return backgroundWindow;
}

export function destroyBackgroundWindow(): void {
  if (backgroundWindow && !backgroundWindow.isDestroyed()) {
    backgroundWindow.removeAllListeners('close');
    backgroundWindow.destroy();
  }
  backgroundWindow = null;
}

export function requestAppQuit(): void {
  quitting = true;
  destroyBackgroundWindow();
  electronApp().quit();
}

export function registerQuitHandlers(): void {
  electronApp().on('before-quit', () => {
    quitting = true;
    destroyBackgroundWindow();
  });
}
