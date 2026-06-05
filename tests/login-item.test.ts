import { describe, it, expect } from 'vitest';
import {
  LOGIN_LAUNCH_ARG,
  WINDOWS_LOGIN_ITEM_NAME,
  buildLoginItemSettings,
  getLoginItemQueryOptions,
} from '../src/main/login-item-settings';

describe('buildLoginItemSettings', () => {
  it('windows packaged uses launch arg and registry name', () => {
    expect(
      buildLoginItemSettings(
        {
          openAtLogin: true,
          isPackaged: true,
          execPath: 'C:\\Program Files\\ComBrief\\ComBrief.exe',
          appPath: '/unused',
        },
        'win32',
      ),
    ).toEqual({
      openAtLogin: true,
      path: 'C:\\Program Files\\ComBrief\\ComBrief.exe',
      args: [LOGIN_LAUNCH_ARG],
      enabled: true,
      name: WINDOWS_LOGIN_ITEM_NAME,
    });
  });

  it('windows dev uses electron with project cwd arg', () => {
    expect(
      buildLoginItemSettings(
        {
          openAtLogin: true,
          isPackaged: false,
          execPath: 'C:\\electron\\electron.exe',
          appPath: 'C:\\proj',
        },
        'win32',
      ),
    ).toEqual({
      openAtLogin: true,
      path: 'C:\\electron\\electron.exe',
      args: ['.', LOGIN_LAUNCH_ARG],
      enabled: true,
      name: WINDOWS_LOGIN_ITEM_NAME,
    });
  });

  it('macOS uses mainAppService without custom path', () => {
    expect(
      buildLoginItemSettings(
        {
          openAtLogin: true,
          isPackaged: true,
          execPath: '/Applications/ComBrief.app/Contents/MacOS/ComBrief',
          appPath: '/unused',
        },
        'darwin',
      ),
    ).toEqual({
      openAtLogin: true,
      openAsHidden: true,
      type: 'mainAppService',
    });
  });

  it('getLoginItemQueryOptions matches windows path and args', () => {
    const input = {
      openAtLogin: true,
      isPackaged: false,
      execPath: '/electron',
      appPath: '/proj',
    };
    expect(getLoginItemQueryOptions(input, 'win32')).toEqual({
      path: '/electron',
      args: ['.', LOGIN_LAUNCH_ARG],
    });
  });
});
