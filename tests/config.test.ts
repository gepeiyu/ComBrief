import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConfig,
  saveConfig,
  defaultConfig,
  resolveTrayAbbrev,
  resolveEventLoggingEnabled,
} from '../src/main/config';

describe('config', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'combrief-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns defaults when missing', () => {
    const cfg = loadConfig(dir);
    expect(cfg.port).toBe(3847);
    expect(cfg.heartbeatTimeoutMs).toBe(45_000);
    expect(cfg.apps).toEqual([]);
    expect(cfg.locale).toBe('en');
  });

  it('round-trips save', () => {
    const cfg = { ...defaultConfig(), apps: ['cursor'] };
    saveConfig(dir, cfg);
    expect(loadConfig(dir).apps).toEqual(['cursor']);
  });

  it('defaults event logging off', () => {
    const cfg = defaultConfig();
    expect(cfg.eventLoggingEnabled).toBe(false);
    expect(resolveEventLoggingEnabled(cfg)).toBe(false);
    expect(resolveEventLoggingEnabled({ ...cfg, eventLoggingEnabled: true })).toBe(
      true,
    );
  });

  it('defaultConfig includes disabled slack', () => {
    expect(defaultConfig().slack).toEqual({
      enabled: false,
      botToken: '',
      appToken: '',
      channelId: '',
      decisionTimeoutMs: 600_000,
      failClosed: false,
      allowedUserIds: [],
    });
  });

  it('resolves tray abbrev from config override', () => {
    const cfg = {
      ...defaultConfig(),
      showTrayAbbrev: true,
      trayAbbrevs: { cursor: 'CR' },
    };
    expect(resolveTrayAbbrev('cursor', cfg)).toBe('CR');
    expect(resolveTrayAbbrev('cursor', { ...cfg, trayAbbrevs: { cursor: '光标' } })).toBe(
      '光',
    );
    expect(resolveTrayAbbrev('cursor', { ...cfg, showTrayAbbrev: false })).toBe(
      '',
    );
  });
});
