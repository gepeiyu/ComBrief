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
import { HardwareRuntime } from './hardware/runtime';
import { WebBluetoothBridgeTransport } from './hardware/web-bluetooth-bridge-transport';
import { HardwareStatePusher } from './hardware/state-pusher';
import { createWebBluetoothBridgeWindowManager } from './hardware/web-bluetooth-bridge-window';
import { refreshRegisteredAppScripts } from './installer/install-app';

let controller: AppController;
let trayManager: TrayManager;
let slackRuntime: SlackRuntime;
let hardwareRuntime: HardwareRuntime;
let hardwareTransport: WebBluetoothBridgeTransport;
let hardwareStatePusher: HardwareStatePusher;
let mainWindow: BrowserWindow | null = null;
const registeredApps = new Set<string>();

function slackCardLabels() {
  return getSlackCardLabels(resolveLocale(controller.getConfig().locale));
}

async function restartSlack(): Promise<void> {
  await slackRuntime.restart();
}

function logHardwareStatePushError(error: unknown): void {
  console.warn('ComBrief Remote state push failed', error);
}

async function sendHardwareStateSnapshot(): Promise<void> {
  await hardwareRuntime.sendState(controller.getHardwareStateSnapshot(app.getVersion()));
}

async function sendHardwareStateSnapshotSafely(): Promise<void> {
  try {
    await sendHardwareStateSnapshot();
  } catch (error) {
    logHardwareStatePushError(error);
  }
}

async function restartHardware(): Promise<void> {
  if (controller.getConfig().hardware.enabled) {
    await hardwareRuntime.restart();
    if (controller.getConfig().hardware.statusPushEnabled) {
      await sendHardwareStateSnapshotSafely();
    }
  } else {
    await hardwareRuntime.stop();
  }
}

function hardwareDecisionPushEnabled(): boolean {
  const cfg = controller.getConfig();
  return cfg.hardware.enabled && cfg.hardware.decisionPushEnabled;
}

function pushHardwareStateIfEnabled(): void {
  const cfg = controller.getConfig();
  if (!cfg.hardware.enabled || !cfg.hardware.statusPushEnabled) return;
  if (slackRuntime.getDecisionService()?.hasPendingHardwareRequests()) return;
  hardwareStatePusher.request();
}

function tickControllerTimeoutsAndPushHardwareState(): void {
  if (controller.tickTimeouts()) {
    pushHardwareStateIfEnabled();
    slackRuntime.getDecisionService()?.resendPendingHardwareRequests();
  }
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
    if (partial.hardware !== undefined) {
      await restartHardware();
    }
    if (partial.slack !== undefined || partial.locale !== undefined || partial.hardware !== undefined) {
      await restartSlack();
    }
    saveConfig(combriefHome(), cfg);
    return { ...cfg, launchAtLoginIssue };
  });

  ipcMain.handle('slack:status', () => slackRuntime.getStatus());

  ipcMain.handle('hardware:status', () => hardwareRuntime.getStatus());

  ipcMain.handle('hardware:connect', async () => {
    if (!controller.getConfig().hardware.enabled) {
      controller.updateConfig({
        hardware: { ...controller.getConfig().hardware, enabled: true },
      });
      saveConfig(combriefHome(), controller.getConfig());
    }
    await hardwareRuntime.start();
    await restartSlack();
    await hardwareTransport.openPairing();
    return hardwareRuntime.getStatus();
  });

  ipcMain.handle('hardware:disconnect', async () => {
    await hardwareRuntime.stop();
    return hardwareRuntime.getStatus();
  });

  ipcMain.handle('hardware:testDisplay', async () => {
    const status = hardwareRuntime.getStatus();
    if (!status.started || !status.connected) {
      throw new Error('ComBrief Remote is not connected');
    }

    const now = Date.now();
    await hardwareRuntime.sendRequest({
      protocol: 1,
      type: 'request',
      appName: 'ComBrief',
      appVersion: app.getVersion(),
      decisionId: `test-${now}`,
      source: 'combrief-test',
      sourceLabel: 'TEST',
      kind: 'PERMISSION',
      brief: 'Test display',
      content: `ComBrief test\n${new Date(now).toLocaleTimeString()}`,
      options: [
        { id: 'ok', label: 'OK' },
      ],
      defaultFocus: 'ok',
      expiresAt: now + 60_000,
    });
    return { ok: true };
  });

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
  refreshRegisteredAppScripts(cfg.apps);

  trayManager = new TrayManager({
    onOpenSettings: openSettings,
    onQuit: requestAppQuit,
  });
  if (cfg.apps.length === 0) {
    trayManager.ensureHubTray();
  }
  controller = new AppController(cfg, trayManager);
  controller.bootstrapRegisteredApps();

  const bridgeWindowManager = createWebBluetoothBridgeWindowManager({
    preloadPath: join(__dirname, '..', 'preload', 'hardware-bridge-preload.js'),
    rendererPath: join(__dirname, '..', 'renderer', 'hardware-bridge.html'),
    messages: settingsMessages().remotePairing,
  });
  hardwareTransport = new WebBluetoothBridgeTransport(bridgeWindowManager, ipcMain);
  hardwareRuntime = new HardwareRuntime(
    hardwareTransport,
    {
      onDecision: (message) => {
        if (message.decisionId.startsWith('test-')) {
          void hardwareRuntime.sendResolved({
            protocol: 1,
            type: 'resolved',
            decisionId: message.decisionId,
            result: 'selected',
            message: 'Test display acknowledged',
          }).catch(logHardwareStatePushError);
          return;
        }
        slackRuntime.getDecisionService()?.resolveFromHardware(message);
      },
      onHello: () => {
        pushHardwareStateIfEnabled();
        slackRuntime.getDecisionService()?.resendPendingHardwareRequests();
      },
    },
  );
  hardwareStatePusher = new HardwareStatePusher(
    sendHardwareStateSnapshot,
    logHardwareStatePushError,
  );

  slackRuntime = new SlackRuntime(
    () => controller.getConfig(),
    slackCardLabels,
    () => hardwareRuntime,
  );

  const server = createCombriefServer({
    token: cfg.token,
    registeredApps,
    onState: (payload) => {
      controller.handleState(payload);
      slackRuntime.getDecisionService()?.tryResolveFromLocal(payload);
      if (payload.event === 'permissionRequest' && hardwareDecisionPushEnabled()) {
        slackRuntime.getDecisionService()?.resendPendingHardwareRequests();
      } else {
        pushHardwareStateIfEnabled();
      }
    },
    onLocalDecisionResolved: (payload) => {
      controller.clearPendingApproval(payload.appId);
      pushHardwareStateIfEnabled();
    },
    getDecisionService: () => slackRuntime.getDecisionService(),
    getSlackStatus: () => slackRuntime.getStatus(),
    onSlackTest: () => slackRuntime.sendTest(),
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(cfg.port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  if (cfg.hardware.enabled) {
    await hardwareRuntime.start();
    if (cfg.hardware.autoReconnect) {
      void hardwareTransport.openPairing({ autoConnect: true }).catch(logHardwareStatePushError);
    }
    if (cfg.hardware.statusPushEnabled) {
      await sendHardwareStateSnapshotSafely();
    }
  }
  await slackRuntime.restart();

  registerIpc();

  setInterval(() => tickControllerTimeoutsAndPushHardwareState(), 1000);
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
