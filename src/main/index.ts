import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { AppController } from './app-controller';
import {
  ensureBackgroundWindow,
  needsBackgroundWindow,
  registerQuitHandlers,
  requestAppQuit,
} from './background-window';
import {
  combriefHome,
  ensureConfig,
  resolveEventLoggingEnabled,
  saveConfig,
  type CombriefConfig,
} from './config';
import { applyLaunchAtLogin } from './login-item';
import { createCombriefServer } from './http-server';
import { TrayManager } from './tray-manager';
import { APP_REGISTRY } from './apps/registry';

let controller: AppController;
let trayManager: TrayManager;
let mainWindow: BrowserWindow | null = null;
const registeredApps = new Set<string>();

/** 把日志开关写入 config，供 bridge 子进程读取 */
function prepareRuntimeConfig(cfg: CombriefConfig): CombriefConfig {
  const eventLoggingEnabled = resolveEventLoggingEnabled(cfg);
  if (cfg.eventLoggingEnabled === eventLoggingEnabled) return cfg;
  const next = { ...cfg, eventLoggingEnabled };
  saveConfig(combriefHome(), next);
  return next;
}

function openSettings(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, '..', 'renderer', 'settings.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('apps:list', () =>
    APP_REGISTRY.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      trayAbbrev: a.trayAbbrev,
      installed: controller.getConfig().apps.includes(a.id),
    })),
  );

  ipcMain.handle('apps:install', async (_e, appId: string) => {
    await controller.install(appId);
    registeredApps.add(appId);
    saveConfig(combriefHome(), controller.getConfig());
    return { ok: true };
  });

  ipcMain.handle('apps:uninstall', async (_e, appId: string) => {
    await controller.uninstall(appId);
    registeredApps.delete(appId);
    saveConfig(combriefHome(), controller.getConfig());
    return { ok: true };
  });

  ipcMain.handle('config:get', () => controller.getConfig());

  ipcMain.handle('config:set', (_e, patch: object) => {
    const partial = patch as Partial<ReturnType<typeof controller.getConfig>>;
    controller.updateConfig(partial);
    const cfg = controller.getConfig();
    if (typeof partial.launchAtLogin === 'boolean') {
      applyLaunchAtLogin(partial.launchAtLogin);
    }
    saveConfig(combriefHome(), cfg);
    return cfg;
  });
}

app.whenReady().then(async () => {
  registerQuitHandlers();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  if (needsBackgroundWindow()) {
    ensureBackgroundWindow();
  }

  const cfg = prepareRuntimeConfig(ensureConfig());
  applyLaunchAtLogin(cfg.launchAtLogin);
  for (const appId of cfg.apps) registeredApps.add(appId);

  trayManager = new TrayManager({
    onOpenSettings: openSettings,
    onQuit: requestAppQuit,
  });
  if (cfg.apps.length === 0) {
    trayManager.ensureHubTray();
  }
  controller = new AppController(cfg, trayManager);
  controller.bootstrapRegisteredApps();

  const server = createCombriefServer({
    token: cfg.token,
    registeredApps,
    onState: (payload) => controller.handleState(payload),
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(cfg.port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  registerIpc();

  setInterval(() => controller.tickTimeouts(), 1000);
  setInterval(() => trayManager.tickAnimations(), 100);

  if (cfg.apps.length === 0) {
    openSettings();
  }
  // Tray app: keep running after the settings window closes (Windows/Linux).
  app.on('window-all-closed', () => {
    if (needsBackgroundWindow()) {
      ensureBackgroundWindow();
    }
  });
});
