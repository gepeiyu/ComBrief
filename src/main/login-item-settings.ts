/** Passed on the command line when Windows starts ComBrief at logon. */
export const LOGIN_LAUNCH_ARG = '--opened-at-login';

/** Registry Run value name (Windows). Must stay stable across versions. */
export const WINDOWS_LOGIN_ITEM_NAME = 'ComBrief';

export interface LoginItemSettingsInput {
  openAtLogin: boolean;
  isPackaged: boolean;
  execPath: string;
  appPath: string;
}

export interface LoginItemSettingsPayload {
  openAtLogin: boolean;
  openAsHidden?: boolean;
  path?: string;
  args?: string[];
  enabled?: boolean;
  name?: string;
  type?: 'mainAppService';
}

export function buildLoginItemSettings(
  input: LoginItemSettingsInput,
  platform: NodeJS.Platform = process.platform,
): LoginItemSettingsPayload {
  if (platform === 'win32') {
    const args = input.isPackaged
      ? [LOGIN_LAUNCH_ARG]
      : ['.', LOGIN_LAUNCH_ARG];
    return {
      openAtLogin: input.openAtLogin,
      path: input.execPath,
      args,
      enabled: true,
      name: WINDOWS_LOGIN_ITEM_NAME,
    };
  }

  if (platform === 'darwin') {
    return {
      openAtLogin: input.openAtLogin,
      openAsHidden: true,
      type: 'mainAppService',
    };
  }

  return { openAtLogin: input.openAtLogin };
}

export function getLoginItemQueryOptions(
  input: LoginItemSettingsInput,
  platform: NodeJS.Platform = process.platform,
): { path?: string; args?: string[]; type?: string } {
  if (platform === 'win32') {
    const built = buildLoginItemSettings(input, platform);
    return { path: built.path, args: built.args };
  }
  if (platform === 'darwin') {
    return { type: 'mainAppService' };
  }
  return {};
}
