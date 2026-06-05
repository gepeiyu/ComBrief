import { homedir } from 'node:os';
import { join } from 'node:path';
import { combriefHome } from '../config';

export function expandHomePath(relPath: string): string {
  if (relPath.startsWith('~/')) {
    return join(homedir(), relPath.slice(2));
  }
  if (relPath.startsWith('/')) {
    return relPath;
  }
  // `.cursor/hooks.json` 等相对路径以用户主目录为基准
  return join(homedir(), relPath);
}

export function appInstallDir(appId: string): string {
  return join(combriefHome(), 'apps', appId);
}

export function appBackupDir(appId: string): string {
  return join(combriefHome(), 'backups', appId);
}

export function bridgeScriptPath(appId: string): string {
  const base = appInstallDir(appId);
  return process.platform === 'win32'
    ? join(base, 'bridge.cmd')
    : join(base, 'bridge.mjs');
}

export function remoteGateScriptPath(appId: string): string {
  const base = appInstallDir(appId);
  return process.platform === 'win32'
    ? join(base, 'remote-gate.cmd')
    : join(base, 'remote-gate.mjs');
}
