import { describe, it, expect } from 'vitest';
import {
  getMessages,
  getRendererMessages,
  resolveLocale,
} from '../src/main/i18n';

describe('i18n', () => {
  it('defaults invalid locale to en', () => {
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
  });

  it('accepts en zh ja', () => {
    expect(resolveLocale('zh')).toBe('zh');
    expect(resolveLocale('ja')).toBe('ja');
  });

  it('provides strings for each locale', () => {
    expect(getMessages('en').settings.add).toBe('Add');
    expect(getMessages('zh').settings.add).toBe('添加');
    expect(getMessages('ja').settings.add).toBe('追加');
  });

  it('renderer messages are IPC-cloneable (no functions)', () => {
    const m = getRendererMessages('en');
    expect(() => structuredClone(m)).not.toThrow();
    expect(m.settings.windowTitle).toBe('ComBrief Settings');
  });
});
