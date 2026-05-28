import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expandHomePath } from '../src/main/installer/paths';

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
