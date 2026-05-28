import { describe, it, expect } from 'vitest';
import {
  injectClaudeBridge,
  removeClaudeBridge,
  collectClaudeChainCommands,
} from '../src/main/installer/settings-json';

const SAMPLE = {
  hooks: {
    Stop: [{ hooks: [{ type: 'command' as const, command: 'echo hi' }] }],
  },
};

describe('settings-json', () => {
  it('appends combrief hook groups', () => {
    const result = injectClaudeBridge(SAMPLE, '/tmp/bridge.cmd', 'claude-code');
    expect(result.hooks?.SessionStart).toBeDefined();
    const stopGroups = result.hooks?.Stop ?? [];
    const commands = stopGroups.flatMap((g) => g.hooks.map((h) => h.command));
    expect(commands).toContain('echo hi');
    expect(commands).toContain('/tmp/bridge.cmd');
  });

  it('removes only combrief commands', () => {
    const injected = injectClaudeBridge(
      SAMPLE,
      '/tmp/bridge.cmd',
      'claude-code',
    );
    const restored = removeClaudeBridge(injected);
    expect(restored).toEqual(SAMPLE);
  });

  it('collects chain commands', () => {
    expect(collectClaudeChainCommands(SAMPLE)).toEqual(['echo hi']);
  });
});
