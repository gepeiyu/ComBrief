import { describe, it, expect } from 'vitest';
import { buildLoginItemSettings } from '../src/main/login-item-settings';

describe('buildLoginItemSettings', () => {
  it('uses app path arg in development', () => {
    expect(
      buildLoginItemSettings({
        openAtLogin: true,
        isPackaged: false,
        execPath: '/usr/bin/electron',
        appPath: '/proj',
      }),
    ).toEqual({
      openAtLogin: true,
      openAsHidden: true,
      path: '/usr/bin/electron',
      args: ['/proj'],
    });
  });

  it('uses no args when packaged', () => {
    expect(
      buildLoginItemSettings({
        openAtLogin: false,
        isPackaged: true,
        execPath: '/Applications/ComBrief.app/Contents/MacOS/ComBrief',
        appPath: '/unused',
      }).args,
    ).toEqual([]);
  });
});
