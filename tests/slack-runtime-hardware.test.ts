import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackRuntime } from '../src/main/slack-runtime';
import { defaultConfig, type CombriefConfig } from '../src/main/config';
import { getSlackCardLabels } from '../src/main/i18n/messages';
import { HardwareRuntime } from '../src/main/hardware/runtime';
import { MockHardwareTransport } from '../src/main/hardware/mock-transport';
import type { DecisionWaitBody } from '../src/main/decision/types';

function config(overrides: Partial<CombriefConfig> = {}): CombriefConfig {
  const base = defaultConfig();
  return {
    ...base,
    slack: {
      ...base.slack,
      enabled: false,
      decisionTimeoutMs: 50_000,
    },
    hardware: {
      ...base.hardware,
      enabled: true,
      decisionPushEnabled: true,
      statusPushEnabled: true,
    },
    ...overrides,
  };
}

function permissionBody(): DecisionWaitBody {
  return {
    appId: 'claude-code',
    hookEvent: 'permissionRequest',
    sessionId: 'sess-runtime',
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SlackRuntime hardware DecisionService wiring', () => {
  it('creates a hardware-only DecisionService when Slack is disabled and hardware decisions are enabled', async () => {
    vi.useFakeTimers();
    const cfg = config();
    const transport = new MockHardwareTransport();
    let runtime!: HardwareRuntime;
    runtime = new HardwareRuntime(transport, {
      onDecision: (message) => {
        runtimeService.getDecisionService()?.resolveFromHardware(message);
      },
    });
    await runtime.start();

    const runtimeService = new SlackRuntime(
      () => cfg,
      () => getSlackCardLabels('en'),
      () => runtime,
    );

    await runtimeService.restart();

    const service = runtimeService.getDecisionService();
    expect(service).not.toBeNull();

    const wait = service!.handleWait(permissionBody());
    const request = transport.sentMessages.find((message) => message.type === 'request');
    expect(request).toMatchObject({
      type: 'request',
      source: 'claude-code',
      sourceLabel: 'CC',
    });

    if (request?.type === 'request') {
      transport.emitDeviceMessage({
        protocol: 1,
        type: 'decision',
        decisionId: request.decisionId,
        optionId: 'allow',
        ts: Date.now(),
      });
    }

    const result = await wait;
    expect(result.hookStdout).toContain('allow');
  });

  it('does not create a hardware-only DecisionService when hardware decisions are disabled', async () => {
    const cfg = config({
      hardware: {
        ...defaultConfig().hardware,
        enabled: false,
        decisionPushEnabled: true,
      },
    });
    const runtime = new HardwareRuntime(new MockHardwareTransport());
    const runtimeService = new SlackRuntime(
      () => cfg,
      () => getSlackCardLabels('en'),
      () => runtime,
    );

    await runtimeService.restart();

    expect(runtimeService.getDecisionService()).toBeNull();
  });

  it('cancels pending hardware-only wait when stopped', async () => {
    vi.useFakeTimers();
    const cfg = config();
    const transport = new MockHardwareTransport();
    const hardware = new HardwareRuntime(transport);
    await hardware.start();
    const runtimeService = new SlackRuntime(
      () => cfg,
      () => getSlackCardLabels('en'),
      () => hardware,
    );
    await runtimeService.restart();

    const wait = runtimeService.getDecisionService()!.handleWait(permissionBody());
    const request = transport.sentMessages.find((message) => message.type === 'request');

    await runtimeService.stop();

    const result = await Promise.race([
      wait,
      Promise.resolve({ requestId: 'pending', hookStdout: 'pending' }),
    ]);
    expect(result).toMatchObject({
      requestId: request?.type === 'request' ? request.decisionId : '',
      hookStdout: null,
    });
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      decisionId: request?.type === 'request' ? request.decisionId : '',
      result: 'handled_elsewhere',
      message: 'Runtime stopped',
    });
  });

  it('cancels pending hardware-only wait when restarted and creates a fresh service', async () => {
    vi.useFakeTimers();
    const cfg = config();
    const transport = new MockHardwareTransport();
    const hardware = new HardwareRuntime(transport);
    await hardware.start();
    const runtimeService = new SlackRuntime(
      () => cfg,
      () => getSlackCardLabels('en'),
      () => hardware,
    );
    await runtimeService.restart();
    const oldService = runtimeService.getDecisionService();

    const wait = oldService!.handleWait(permissionBody({ sessionId: 'sess-restart' }));
    const request = transport.sentMessages.find((message) => message.type === 'request');

    await runtimeService.restart();

    const result = await Promise.race([
      wait,
      Promise.resolve({ requestId: 'pending', hookStdout: 'pending' }),
    ]);
    expect(result.hookStdout).toBeNull();
    expect(result.requestId).toBe(request?.type === 'request' ? request.decisionId : '');
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      decisionId: request?.type === 'request' ? request.decisionId : '',
      result: 'handled_elsewhere',
      message: 'Runtime stopped',
    });
    expect(runtimeService.getDecisionService()).not.toBe(oldService);
    expect(runtimeService.getDecisionService()).not.toBeNull();
  });
});
