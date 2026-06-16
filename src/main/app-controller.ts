import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CombriefConfig } from './config';
import {
  combriefHome,
  resolveEventLoggingEnabled,
  resolveTrayAbbrev,
} from './config';
import { getMessages, resolveLocale } from './i18n';
import { getAppDefinition } from './apps/registry';
import { installApp, uninstallApp } from './installer/install-app';
import { expandHomePath } from './installer/paths';
import { NotificationService } from './notification-service';
import {
  applyHeartbeatTimeout,
  applyPendingApprovalTimeout,
  reduceState,
  updatePendingApproval,
  type AppState,
  type LightStatus,
  type StateEvent,
  type StateMeta,
} from './state-machine';
import type { TrayManager } from './tray-manager';
import {
  HARDWARE_PROTOCOL_VERSION,
  type HardwareStateMessage,
  type HardwareStatus,
} from './hardware/protocol';

export class AppController {
  private apps = new Map<string, AppState>();
  private notifications: NotificationService;

  constructor(
    private cfg: CombriefConfig,
    private trayManager: TrayManager,
  ) {
    this.notifications = new NotificationService(30_000);
    this.trayManager.setMessages(getMessages(resolveLocale(this.cfg.locale)));
    this.trayManager.setTrayAbbrevResolver((appId) =>
      resolveTrayAbbrev(appId, this.cfg),
    );
  }

  private uiMessages() {
    return getMessages(resolveLocale(this.cfg.locale));
  }

  bootstrapRegisteredApps(): void {
    for (const appId of this.cfg.apps) {
      this.apps.set(appId, this.freshState('idle'));
      this.trayManager.ensureTray(appId);
      this.trayManager.setStatus(appId, 'idle', this.trayCallbacks(appId));
    }
  }

  handleState(payload: {
    appId: string;
    event: StateEvent;
    timestamp: number;
    meta?: StateMeta;
  }): void {
    const prev = this.apps.get(payload.appId) ?? this.freshState('offline');
    const pendingApprovalSince = updatePendingApproval(
      payload.event,
      payload.timestamp,
      prev.pendingApprovalSince,
      payload.meta,
    );
    const nextStatus = reduceState(prev.status, payload.event, payload.meta);
    const next: AppState = {
      status: nextStatus,
      lastEventAt: payload.timestamp,
      lastHeartbeatAt: payload.timestamp,
      pendingApprovalSince,
    };
    this.apps.set(payload.appId, next);
    this.logEvent(payload.appId, payload.event, nextStatus);

    if (
      this.cfg.notificationsEnabled &&
      this.notifications.shouldNotify(
        payload.appId,
        next.status,
        prev.status,
      )
    ) {
      const app = getAppDefinition(payload.appId);
      this.trayManager.notify(app.displayName, true);
      this.notifications.markNotified(payload.appId);
    }

    this.trayManager.setStatus(
      payload.appId,
      next.status,
      this.trayCallbacks(payload.appId),
    );
  }

  tickTimeouts(): boolean {
    const now = Date.now();
    let changed = false;
    for (const [appId, state] of this.apps) {
      let next = applyHeartbeatTimeout(
        state,
        this.cfg.heartbeatTimeoutMs,
        now,
      );
      next = applyPendingApprovalTimeout(
        next,
        this.cfg.pendingToolApprovalMs ?? 5_000,
        now,
      );

      if (next.status !== state.status) {
        changed = true;
        this.apps.set(appId, next);

        if (
          this.cfg.notificationsEnabled &&
          this.notifications.shouldNotify(appId, next.status, state.status)
        ) {
          const app = getAppDefinition(appId);
          this.trayManager.notify(app.displayName, true);
          this.notifications.markNotified(appId);
        }

        this.trayManager.setStatus(
          appId,
          next.status,
          this.trayCallbacks(appId),
        );
      }
    }

    return changed;
  }

  async install(appId: string): Promise<void> {
    installApp(appId);
    if (!this.cfg.apps.includes(appId)) {
      this.cfg.apps.push(appId);
    }
    this.trayManager.removeHubTray();
    this.apps.set(appId, this.freshState('idle'));
    this.trayManager.ensureTray(appId);
    this.trayManager.setStatus(appId, 'idle', this.trayCallbacks(appId));
  }

