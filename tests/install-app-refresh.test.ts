import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHome = process.env.HOME;
let tempHome: string | null = null;

async function loadInstallerForHome(home: string) {
  vi.resetModules();
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os');
    return {
      ...actual,
      homedir: () => home,
    };
  });
  process.env.HOME = home;
  return import('../src/main/installer/install-app');
}

describe('install app refresh', () => {
  afterEach(() => {
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('repairs Claude PermissionRequest gate when refreshing registered app scripts', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'combrief-install-refresh-'));
    const claudeDir = join(tempHome, '.claude');
    const combriefDir = join(tempHome, '.combrief');
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(combriefDir, { recursive: true });

    writeFileSync(
      join(combriefDir, 'config.json'),
      JSON.stringify({ apps: ['claude-code'] }),
    );
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          PermissionRequest: [
            {
              hooks: [
                {
                  type: 'command',
                  command: join(tempHome, '.combrief', 'apps', 'claude-code', 'bridge.mjs'),
                },
              ],
            },
          ],
        },
      }),
    );

    const { refreshRegisteredAppScripts } = await loadInstallerForHome(tempHome);
    refreshRegisteredAppScripts(['claude-code']);

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf8'));
    const commands = settings.hooks.PermissionRequest.flatMap((group: { hooks: Array<{ command: string }> }) =>
      group.hooks.map((hook) => hook.command),
    );

    expect(commands).toContain(
      `${join(tempHome, '.combrief', 'apps', 'claude-code', 'remote-gate.mjs')} PermissionRequest`,
    );
    expect(commands).not.toContain(join(tempHome, '.combrief', 'apps', 'claude-code', 'bridge.mjs'));
  });

  it('removes Cursor remote gate when refreshing registered app scripts', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'combrief-install-refresh-'));
    const cursorDir = join(tempHome, '.cursor');
    const combriefDir = join(tempHome, '.combrief');
    mkdirSync(cursorDir, { recursive: true });
    mkdirSync(combriefDir, { recursive: true });

    writeFileSync(
      join(combriefDir, 'config.json'),
      JSON.stringify({ apps: ['cursor'] }),
    );
    writeFileSync(
      join(cursorDir, 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          preToolUse: [
            {
              command: `${join(tempHome, '.combrief', 'apps', 'cursor', 'remote-gate.mjs')} preToolUse`,
              timeout: 630000,
            },
          ],
        },
      }),
    );

    const { refreshRegisteredAppScripts } = await loadInstallerForHome(tempHome);
    refreshRegisteredAppScripts(['cursor']);

    const hooksJson = JSON.parse(readFileSync(join(cursorDir, 'hooks.json'), 'utf8'));
    expect(hooksJson.hooks.preToolUse).toContainEqual({
      command: `${join(tempHome, '.combrief', 'apps', 'cursor', 'bridge.mjs')} preToolUse`,
    });
    expect(JSON.stringify(hooksJson)).not.toContain('remote-gate');
  });
});
