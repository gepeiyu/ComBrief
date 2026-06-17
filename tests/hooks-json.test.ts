import { describe, it, expect } from 'vitest';
import {
  injectCursorBridge,
  removeCursorBridge,
  collectChainCommands,
  injectCursorRemoteGate,
  removeCursorRemoteGate,
} from '../src/main/installer/hooks-json';

const SAMPLE = {
  version: 1,
  hooks: { stop: [{ command: 'echo hi' }] },
};

describe('hooks-json', () => {
  it('appends schema-compatible combrief hook per tracked event', () => {
    const result = injectCursorBridge(SAMPLE, '/tmp/bridge.sh', 'cursor');
    expect(result.hooks.sessionStart).toBeDefined();
    expect(result.hooks.stop?.length).toBe(2);
    expect(result.hooks.stop?.at(-1)).toEqual({
      command: '/tmp/bridge.sh stop',
    });
  });

  it('removes only combrief entries', () => {
    const injected = injectCursorBridge(SAMPLE, '/tmp/bridge.sh', 'cursor');
    const restored = removeCursorBridge(injected, '/tmp/bridge.sh');
    expect(restored).toEqual(SAMPLE);
  });

  it('collects chain commands', () => {
    expect(collectChainCommands(SAMPLE, '/tmp/bridge.sh')).toEqual(['echo hi']);
  });

  it('injects Cursor remote gate for decision-capable events with longer timeout', () => {
    const result = injectCursorRemoteGate(SAMPLE, '/tmp/remote-gate.mjs');
    expect(result.hooks.preToolUse?.at(-1)).toEqual({
      command: '/tmp/remote-gate.mjs preToolUse',
      timeout: 630000,
    });
    expect(result.hooks.beforeShellExecution?.at(-1)).toEqual({
      command: '/tmp/remote-gate.mjs beforeShellExecution',
      timeout: 630000,
    });
    expect(result.hooks.stop).toEqual(SAMPLE.hooks.stop);
  });

  it('does not collect existing Cursor remote gate as a chain command', () => {
    const current = injectCursorRemoteGate(SAMPLE, '/tmp/remote-gate.mjs');
    expect(collectChainCommands(current, '/tmp/bridge.sh', '/tmp/remote-gate.mjs')).toEqual([
      'echo hi',
    ]);
  });

  it('removes Cursor remote gate entries', () => {
    const current = injectCursorRemoteGate(SAMPLE, '/tmp/remote-gate.mjs');
    expect(removeCursorRemoteGate(current, '/tmp/remote-gate.mjs')).toEqual(SAMPLE);
  });
});
