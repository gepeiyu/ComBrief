import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('includes raw hook input in decision wait body', () => {
    const gateSource = readFileSync(
      join(process.cwd(), 'extensions', 'claude-code', 'remote-gate.mjs'),
      'utf8',
    );

    expect(gateSource).toContain('raw: input');
  });

  it('keeps remote gate active when Slack is off but hardware decisions are on', () => {
    const gateSource = readFileSync(
      join(process.cwd(), 'extensions', 'claude-code', 'remote-gate.mjs'),
      'utf8',
    );

    expect(gateSource).toContain('function decisionChannelEnabled(config)');
    expect(gateSource).toContain('config.hardware?.enabled');
    expect(gateSource).toContain('config.hardware?.decisionPushEnabled');
    expect(gateSource).not.toContain('if (!config.slack?.enabled) {');
  });

  it('extends AskUserQuestion wait timeout so hardware can answer after the normal decision timeout', () => {
    const gateSource = readFileSync(
      join(process.cwd(), 'extensions', 'claude-code', 'remote-gate.mjs'),
      'utf8',
    );

    expect(gateSource).toContain('ASK_USER_QUESTION_DECISION_TIMEOUT_MS');
    expect(gateSource).toContain("toolName === 'AskUserQuestion'");
    expect(gateSource).toContain('Math.max(baseDecisionTimeoutMs, ASK_USER_QUESTION_DECISION_TIMEOUT_MS)');
    expect(gateSource).toContain('const timeoutMs = decisionTimeoutMs + 30_000');
  });
});
