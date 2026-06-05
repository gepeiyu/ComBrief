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
import {
  applyLaunchAtLogin,
  readLaunchAtLoginState,
  wasOpenedAtLogin,
} from './login-item';
import { createCombriefServer } from './http-server';
import {
  getMessages,
  getRendererMessages,
  getSlackCardLabels,
  resolveLocale,
} from './i18n';
import { showSlackSetupGuide } from './slack-setup-window';
import { SlackRuntime } from './slack-runtime';
import { TrayManager } from './tray-manager';
import { APP_REGISTRY } from './apps/registry';

let controller: AppController;
let trayManager: TrayManager;
let slackRuntime: SlackRuntime;
let mainWindow: BrowserWindow | null = null;
const registeredApps = new Set<string>();

function slackCardLabels() {
  return getSlackCardLabels(resolveLocale(controller.getConfig().locale));
}

async function restartSlack(): Promise<void> {
  await slackRuntime.restart();
}

/** 把日志开关写入 config，供 bridge 子进程读取 */
function prepareRuntimeConfig(cfg: CombriefConfig): CombriefConfig {
  const eventLoggingEnabled = resolveEventLoggingEnabled(cfg);
  if (cfg.eventLoggingEnabled === eventLoggingEnabled) return cfg;
  const next = { ...cfg, eventLoggingEnabled };
  saveConfig(combriefHome(), next);
  return next;
}

function settingsMessages(): ReturnType<typeof getMessages> {
  return getMessages(resolveLocale(controller.getConfig().locale));
}

function applySettingsWindowChrome(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const m = settingsMessages();
  mainWindow.setTitle(m.settings.windowTitle);
}

function openSettings(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    applySettingsWindowChrome();
    mainWindow.focus();
    return;
  }

  const m = settingsMessages();
  mainWindow = new BrowserWindow({
    width: 420,
    height: 760,
    resizable: false,
    title: m.settings.windowTitle,
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

  ipcMain.handle('config:get', () => {
    const cfg = controller.getConfig();
    const state = readLaunchAtLoginState();
    if (state.effective !== cfg.launchAtLogin) {
      controller.updateConfig({ launchAtLogin: state.effective });
      const synced = controller.getConfig();
      saveConfig(combriefHome(), synced);
      return { ...synced, launchAtLoginIssue: state.issue };
    }
    return { ...cfg, launchAtLoginIssue: state.issue };
  });

  ipcMain.handle('config:set', async (_e, patch: object) => {
    const partial = patch as Partial<ReturnType<typeof controller.getConfig>>;
    controller.updateConfig(partial);
    let launchAtLoginIssue = null as ReturnType<
      typeof applyLaunchAtLogin
    >['issue'];
    if (typeof partial.launchAtLogin === 'boolean') {
      const state = applyLaunchAtLogin(partial.launchAtLogin);
      launchAtLoginIssue = state.issue;
      controller.updateConfig({ launchAtLogin: state.effective });
    }
    const cfg = controller.getConfig();
    if (partial.locale) {
      applySettingsWindowChrome();
    }
    if (partial.slack !== undefined || partial.locale !== undefined) {
      await restartSlack();
    }
    saveConfig(combriefHome(), cfg);
    return { ...cfg, launchAtLoginIssue };
  });

  ipcMain.handle('slack:status', () => slackRuntime.getStatus());

  ipcMain.handle('slack:test', async () => {
    await slackRuntime.sendTest();
    return { ok: true };
  });

  ipcMain.handle('slack:openSetupGuide', () => {
    showSlackSetupGuide(resolveLocale(controller.getConfig().locale));
  });

  ipcMain.handle('i18n:messages', () =>
    getRendererMessages(resolveLocale(controller.getConfig().locale)),
  );
}

app.whenReady().then(async () => {
  registerQuitHandlers();
  app.setName('ComBrief');
  if (process.platform === 'win32') {
    app.setAppUserModelId('app.combrief');
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  if (needsBackgroundWindow()) {
    ensureBackgroundWindow();
  }

  let cfg = prepareRuntimeConfig(ensureConfig());
  const launchState = applyLaunchAtLogin(cfg.launchAtLogin);
  if (launchState.effective !== cfg.launchAtLogin) {
    cfg = { ...cfg, launchAtLogin: launchState.effective };
    saveConfig(combriefHome(), cfg);
  }
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

  slackRuntime = new SlackRuntime(
    () => controller.getConfig(),
    slackCardLabels,
  );
  await slackRuntime.restart();

  const server = createCombriefServer({
    token: cfg.token,
    registeredApps,
    onState: (payload) => {
      controller.handleState(payload);
      slackRuntime.getDecisionService()?.tryResolveFromLocal(payload);
    },
    getDecisionService: () => slackRuntime.getDecisionService(),
    getSlackStatus: () => slackRuntime.getStatus(),
    onSlackTest: () => slackRuntime.sendTest(),
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(cfg.port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  registerIpc();

  setInterval(() => controller.tickTimeouts(), 1000);
  setInterval(() => trayManager.tickAnimations(), 100);

  if (cfg.apps.length === 0 && !wasOpenedAtLogin()) {
    openSettings();
  }
  // Tray app: keep running after the settings window closes (Windows/Linux).
  app.on('window-all-closed', () => {
    if (needsBackgroundWindow()) {
      ensureBackgroundWindow();
    }
  });
});
