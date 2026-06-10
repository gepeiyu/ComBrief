import { describe, expect, it, vi, afterEach } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';
import { DecisionService } from '../src/main/decision-service';
import { defaultConfig, type CombriefConfig } from '../src/main/config';
import { getSlackCardLabels } from '../src/main/i18n/messages';
import { MockHardwareTransport } from '../src/main/hardware/mock-transport';
import { HardwareRuntime } from '../src/main/hardware/runtime';
import type { DecisionWaitBody } from '../src/main/decision/types';
import type { SlackAdapter } from '../src/main/slack/adapter';
import type { HardwareHostMessage } from '../src/main/hardware/protocol';

function hardwareConfig(overrides: Partial<CombriefConfig['hardware']> = {}) {
  const base = defaultConfig();
  return {
    ...base,
    hardware: {
      ...base.hardware,
      enabled: true,
      decisionPushEnabled: true,
      ...overrides,
    },
    slack: {
      ...base.slack,
      enabled: false,
      decisionTimeoutMs: 50_000,
    },
  };
}

function permissionBody(overrides: Partial<DecisionWaitBody> = {}): DecisionWaitBody {
  return {
    appId: 'claude-code',
    hookEvent: 'permissionRequest',
    sessionId: 'sess-remote',
    toolName: 'Bash',
    toolInput: { command: 'npm install' },
    ...overrides,
  };
}

async function setupHardwareService(cfg = hardwareConfig()) {
  const queue = new DecisionQueue();
  const transport = new MockHardwareTransport();
  let service!: DecisionService;
  const hardware = new HardwareRuntime(transport, {
    onDecision: (message) => service.resolveFromHardware(message),
  });
  await hardware.start();
  service = new DecisionService(
    () => cfg,
    null,
    queue,
    () => getSlackCardLabels('en'),
    hardware,
  );
  return { queue, transport, hardware, service };
}

