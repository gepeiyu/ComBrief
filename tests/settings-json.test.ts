import { describe, it, expect } from 'vitest';
import {
  injectClaudeBridge,
  removeClaudeBridge,
  collectClaudeChainCommands,
  formatClaudeHookCommand,
} from '../src/main/installer/settings-json';

const SAMPLE = {
  hooks: {
    Stop: [{ hooks: [{ type: 'command' as const, command: 'echo hi' }] }],
  },
};

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

describe('settings-json', () => {
  it('appends schema-compatible combrief hook groups', () => {
    const result = injectClaudeBridge(SAMPLE, '/tmp/bridge.cmd', 'claude-code');
    expect(result.hooks?.SessionStart).toBeDefined();
    const stopGroups = result.hooks?.Stop ?? [];
    const commands = stopGroups.flatMap((g) => g.hooks.map((h) => h.command));
    expect(commands).toContain('echo hi');
    expect(commands).toContain(formatClaudeHookCommand('/tmp/bridge.cmd', 'Stop'));
    expect(stopGroups.at(-1)?.hooks[0]).toEqual({
      type: 'command',
      command: formatClaudeHookCommand('/tmp/bridge.cmd', 'Stop'),
    });
  });

  it('removes only combrief commands', () => {
    const injected = injectClaudeBridge(
      SAMPLE,
      '/tmp/bridge.cmd',
      'claude-code',
    );
    const restored = removeClaudeBridge(injected, '/tmp/bridge.cmd');
    expect(restored).toEqual(SAMPLE);
  });

  it('collects chain commands', () => {
    expect(collectClaudeChainCommands(SAMPLE, '/tmp/bridge.cmd')).toEqual(['echo hi']);
  });

  it('excludes combrief remote-gate from chain', () => {
    const withGate = {
      hooks: {
        PermissionRequest: [
          {
            hooks: [
              { type: 'command' as const, command: 'echo hi' },
              {
                type: 'command' as const,
                command: formatClaudeHookCommand('/tmp/remote-gate.mjs', 'PermissionRequest'),
              },
            ],
          },
        ],
      },
    };
    expect(
      collectClaudeChainCommands(
        withGate,
        '/tmp/bridge.cmd',
        '/tmp/remote-gate.mjs',
      ),
    ).toEqual(['echo hi']);
  });

  it('quotes Windows hook commands for bash', () => {
    withPlatform('win32', () => {
      expect(
        formatClaudeHookCommand(
          'C:\\Users\\gepei\\.combrief\\apps\\claude-code\\bridge.cmd',
          'Stop',
        ),
      ).toBe('"C:/Users/gepei/.combrief/apps/claude-code/bridge.cmd" Stop');
    });
  });
});