  async uninstall(appId: string): Promise<void> {
    uninstallApp(appId);
    this.cfg.apps = this.cfg.apps.filter((id) => id !== appId);
    this.apps.delete(appId);
    this.trayManager.removeTray(appId);
    if (this.cfg.apps.length === 0) {
      this.trayManager.ensureHubTray();
    }
  }

  getConfig(): CombriefConfig {
    return this.cfg;
  }

  updateConfig(patch: Partial<CombriefConfig>): void {
    const prevLocale = this.cfg.locale;
    this.cfg = {
      ...this.cfg,
      ...patch,
      trayAbbrevs: patch.trayAbbrevs
        ? { ...this.cfg.trayAbbrevs, ...patch.trayAbbrevs }
        : this.cfg.trayAbbrevs,
      slack: patch.slack
        ? { ...this.cfg.slack, ...patch.slack }
        : this.cfg.slack,
      hardware: patch.hardware
        ? { ...this.cfg.hardware, ...patch.hardware }
        : this.cfg.hardware,
      locale: patch.locale
        ? resolveLocale(patch.locale)
        : this.cfg.locale,
    };
    this.notifications = new NotificationService(30_000);
    this.trayManager.setTrayAbbrevResolver((appId) =>
      resolveTrayAbbrev(appId, this.cfg),
    );
    if (patch.locale && resolveLocale(patch.locale) !== prevLocale) {
      this.trayManager.setMessages(this.uiMessages());
    }
  }

  clearPendingApproval(appId: string): boolean {
    const state = this.apps.get(appId);
    if (!state) return false;
    if (state.pendingApprovalSince === null && state.status !== 'waiting_user') return false;

    const next: AppState = {
      ...state,
      status: state.status === 'waiting_user' ? 'working' : state.status,
      pendingApprovalSince: null,
    };
    this.apps.set(appId, next);
    if (next.status !== state.status) {
      this.trayManager.setStatus(appId, next.status, this.trayCallbacks(appId));
    }
    return true;
  }

  getHardwareStateSnapshot(_appVersion: string): HardwareStateMessage {
    const apps = [...this.apps.entries()].map(([id, state]) => ({
      id,
      label: resolveTrayAbbrev(id, this.cfg) || getAppDefinition(id).trayAbbrev,
      status: state.status,
    }));
    const primaryApp =
      apps.find((item) => item.status === 'waiting_user') ??
      apps.find((item) => item.status === 'working') ??
      apps[0];

    return {
      protocol: HARDWARE_PROTOCOL_VERSION,
      type: 'state',
      appSummary: apps
        .slice(0, 2)
        .map((item) => `${item.label} [${this.hardwareStatusLabel(item.status)}]`)
        .join('\n'),
      primary: primaryApp?.id,
      primaryStatus: primaryApp?.status ?? 'idle',
    };
  }

  private hardwareStatusLabel(status: HardwareStatus): string {
    if (status === 'idle') return 'OK';
    if (status === 'working') return 'WORK';
    if (status === 'waiting_user') return 'ASK';
    return 'OFF';
  }

  private trayCallbacks(appId: string) {
    return {
      onReinstall: () => {
        const app = getAppDefinition(appId);
        const hooksPath = expandHomePath(app.hooksConfigRelPath);
        try {
          installApp(appId);
          const m = this.uiMessages();
          this.trayManager.showMessage(
            m.app.hooksReinstalledTitle,
            m.app.hooksReinstalledBody(app.displayName, hooksPath),
          );
        } catch (err) {
          const m = this.uiMessages();
          const message =
            err instanceof Error ? err.message : m.app.unknownError;
          this.trayManager.showMessage(
            m.app.installFailedTitle,
            `${app.displayName}: ${message}`,
          );
        }
      },
      onRemove: () => {
        void this.uninstall(appId);
      },
    };
  }

  private logEvent(appId: string, event: StateEvent, status: LightStatus): void {
    if (!resolveEventLoggingEnabled(this.cfg)) return;
    try {
      const logDir = join(combriefHome(), 'logs');
      mkdirSync(logDir, { recursive: true });
      appendFileSync(
        join(logDir, 'events.log'),
        `${new Date().toISOString()} ${appId} ${event} -> ${status}\n`,
      );
    } catch {
      // ignore logging errors
    }
  }

  private freshState(status: LightStatus): AppState {
    const now = Date.now();
    return {
      status,
      lastEventAt: now,
      lastHeartbeatAt: now,
      pendingApprovalSince: null,
    };
  }
}
