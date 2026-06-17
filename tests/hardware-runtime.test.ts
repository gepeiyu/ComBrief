import { describe, expect, it, vi } from 'vitest';
import { MockHardwareTransport } from '../src/main/hardware/mock-transport';
import { HardwareRuntime } from '../src/main/hardware/runtime';
import type {
  HardwareRequestMessage,
  HardwareResolvedMessage,
  HardwareStateMessage,
} from '../src/main/hardware/protocol';

class FailingStartTransport extends MockHardwareTransport {
  async start(): Promise<void> {
    throw new Error('start failed');
  }
}

class SlowFastStateTransport extends MockHardwareTransport {
  fastStateStarted = false;
  fastStateResolved = false;
  private releaseFastState: (() => void) | null = null;

  async sendFastState(signal: Parameters<MockHardwareTransport['sendFastState']>[0]): Promise<void> {
    this.fastStateStarted = true;
    await new Promise<void>((resolve) => {
      this.releaseFastState = resolve;
    });
    await super.sendFastState(signal);
    this.fastStateResolved = true;
  }

  release(): void {
    this.releaseFastState?.();
  }
}

function stateMessage(): HardwareStateMessage {
  return {
    protocol: 1,
    type: 'state',
    appName: 'ComBrief',
    appVersion: '0.1.2',
    apps: [{ id: 'claude-code', label: 'CC', status: 'idle' }],
    primary: 'claude-code',
    ts: 1_710_000_000_000,
  };
}

function requestMessage(): HardwareRequestMessage {
  return {
    protocol: 1,
    type: 'request',
    appName: 'ComBrief',
    appVersion: '0.1.2',
    decisionId: 'request-1',
    source: 'claude-code',
    sourceLabel: 'CC',
    kind: 'SHELL',
    brief: 'npm test',
    content: 'npm test',
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
    defaultFocus: 'allow',
  };
}

function resolvedMessage(): HardwareResolvedMessage {
  return {
    protocol: 1,
    type: 'resolved',
    decisionId: 'request-1',
    result: 'approved',
    message: 'Approved by Remote',
  };
}

