import { Menu, Tray } from 'electron';
import { showAboutWindow } from './about-window';
import { getMessages, type Messages } from './i18n';
import { showSystemNotification } from './system-notification';
import { getAppDefinition } from './apps/registry';
import { getHubTrayIcon, getTrayIcon, statusToColor } from './tray-icons';
import type { LightStatus } from './state-machine';

const HUB_ID = '__hub__';

interface TrayMenuOptions {
  onReinstall?: () => void;
  onRemove?: () => void;
}

interface TrayEntry {
  tray: Tray;
  status: LightStatus;
  frameIndex: number;
  lastUpdatedAt: number;
}

export class TrayManager {
  private entries = new Map<string, TrayEntry>();
  private appMenuOptions = new Map<string, TrayMenuOptions>();
  private messages: Messages = getMessages('en');
  private onOpenSettings?: () => void;
  private onQuit?: () => void;
  private resolveTrayAbbrev: (appId: string) => string = () => '';

  constructor(options?: {
    onOpenSettings?: () => void;
    onQuit?: () => void;
  }) {
    this.onOpenSettings = options?.onOpenSettings;
    this.onQuit = options?.onQuit;
  }

  setMessages(messages: Messages): void {
    this.messages = messages;
    this.refreshAllMenus();
  }

  setTrayAbbrevResolver(fn: (appId: string) => string): void {
    this.resolveTrayAbbrev = fn;
    this.refreshAllTrayAbbrevs();
  }

  refreshAllTrayAbbrevs(): void {
    for (const [appId, entry] of this.entries) {
      if (appId === HUB_ID) continue;
      this.applyTrayVisual(entry.tray, entry.status, entry.frameIndex, appId);
    }
  }

  refreshAllMenus(): void {
    for (const [appId, entry] of this.entries) {
      if (appId === HUB_ID) {
        this.applyHubMenu(entry.tray);
        continue;
      }
      const options = this.appMenuOptions.get(appId);
      this.applyAppMenu(appId, entry, options);
      entry.tray.setToolTip(
        `${getAppDefinition(appId).displayName} — ${this.messages.status[entry.status]}`,
      );
    }
  }

  ensureHubTray(): Tray {
    const existing = this.entries.get(HUB_ID);
    if (existing) {
      this.applyHubMenu(existing.tray);
      return existing.tray;
    }

    const tray = new Tray(getHubTrayIcon());
    tray.setTitle('');
    this.entries.set(HUB_ID, {
      tray,
      status: 'offline',
      frameIndex: 0,
      lastUpdatedAt: Date.now(),
    });
    this.applyHubMenu(tray);
    return tray;
  }

  private applyHubMenu(tray: Tray): void {
    const m = this.messages.tray;
    tray.setToolTip(this.messages.tray.hubTooltip);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'ComBrief', enabled: false },
        { label: m.settings, click: () => this.onOpenSettings?.() },
        { label: m.about, click: () => showAboutWindow(this.messages) },
        { type: 'separator' },
        { label: m.quit, click: () => this.onQuit?.() },
      ]),
    );
  }

  private applyTrayVisual(
    tray: Tray,
    status: LightStatus,
    frameIndex: number,
    appId?: string,
  ): void {
    const abbrev = appId ? this.resolveTrayAbbrev(appId) : undefined;
    tray.setImage(
      getTrayIcon(statusToColor(status), frameIndex, abbrev || undefined),
    );
    tray.setTitle('');
  }

  private applyAppMenu(
    appId: string,
    entry: TrayEntry,
    options?: TrayMenuOptions,
  ): void {
    const app = getAppDefinition(appId);
    const m = this.messages.tray;
    const statusLabel = this.messages.status[entry.status];
    entry.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: `${statusLabel} · ${new Date(entry.lastUpdatedAt).toLocaleTimeString()}`,
          enabled: false,
        },
        { type: 'separator' },
        { label: m.appSettings, click: () => this.onOpenSettings?.() },
        { label: m.reinstallHooks, click: () => options?.onReinstall?.() },
        { label: m.removeApp, click: () => options?.onRemove?.() },
        { type: 'separator' },
        { label: m.about, click: () => showAboutWindow(this.messages) },
        { label: m.quit, click: () => this.onQuit?.() },
      ]),
    );
    entry.tray.setToolTip(`${app.displayName} — ${statusLabel}`);
  }

  removeHubTray(): void {
    const entry = this.entries.get(HUB_ID);
    if (!entry) return;
    entry.tray.destroy();
    this.entries.delete(HUB_ID);
  }

  ensureTray(appId: string): Tray {
    const existing = this.entries.get(appId);
    if (existing) return existing.tray;

    const tray = new Tray(getTrayIcon('gray', 0));
    this.entries.set(appId, {
      tray,
      status: 'offline',
      frameIndex: 0,
      lastUpdatedAt: Date.now(),
    });
    this.applyTrayVisual(tray, 'offline', 0, appId);
    return tray;
  }

  setStatus(
    appId: string,
    status: LightStatus,
    options?: TrayMenuOptions,
  ): void {
    const tray = this.ensureTray(appId);
    const entry = this.entries.get(appId)!;
    if (options) {
      this.appMenuOptions.set(appId, options);
    }
    if (entry.status !== status) {
      entry.frameIndex = 0;
    }
    entry.status = status;
    entry.lastUpdatedAt = Date.now();

    this.applyTrayVisual(tray, status, entry.frameIndex, appId);
    this.applyAppMenu(appId, entry, this.appMenuOptions.get(appId));
  }

  removeTray(appId: string): void {
    if (appId === HUB_ID) return;
    const entry = this.entries.get(appId);
    if (!entry) return;
    entry.tray.destroy();
    this.entries.delete(appId);
    this.appMenuOptions.delete(appId);
  }

  tickAnimations(): void {
    for (const [appId, entry] of this.entries) {
      if (appId === HUB_ID) continue;
      entry.frameIndex += 1;
      if (entry.status === 'working' || entry.status === 'waiting_user') {
        this.applyTrayVisual(entry.tray, entry.status, entry.frameIndex, appId);
      }
    }
  }

  notify(displayName: string, enabled: boolean): void {
    if (!enabled) return;
    showSystemNotification(
      this.messages.notify.title(displayName),
      this.messages.notify.body,
    );
  }

  showMessage(title: string, body: string): void {
    showSystemNotification(title, body);
  }
}
