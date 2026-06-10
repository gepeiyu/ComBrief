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

  it('provides hardware settings strings for each locale', () => {
    const keys = [
      'hardwareSection',
      'hardwareEnabled',
      'hardwareTestDisplay',
      'hardwareStatusConnected',
      'hardwareStatusDisconnected',
    ] as const;

    for (const locale of ['en', 'zh', 'ja'] as const) {
      const settings = getMessages(locale).settings;
      for (const key of keys) {
        expect(settings[key]).toEqual(expect.any(String));
        expect(settings[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('renderer messages are IPC-cloneable (no functions)', () => {
    const m = getRendererMessages('en');
    expect(() => structuredClone(m)).not.toThrow();
    expect(m.settings.windowTitle).toBe('ComBrief Settings');
  });
});
