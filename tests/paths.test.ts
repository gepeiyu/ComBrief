import { describe, it, expect, vi } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

vi.mock('../src/main/config', () => ({
  combriefHome: () => join(homedir(), '.combrief'),
}));

import { getAppDefinition } from '../src/main/apps/registry';
import { bridgeScriptPath, expandHomePath } from '../src/main/installer/paths';

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

describe('expandHomePath', () => {
  it('expands ~/ prefix', () => {
    expect(expandHomePath('~/.cursor/hooks.json')).toBe(
      join(homedir(), '.cursor/hooks.json'),
    );
  });

  it('expands dot-relative paths from home', () => {
    expect(expandHomePath('.cursor/hooks.json')).toBe(
      join(homedir(), '.cursor/hooks.json'),
    );
  });

  it('keeps absolute paths', () => {
    expect(expandHomePath('/etc/hosts')).toBe('/etc/hosts');
  });
});

describe('app registry', () => {
  it('installs Claude hooks into user settings', () => {
    expect(getAppDefinition('claude-code').hooksConfigRelPath).toBe(
      '.claude/settings.json',
    );
  });
});

describe('bridgeScriptPath', () => {
  it('uses bridge.cmd on Windows', () => {
    withPlatform('win32', () => {
      expect(bridgeScriptPath('cursor')).toBe(
        join(homedir(), '.combrief', 'apps', 'cursor', 'bridge.cmd'),
      );
    });
  });

  it('uses bridge.mjs off Windows', () => {
    withPlatform('darwin', () => {
      expect(bridgeScriptPath('cursor')).toBe(
        join(homedir(), '.combrief', 'apps', 'cursor', 'bridge.mjs'),
      );
    });
  });
});
