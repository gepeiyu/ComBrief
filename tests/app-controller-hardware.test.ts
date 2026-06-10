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
      appName: 'ComBrief',
      appVersion: '0.1.2',
      primary: 'cursor',
    });
    expect(snapshot.ts).toEqual(expect.any(Number));
    expect(snapshot.apps).toEqual([
      { id: 'claude-code', label: 'CC', status: 'working' },
      { id: 'cursor', label: 'C', status: 'waiting_user' },
    ]);
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
