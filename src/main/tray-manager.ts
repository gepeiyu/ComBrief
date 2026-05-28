import { Menu, Tray } from 'electron';
import { showAboutWindow } from './about-window';
import { showSystemNotification } from './system-notification';
import { getAppDefinition } from './apps/registry';
import { getHubTrayIcon, getTrayIcon, statusToColor } from './tray-icons';
import type { LightStatus } from './state-machine';

const HUB_ID = '__hub__';

const STATUS_LABELS: Record<LightStatus, string> = {
  idle: '空闲',
  working: '工作中',
  waiting_user: '等待确认',
  offline: '离线',
};

interface TrayEntry {
  tray: Tray;
  status: LightStatus;
  frameIndex: number;
  lastUpdatedAt: number;
}

export class TrayManager {
  private entries = new Map<string, TrayEntry>();
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

  /** Always-visible menu bar / tray anchor (macOS especially). */
  ensureHubTray(): Tray {
    const existing = this.entries.get(HUB_ID);
    if (existing) return existing.tray;

    const tray = new Tray(getHubTrayIcon());
    tray.setToolTip('ComBrief — 右键打开设置，添加 AI App');
    tray.setTitle('');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'ComBrief', enabled: false },
        {
          label: '设置…',
          click: () => this.onOpenSettings?.(),
        },
        {
          label: '关于',
          click: () => showAboutWindow(),
        },
        { type: 'separator' },
        {
          label: '退出 ComBrief',
          click: () => this.onQuit?.(),
        },
      ]),
    );
    this.entries.set(HUB_ID, {
      tray,
      status: 'offline',
      frameIndex: 0,
      lastUpdatedAt: Date.now(),
    });
    return tray;
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

  removeHubTray(): void {
    const entry = this.entries.get(HUB_ID);
    if (!entry) return;
    entry.tray.destroy();
    this.entries.delete(HUB_ID);
  }

  ensureTray(appId: string): Tray {
    const existing = this.entries.get(appId);
    if (existing) return existing.tray;

    const app = getAppDefinition(appId);
    const tray = new Tray(getTrayIcon('gray', 0));
    tray.setToolTip(app.displayName);
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
    options?: { onReinstall?: () => void; onRemove?: () => void },
  ): void {
    const tray = this.ensureTray(appId);
    const app = getAppDefinition(appId);
    const entry = this.entries.get(appId)!;
    // 同类状态刷新（如连续 preToolUse）时不重置帧，否则呼吸/快闪动画无法推进
    if (entry.status !== status) {
      entry.frameIndex = 0;
    }
    entry.status = status;
    entry.lastUpdatedAt = Date.now();

    this.applyTrayVisual(tray, status, entry.frameIndex, appId);
    tray.setToolTip(`${app.displayName} — ${STATUS_LABELS[status]}`);

    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: `${STATUS_LABELS[status]} · ${new Date(entry.lastUpdatedAt).toLocaleTimeString()}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'ComBrief 设置…',
          click: () => this.onOpenSettings?.(),
        },
        {
          label: '重新安装 Hooks',
          click: () => options?.onReinstall?.(),
        },
        {
          label: '移除此 App',
          click: () => options?.onRemove?.(),
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => showAboutWindow(),
        },
        {
          label: '退出 ComBrief',
          click: () => this.onQuit?.(),
        },
      ]),
    );
  }

  removeTray(appId: string): void {
    if (appId === HUB_ID) return;
    const entry = this.entries.get(appId);
    if (!entry) return;
    entry.tray.destroy();
    this.entries.delete(appId);
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
      `${displayName} 需要你`,
      '请返回确认运行命令或继续对话',
    );
  }

  showMessage(title: string, body: string): void {
    showSystemNotification(title, body);
  }
}
