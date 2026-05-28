import { app } from 'electron';
import { buildLoginItemSettings } from './login-item-settings';

export { buildLoginItemSettings } from './login-item-settings';
export type { LoginItemSettingsInput } from './login-item-settings';

export function applyLaunchAtLogin(openAtLogin: boolean): void {
  app.setLoginItemSettings(
    buildLoginItemSettings({
      openAtLogin,
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      appPath: app.getAppPath(),
    }),
  );
}

export function readLaunchAtLoginEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}
