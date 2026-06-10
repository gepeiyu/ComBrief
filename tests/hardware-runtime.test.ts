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
      deviceName: 'ComBrief-Remote',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    expect(runtime.getStatus()).toMatchObject({
      started: true,
      connected: true,
      lastError: null,
      deviceName: 'ComBrief-Remote',
      platform: 'haas-edu-k1',
      fwVersion: '0.1.0',
      battery: 80,
    });

    transport.emitDeviceMessage({ protocol: 1, type: 'battery', battery: 72, ts: 2 });

    expect(runtime.getStatus()).toMatchObject({ battery: 72 });
  });

  it('sends state, request, and resolved messages through transport while started', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.start();
    await runtime.sendState(stateMessage());
    await runtime.sendRequest(requestMessage());
    await runtime.sendResolved(resolvedMessage());

    expect(transport.sentMessages.map((message) => message.type)).toEqual([
      'state',
      'request',
      'resolved',
    ]);
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

  it('silently skips sending before start', async () => {
    const transport = new MockHardwareTransport();
    const runtime = new HardwareRuntime(transport);

    await runtime.sendState(stateMessage());

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
