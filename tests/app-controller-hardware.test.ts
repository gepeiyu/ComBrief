import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/main/app-controller';
import { defaultConfig, type CombriefConfig } from '../src/main/config';
import type { TrayManager } from '../src/main/tray-manager';

function fakeTrayManager(): TrayManager {
  return {
    setMessages() {},
    setTrayAbbrevResolver() {},
    ensureTray() {},
    ensureHubTray() {},
    removeHubTray() {},
    removeTray() {},
    setStatus() {},
    notify() {},
    showMessage() {},
  } as unknown as TrayManager;
}

function makeController(config: Partial<CombriefConfig> = {}) {
  const cfg = {
    ...defaultConfig(),
    apps: ['claude-code', 'cursor'],
    notificationsEnabled: false,
    pendingToolApprovalMs: 5,
    ...config,
  };
  const controller = new AppController(cfg, fakeTrayManager());
  controller.bootstrapRegisteredApps();
  return controller;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AppController hardware snapshots', () => {
  it('exposes current app states with tray labels for hardware runtime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(30);
    const controller = makeController();

    controller.handleState({
      appId: 'claude-code',
      event: 'beforeSubmitPrompt',
      timestamp: 10,
    });
    controller.handleState({
      appId: 'cursor',
      event: 'preToolUse',
      timestamp: 20,
      meta: { toolName: 'Shell' },
    });
    controller.tickTimeouts();

    const snapshot = controller.getHardwareStateSnapshot('0.1.2');

    expect(snapshot).toMatchObject({
      protocol: 1,
      type: 'state',
      primary: 'cursor',
      primaryLabel: 'C',
      primaryStatus: 'waiting_user',
      skipFastWaitingUser: true,
      appSummary: 'CC [WORK]\nC [ASK]',
    });
    expect(snapshot).not.toHaveProperty('apps');
  });

  it('reports when timeout ticks change app state so hardware can be pushed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(30);
    const controller = makeController();

    controller.handleState({
      appId: 'cursor',
      event: 'preToolUse',
      timestamp: 20,
      meta: { toolName: 'Shell' },
    });

    expect(controller.tickTimeouts()).toBe(true);
    expect(controller.getHardwareStateSnapshot('0.1.2')).toMatchObject({
      primary: 'cursor',
      primaryStatus: 'waiting_user',
      appSummary: 'CC [OK]\nC [ASK]',
    });
    expect(controller.tickTimeouts()).toBe(false);
  });

  it('clears pending approval after local terminal confirmation before timeout ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10);
    const controller = makeController();

    controller.handleState({
      appId: 'claude-code',
      event: 'permissionRequest',
      timestamp: 10,
      meta: { toolName: 'Bash' },
    });

    expect(controller.clearPendingApproval('claude-code')).toBe(true);
    vi.setSystemTime(20);
    expect(controller.tickTimeouts()).toBe(false);
    expect(controller.getHardwareStateSnapshot('0.1.2')).toMatchObject({
      primary: 'claude-code',
      primaryStatus: 'working',
      appSummary: 'CC [WORK]\nC [OK]',
    });
  });

  it('moves already waiting approval back to working after local terminal confirmation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(30);
    const controller = makeController();

    controller.handleState({
      appId: 'claude-code',
      event: 'permissionRequest',
      timestamp: 10,
      meta: { toolName: 'Bash' },
    });
    expect(controller.tickTimeouts()).toBe(true);

    expect(controller.clearPendingApproval('claude-code')).toBe(true);
    expect(controller.getHardwareStateSnapshot('0.1.2')).toMatchObject({
      primary: 'claude-code',
      primaryStatus: 'working',
      appSummary: 'CC [WORK]\nC [OK]',
    });
  });

  it('selects working primary before falling back to the first app', () => {
    const controller = makeController();

    expect(controller.getHardwareStateSnapshot('0.1.2').primary).toBe('claude-code');

    controller.handleState({
      appId: 'cursor',
      event: 'beforeSubmitPrompt',
      timestamp: 10,
    });

    expect(controller.getHardwareStateSnapshot('0.1.2').primary).toBe('cursor');
  });

  it('keeps hardware state snapshots compact for low-latency BLE writes', () => {
    const controller = makeController();

    controller.handleState({
      appId: 'claude-code',
      event: 'beforeSubmitPrompt',
      timestamp: 10,
    });

    const snapshot = controller.getHardwareStateSnapshot('0.1.2');
    const encoded = JSON.stringify(snapshot);

    expect(snapshot).toMatchObject({
      protocol: 1,
      type: 'state',
      primary: 'claude-code',
      primaryStatus: 'working',
      appSummary: 'CC [WORK]\nC [OK]',
    });
    expect(encoded).not.toContain('appVersion');
    expect(encoded).not.toContain('lastEventAt');
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThanOrEqual(130);
  });

  it('merges nested hardware config updates without dropping existing fields', () => {
    const controller = makeController({
      hardware: {
        ...defaultConfig().hardware,
        enabled: true,
        lastDeviceId: 'device-1',
        statusPushEnabled: true,
        decisionPushEnabled: true,
      },
    });

    controller.updateConfig({
      hardware: { statusPushEnabled: false },
    } as Partial<CombriefConfig>);

    expect(controller.getConfig().hardware).toEqual({
      ...defaultConfig().hardware,
      enabled: true,
      lastDeviceId: 'device-1',
      statusPushEnabled: false,
      decisionPushEnabled: true,
    });
  });
});
