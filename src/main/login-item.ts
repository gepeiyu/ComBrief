import { app } from 'electron';
import type { LoginItemSettings } from 'electron';
import {
  buildLoginItemSettings,
  getLoginItemQueryOptions,
  LOGIN_LAUNCH_ARG,
  type LoginItemSettingsInput,
} from './login-item-settings';

export {
  buildLoginItemSettings,
  getLoginItemQueryOptions,
  LOGIN_LAUNCH_ARG,
  WINDOWS_LOGIN_ITEM_NAME,
} from './login-item-settings';
export type { LoginItemSettingsInput } from './login-item-settings';

export type LaunchAtLoginIssue =
  | 'not-registered'
  | 'requires-approval'
  | 'disabled'
  | null;

export interface LaunchAtLoginState {
  effective: boolean;
  issue: LaunchAtLoginIssue;
}

function loginItemInput(openAtLogin: boolean): LoginItemSettingsInput {
  return {
    openAtLogin,
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    appPath: app.getAppPath(),
  };
}

function supportsLoginItems(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function evaluateLoginItem(
  requested: boolean,
  current: LoginItemSettings,
): LaunchAtLoginState {
  if (!requested) {
    return { effective: false, issue: null };
  }

  if (process.platform === 'win32') {
    const willLaunch =
      current.executableWillLaunchAtLogin === true ||
      current.openAtLogin === true;
    if (!willLaunch) {
      return { effective: false, issue: 'not-registered' };
    }
    const items = current.launchItems ?? [];
    if (items.length > 0 && items.every((item) => item.enabled === false)) {
      return { effective: false, issue: 'disabled' };
    }
    return { effective: true, issue: null };
  }

  if (process.platform === 'darwin') {
    if (!current.openAtLogin) {
      return { effective: false, issue: 'not-registered' };
    }
    if (current.status === 'enabled') {
      return { effective: true, issue: null };
    }
    if (current.status === 'requires-approval') {
      return { effective: false, issue: 'requires-approval' };
    }
    return { effective: false, issue: 'not-registered' };
  }

  return { effective: requested, issue: null };
}

export function readLaunchAtLoginState(): LaunchAtLoginState {
  if (!supportsLoginItems()) {
    return { effective: false, issue: null };
  }
  const input = loginItemInput(true);
  const current = app.getLoginItemSettings(getLoginItemQueryOptions(input));
  const requested = current.openAtLogin === true;
  return evaluateLoginItem(requested, current);
}

export function applyLaunchAtLogin(requested: boolean): LaunchAtLoginState {
  if (!supportsLoginItems()) {
    return { effective: requested, issue: null };
  }
  const input = loginItemInput(requested);
  app.setLoginItemSettings(buildLoginItemSettings(input));
  const current = app.getLoginItemSettings(getLoginItemQueryOptions(input));
  return evaluateLoginItem(requested, current);
}

/** True when the app was started from the OS login-item / Run registry entry. */
export function wasOpenedAtLogin(): boolean {
  if (process.argv.includes(LOGIN_LAUNCH_ARG)) return true;
  if (!supportsLoginItems()) return false;
  const input = loginItemInput(true);
  return app.getLoginItemSettings(getLoginItemQueryOptions(input)).wasOpenedAtLogin;
}
