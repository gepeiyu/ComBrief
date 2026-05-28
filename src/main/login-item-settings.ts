export interface LoginItemSettingsInput {
  openAtLogin: boolean;
  isPackaged: boolean;
  execPath: string;
  appPath: string;
}

export interface BuiltLoginItemSettings {
  openAtLogin: boolean;
  openAsHidden: boolean;
  path: string;
  args: string[];
}

export function buildLoginItemSettings(
  input: LoginItemSettingsInput,
): BuiltLoginItemSettings {
  return {
    openAtLogin: input.openAtLogin,
    openAsHidden: true,
    path: input.execPath,
    args: input.isPackaged ? [] : [input.appPath],
  };
}