function latestRequest(transport: MockHardwareTransport) {
  const request = transport.sentMessages.find((message) => message.type === 'request');
  expect(request?.type).toBe('request');
  return request?.type === 'request' ? request : null;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DecisionService hardware channel', () => {
  it('sends hardware request when Slack is disabled and expires without hanging', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(permissionBody());

    const request = latestRequest(transport);
    expect(request?.appVersion).toBe(process.env.npm_package_version ?? '0.0.0');
    vi.advanceTimersByTime(51_000);
    const result = await wait;

    expect(result.requestId).toBe(request?.decisionId);
    expect(result.hookStdout).toBeNull();
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      decisionId: request?.decisionId,
      result: 'expired',
    });
  });

  it('resolves wait when hardware selects allow and sends resolved', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(permissionBody());
    const request = latestRequest(transport);

    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: request?.decisionId ?? '',
      optionId: 'allow',
      ts: Date.now(),
    });

    const result = await wait;
    expect(result.hookStdout).toContain('PermissionRequest');
    expect(result.hookStdout).toContain('allow');
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      decisionId: request?.decisionId,
      result: 'approved',
      message: 'Approved by Remote',
    });
  });

  it('ignores stale hardware decisions after local resolution', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(permissionBody({ sessionId: 'sess-local' }));
    const request = latestRequest(transport);
    expect(
      service.resolveLocalTerminal({
        sessionId: 'sess-local',
        toolName: 'Bash',
        kind: 'allow',
      }),
    ).toBe(true);
    await wait;

    expect(
      service.resolveFromHardware({
        protocol: 1,
        type: 'decision',
        decisionId: request?.decisionId ?? '',
        optionId: 'deny',
        ts: Date.now(),
      }),
    ).toBe(false);
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      result: 'handled_elsewhere',
    });
  });

  it('resolves AskUserQuestion option with the full option label', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(
      permissionBody({
        toolName: 'AskUserQuestion',
        toolInput: {
          questions: [
            {
              question: 'First version support?',
              options: [
                { label: 'macOS + Windows' },
                { label: 'macOS only' },
              ],
            },
          ],
        },
      }),
    );
    const request = latestRequest(transport);

    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: request?.decisionId ?? '',
      optionId: 'option:0',
      ts: Date.now(),
    });

    const result = await wait;
    expect(result.hookStdout).toContain('PermissionRequest');
    expect(result.hookStdout).toContain('macOS + Windows');
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      result: 'selected',
      message: 'Selected by Remote',
    });
  });

  it('does not send request when hardware is disabled and preserves Slack disabled behavior', async () => {
    const cfg = hardwareConfig({ enabled: false });
    const { transport, service } = await setupHardwareService(cfg);

    const result = await service.handleWait(permissionBody());

    expect(result).toEqual({ requestId: '', hookStdout: null });
    expect(transport.sentMessages).toHaveLength(0);
  });

  it('does not wait when hardware is enabled but runtime is unavailable and Slack is disabled', async () => {
    const cfg = hardwareConfig({ enabled: true, decisionPushEnabled: true });
    const service = new DecisionService(
      () => cfg,
      null,
      new DecisionQueue(),
      () => getSlackCardLabels('en'),
      null,
    );

    const result = await service.handleWait(permissionBody());

    expect(result).toEqual({ requestId: '', hookStdout: null });
  });

  it('keeps bridge-local resolved status instead of replacing it with expired', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(permissionBody({ sessionId: 'sess-bridge' }));
    const request = latestRequest(transport);

    service.tryResolveFromLocal({
      appId: 'claude-code',
      event: 'postToolUse',
      sessionId: 'sess-bridge',
      meta: { toolName: 'Bash' },
    });
    await wait;
    vi.advanceTimersByTime(51_000);

    const resolvedMessages = transport.sentMessages.filter(
      (message) => message.type === 'resolved',
    );
    expect(resolvedMessages).toHaveLength(1);
    expect(resolvedMessages.at(-1)).toMatchObject({
      decisionId: request?.decisionId,
      result: 'handled_elsewhere',
    });
  });

  it('does not send conflicting hardware resolved after Slack handles the decision', async () => {
    vi.useFakeTimers();
    const cfg = hardwareConfig();
    cfg.slack = {
      ...cfg.slack,
      enabled: true,
      channelId: 'C123',
    };
    const queue = new DecisionQueue();
    const transport = new MockHardwareTransport();
    const hardware = new HardwareRuntime(transport);
    await hardware.start();
    const slack = {
      postDecisionMessage: vi.fn(async () => '1660000000.000001'),
      updateDecisionMessage: vi.fn(async () => undefined),
      postTestMessage: vi.fn(async () => undefined),
    } as unknown as SlackAdapter;
    const service = new DecisionService(
      () => cfg,
      slack,
      queue,
      () => getSlackCardLabels('en'),
      hardware,
    );

    const wait = service.handleWait(permissionBody());
    await Promise.resolve();
    const request = latestRequest(transport);

    await service.handleBlockAction({
      userId: 'U123',
      value: JSON.stringify({ requestId: request?.decisionId, action: 'allowOnce' }),
      channelId: 'C123',
      messageTs: '1660000000.000001',
    });
    const result = await wait;

    expect(result.hookStdout).toContain('allow');
    expect(
      service.resolveFromHardware({
        protocol: 1,
        type: 'decision',
        decisionId: request?.decisionId ?? '',
        optionId: 'deny',
        ts: Date.now(),
      }),
    ).toBe(false);
    vi.advanceTimersByTime(51_000);

    const resolvedMessages = transport.sentMessages.filter(
      (message) => message.type === 'resolved',
    );
    expect(resolvedMessages).toHaveLength(1);
    expect(resolvedMessages.at(-1)).toMatchObject({
      decisionId: request?.decisionId,
      result: 'approved',
      message: 'Approved by Remote',
    });
  });

  it('accepts a hardware decision synchronously returned during sendRequest', async () => {
    vi.useFakeTimers();
    const cfg = hardwareConfig();
    const sentMessages: HardwareHostMessage[] = [];
    let service!: DecisionService;
    const hardware = {
      async sendRequest(message: HardwareHostMessage) {
        sentMessages.push(message);
        if (message.type === 'request') {
          service.resolveFromHardware({
            protocol: 1,
            type: 'decision',
            decisionId: message.decisionId,
            optionId: 'allow',
            ts: Date.now(),
          });
        }
      },
      async sendResolved(message: HardwareHostMessage) {
        sentMessages.push(message);
      },
    } as HardwareRuntime;
    service = new DecisionService(
      () => cfg,
      null,
      new DecisionQueue(),
      () => getSlackCardLabels('en'),
      hardware,
    );

    const result = await service.handleWait(permissionBody());
    vi.advanceTimersByTime(51_000);

    expect(result.hookStdout).toContain('PermissionRequest');
    expect(result.hookStdout).toContain('allow');
    expect(sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      result: 'approved',
    });
  });

  it('does not replace a failed hardware-approved resolved send with expired', async () => {
    vi.useFakeTimers();
    const cfg = hardwareConfig();
    const attemptedResolved: HardwareHostMessage[] = [];
    let service!: DecisionService;
    const hardware = {
      async sendRequest(message: HardwareHostMessage) {
        if (message.type === 'request') {
          service.resolveFromHardware({
            protocol: 1,
            type: 'decision',
            decisionId: message.decisionId,
            optionId: 'allow',
            ts: Date.now(),
          });
        }
      },
      async sendResolved(message: HardwareHostMessage) {
        attemptedResolved.push(message);
        throw new Error('resolved send failed');
      },
    } as HardwareRuntime;
    service = new DecisionService(
      () => cfg,
      null,
      new DecisionQueue(),
      () => getSlackCardLabels('en'),
      hardware,
    );

    const result = await service.handleWait(permissionBody());
    await Promise.resolve();
    vi.advanceTimersByTime(51_000);
    await Promise.resolve();

    expect(result.hookStdout).toContain('allow');
    expect(attemptedResolved).toHaveLength(1);
    expect(attemptedResolved[0]).toMatchObject({
      type: 'resolved',
      result: 'approved',
    });
  });

  it('completes after local resolution even when hardware request send never settles', async () => {
    vi.useFakeTimers();
    const cfg = hardwareConfig();
    const hardware = {
      sendRequest() {
        return new Promise<void>(() => undefined);
      },
      async sendResolved() {
        return undefined;
      },
    } as HardwareRuntime;
    const service = new DecisionService(
      () => cfg,
      null,
      new DecisionQueue(),
      () => getSlackCardLabels('en'),
      hardware,
    );

    const wait = service.handleWait(permissionBody({ sessionId: 'sess-never-send' }));
    await Promise.resolve();
    expect(
      service.resolveLocalTerminal({
        sessionId: 'sess-never-send',
        toolName: 'Bash',
        kind: 'allow',
      }),
    ).toBe(true);

    const result = await wait;

    expect(result.hookStdout).toBeNull();
  });

  it('still sends expired resolved only for timeout results', async () => {
    vi.useFakeTimers();
    const { transport, service } = await setupHardwareService();

    const wait = service.handleWait(permissionBody());
    const request = latestRequest(transport);
    vi.advanceTimersByTime(51_000);
    const result = await wait;

    expect(result.hookStdout).toBeNull();
    expect(transport.sentMessages.at(-1)).toMatchObject({
      type: 'resolved',
      decisionId: request?.decisionId,
      result: 'expired',
    });
  });
});