describe('HardwareRuntime', () => {
  it('updates status from hello and battery messages', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'hello',
      deviceName: 'ComBrief',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    expect(runtime.getStatus()).toMatchObject({
      started: true,
      connected: true,
      lastError: null,
      deviceName: 'ComBrief',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    transport.emitDeviceMessage({ protocol: 1, type: 'battery', battery: 72, ts: 2 });

    expect(runtime.getStatus()).toMatchObject({ battery: 72 });
  });

  it('calls onHello after a valid hello while preserving status update', async () => {
    const transport = new MockHardwareTransport();
    const onHello = vi.fn();
    const runtime = new HardwareRuntime(transport, { onHello });

    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'hello',
      deviceName: 'ComBrief',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    expect(onHello).toHaveBeenCalledOnce();
    expect(runtime.getStatus()).toMatchObject({
      connected: true,
      deviceName: 'ComBrief',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });
  });

  it('does not call onHello for invalid hello messages', async () => {
    const transport = new MockHardwareTransport();
    const onHello = vi.fn();
    const runtime = new HardwareRuntime(transport, { onHello });

    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 2,
      type: 'hello',
      deviceName: 'ComBrief',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    } as never);

    expect(onHello).not.toHaveBeenCalled();
    expect(runtime.getStatus()).toMatchObject({
      deviceName: null,
      platform: null,
      fwVersion: null,
      battery: null,
    });
  });

  it('sends state, request, and resolved messages through transport while started', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    await runtime.sendState(stateMessage());
    await runtime.sendRequest(requestMessage());
    await runtime.sendResolved(resolvedMessage());

    expect(transport.sentFastStates.map((signal) => signal.status)).toEqual([
      'idle',
      'waiting_user',
    ]);
    expect(transport.sentFastStates[0]).toMatchObject({ label: 'CC', status: 'idle' });
    expect(transport.sentFastStates[1]).toMatchObject({ label: 'CC', status: 'waiting_user' });
    expect(transport.sentMessages.map((message) => message.type)).toEqual([
      'state',
      'request',
      'resolved',
    ]);
  });

  it('uses the primary app label for fast state when compact summary has another app first', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    await runtime.sendState({
      protocol: 1,
      type: 'state',
      appSummary: 'CC [OK]\nC [WORK]',
      primary: 'cursor',
      primaryStatus: 'working',
      primaryLabel: 'C',
    });

    expect(transport.sentFastStates[0]).toMatchObject({
      label: 'C',
      status: 'working',
    });
  });

  it('sends fast state before the reliable state message to avoid stale WORK overwrites', async () => {
    const transport = new SlowFastStateTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    const send = runtime.sendState({
      protocol: 1,
      type: 'state',
      appSummary: 'CC [OK]\nC [OK]',
      primary: 'claude-code',
      primaryStatus: 'idle',
    });

    await Promise.resolve();
    expect(transport.fastStateStarted).toBe(true);
    expect(transport.sentMessages).toEqual([]);

    transport.release();
    await send;

    expect(transport.fastStateResolved).toBe(true);
    expect(transport.sentFastStates[0]).toMatchObject({ label: 'CC', status: 'idle' });
    expect(transport.sentMessages[0]).toMatchObject({ type: 'state', primaryStatus: 'idle' });
  });

  it('does not send ASK fast state for non-request Cursor waiting state', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    await runtime.sendState({
      protocol: 1,
      type: 'state',
      appSummary: 'CC [OK]\nC [ASK]',
      primary: 'cursor',
      primaryLabel: 'C',
      primaryStatus: 'waiting_user',
      skipFastWaitingUser: true,
    });

    expect(transport.sentFastStates).toEqual([]);
    expect(transport.sentMessages).toHaveLength(1);
    expect(transport.sentMessages[0]).toMatchObject({
      type: 'state',
      primary: 'cursor',
      primaryStatus: 'waiting_user',
    });
  });

  it('forwards valid decision messages to callback', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });
  });

  it('rejects host messages before start', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await expect(runtime.sendState(stateMessage())).rejects.toThrow(
      'ComBrief Remote bridge is not started',
    );
    expect(transport.sentMessages).toEqual([]);
  });

  it('stops receiving messages after stop', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    await runtime.stop();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(runtime.getStatus()).toMatchObject({ started: false, connected: false });
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('unsubscribes message handler when transport start fails', async () => {
    const transport = new FailingStartTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await expect(runtime.start()).rejects.toThrow('start failed');
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(onDecision).not.toHaveBeenCalled();
  });

  it('does not duplicate decision handlers across repeated starts', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(onDecision).toHaveBeenCalledOnce();
  });

  it('allows repeated stops without receiving later messages', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    await runtime.stop();
    await runtime.stop();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });

    expect(onDecision).not.toHaveBeenCalled();
    expect(runtime.getStatus()).toMatchObject({ started: false, connected: false });
  });

  it('rejects host messages when bridge is started but not connected', async () => {
    const transport = new MockHardwareTransport();
    await transport.start();
    transport.setConnected(false);
    const runtime = new HardwareRuntime(transport);

    await expect(runtime.sendRequest(requestMessage())).rejects.toThrow(
      'ComBrief Remote is not connected',
    );
    expect(transport.sentMessages).toHaveLength(0);
  });

  it('does not duplicate decision handlers after restart', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    await runtime.restart();
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    });
    await runtime.sendState(stateMessage());

    expect(onDecision).toHaveBeenCalledOnce();
    expect(transport.sentMessages).toHaveLength(1);
    expect(runtime.getStatus()).toMatchObject({ started: true, connected: true });
  });

  it('does not forward invalid decision messages', async () => {
    const transport = new MockHardwareTransport();
    const onDecision = vi.fn();
    const runtime = new HardwareRuntime(transport, { onDecision });

    await runtime.start();
    transport.emitDeviceMessage({
      protocol: 2,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
      ts: 1_710_000_000_001,
    } as never);
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'decision',
      decisionId: 'request-1',
      optionId: 'allow',
    } as never);

    expect(onDecision).not.toHaveBeenCalled();
  });

  it('ignores malformed battery messages', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    transport.emitDeviceMessage({ protocol: 1, type: 'battery', battery: 72, ts: 2 });
    transport.emitDeviceMessage({
      protocol: 1,
      type: 'battery',
      battery: 'low',
      ts: 3,
    } as never);

    expect(runtime.getStatus()).toMatchObject({ battery: 72 });
  });
});
