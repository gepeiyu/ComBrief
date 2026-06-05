import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { Locale } from './i18n';
import { getMessages } from './i18n';

let guideWindow: BrowserWindow | null = null;

export function showSlackSetupGuide(locale: Locale): void {
  const messages = getMessages(locale);
  const title = messages.settings.slackSetupGuideTitle;

  if (guideWindow && !guideWindow.isDestroyed()) {
    guideWindow.setTitle(title);
    void guideWindow.loadFile(
      join(__dirname, '..', 'renderer', 'slack-setup-guide.html'),
      { query: { locale } },
    );
    guideWindow.focus();
    return;
  }

  guideWindow = new BrowserWindow({
    width: 560,
    height: 680,
    minWidth: 420,
    minHeight: 400,
    title,
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'settings-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  void guideWindow.loadFile(
    join(__dirname, '..', 'renderer', 'slack-setup-guide.html'),
    { query: { locale } },
  );

  guideWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  guideWindow.once('ready-to-show', () => guideWindow?.show());
  guideWindow.on('closed', () => {
    guideWindow = null;
  });
}
