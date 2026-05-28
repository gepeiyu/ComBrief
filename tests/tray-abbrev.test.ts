import { describe, it, expect } from 'vitest';
import { normalizeTrayAbbrev } from '../src/main/tray-icons';

describe('normalizeTrayAbbrev', () => {
  it('allows up to 2 latin letters', () => {
    expect(normalizeTrayAbbrev('cu')).toBe('CU');
    expect(normalizeTrayAbbrev('abcd')).toBe('AB');
  });

  it('allows one han character', () => {
    expect(normalizeTrayAbbrev('光标')).toBe('光');
    expect(normalizeTrayAbbrev('C光')).toBe('光');
  });

  it('returns empty for whitespace', () => {
    expect(normalizeTrayAbbrev('   ')).toBe('');
  });
});
