import { describe, it, expect } from 'vitest';
import {
  injectRemoteGate,
  removeRemoteGate,
  REMOTE_GATE_HOOKS,
} from '../src/main/installer/remote-gate-json';
import { formatClaudeHookCommand } from '../src/main/installer/settings-json';

describe('remote-gate-json', () => {
  it('injects PermissionRequest only (dual-channel, no PreToolUse gate)', () => {
    const gate = '/tmp/remote-gate.mjs';
    const result = injectRemoteGate({}, gate);
    expect(result.hooks?.PermissionRequest).toBeDefined();
    expect(result.hooks?.PreToolUse).toBeUndefined();
    expect(REMOTE_GATE_HOOKS).toEqual([{ event: 'PermissionRequest' }]);
  });

  it('removes only remote-gate commands', () => {
    const gate = '/tmp/remote-gate.mjs';
    const injected = injectRemoteGate(
      {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
        },
      },
      gate,
    );
    const restored = removeRemoteGate(injected, gate);
    expect(restored.hooks?.Stop?.[0]?.hooks[0]?.command).toBe('echo hi');
    expect(restored.hooks?.PermissionRequest).toBeUndefined();
  });

  it('formats gate command with event arg', () => {
    expect(formatClaudeHookCommand('/tmp/gate.mjs', 'PermissionRequest')).toBe(
      '/tmp/gate.mjs PermissionRequest',
    );
  });
});
