import { describe, it, expect } from 'vitest';
import {
  injectCursorBridge,
  removeCursorBridge,
  collectChainCommands,
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
});
