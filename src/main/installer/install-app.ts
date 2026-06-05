import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getAppDefinition } from '../apps/registry';
import {
  combriefHome,
  ensureConfig,
  loadConfig,
  saveConfig,
  type CombriefConfig,
} from '../config';
import {
  collectChainCommands,
  emptyCursorHooks,
  injectCursorBridge,
  removeCursorBridge,
  type CursorHooksFile,
} from './hooks-json';
import {
  collectClaudeChainCommands,
  emptyClaudeSettings,
  injectClaudeBridge,
  removeClaudeBridge,
  type ClaudeSettingsFile,
} from './settings-json';
import {
  appBackupDir,
  appInstallDir,
  bridgeScriptPath,
  remoteGateScriptPath,
  expandHomePath,
} from './paths';
import { injectRemoteGate, removeRemoteGate } from './remote-gate-json';
import { resolveNodeExecutable, writeWindowsBridgeCmd } from './node-resolve';

function extensionsSourceDir(appId: string): string {
  const candidates = [
    join(process.cwd(), 'extensions', appId),
    join(process.cwd(), 'dist', 'extensions', appId),
    join(__dirname, '..', '..', 'extensions', appId),
    join(__dirname, '..', 'extensions', appId),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'bridge.mjs')));
  if (!found) throw new Error(`Extension source not found for ${appId}`);
  return found;
}

function backupConfig(configPath: string, appId: string): string {
  const backupDir = appBackupDir(appId);
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `${stamp}.json`);
  if (existsSync(configPath)) {
    copyFileSync(configPath, backupPath);
  } else {
    writeFileSync(backupPath, '{}');
  }
  return backupPath;
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function copyBridgeFiles(appId: string, destDir: string): string | undefined {
  const src = extensionsSourceDir(appId);
  mkdirSync(destDir, { recursive: true });
  const bridgePath = join(destDir, 'bridge.mjs');
  for (const name of readdirSync(src)) {
    if (!name.endsWith('.mjs')) continue;
    const dest = join(destDir, name);
    cpSync(join(src, name), dest);
    if (process.platform !== 'win32') {
      chmodSync(dest, 0o755);
    }
  }
  const gatePath = join(destDir, 'remote-gate.mjs');
  if (process.platform === 'win32' && existsSync(gatePath)) {
    const nodePath = resolveNodeExecutable();
    writeWindowsBridgeCmd(
      join(destDir, 'remote-gate.cmd'),
      nodePath,
      gatePath,
    );
  }
  if (process.platform === 'win32') {
    const nodePath = resolveNodeExecutable();
    writeWindowsBridgeCmd(join(destDir, 'bridge.cmd'), nodePath, bridgePath);
    return nodePath;
  }
  chmodSync(bridgePath, 0o755);
  return undefined;
}

export interface InstallResult {
  appId: string;
  backupPath: string;
  bridgePath: string;
}

export function installApp(appId: string): InstallResult {
  const app = getAppDefinition(appId);
  const home = combriefHome();
  ensureConfig(home);

  const configPath = expandHomePath(app.hooksConfigRelPath);
  const backupPath = backupConfig(configPath, appId);

  const installDir = appInstallDir(appId);
  const nodePath = copyBridgeFiles(appId, installDir);

  const bridgePath = bridgeScriptPath(appId);
  let chainCommands: string[] = [];

  if (app.kind === 'cursor-hooks-json') {
    const current = readJsonFile(configPath, emptyCursorHooks());
    chainCommands = collectChainCommands(current, bridgePath);
    const next = injectCursorBridge(current, bridgePath, appId);
    writeJsonFile(configPath, next);
  } else {
    const current = readJsonFile<ClaudeSettingsFile>(
      configPath,
      emptyClaudeSettings(),
    );
    const gatePath = remoteGateScriptPath(appId);
    chainCommands = collectClaudeChainCommands(current, bridgePath, gatePath);
    let next = injectClaudeBridge(current, bridgePath, appId);
    next = injectRemoteGate(next, gatePath);
    writeJsonFile(configPath, next);
  }

  writeFileSync(
    join(installDir, 'chain.json'),
    JSON.stringify({ commands: chainCommands }, null, 2),
  );

  writeFileSync(
    join(installDir, 'manifest.json'),
    JSON.stringify(
      {
        appId,
        version: 1,
        bridgePath,
        configPath,
        backupPath,
        ...(nodePath ? { nodePath } : {}),
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const cfg = loadConfig(home);
  const apps = new Set(cfg.apps);
  apps.add(appId);
  const updated: CombriefConfig = { ...cfg, apps: [...apps] };
  saveConfig(home, updated);

  return { appId, backupPath, bridgePath };
}

export function uninstallApp(appId: string): void {
  const app = getAppDefinition(appId);
  const configPath = expandHomePath(app.hooksConfigRelPath);

  // 只移除 ComBrief 条目，不还原安装时整文件备份（避免覆盖用户之后的 hook 修改）
  if (existsSync(configPath)) {
    if (app.kind === 'cursor-hooks-json') {
      writeJsonFile(configPath, removeCursorFromFile(configPath, bridgeScriptPath(appId)));
    } else {
      writeJsonFile(
        configPath,
        removeClaudeFromFile(configPath, bridgeScriptPath(appId), appId),
      );
    }
  }

  const home = combriefHome();
  const cfg = loadConfig(home);
  saveConfig(home, {
    ...cfg,
    apps: cfg.apps.filter((id) => id !== appId),
  });
}

function removeCursorFromFile(
  configPath: string,
  bridgePath: string,
): CursorHooksFile {
  const current = readJsonFile(configPath, emptyCursorHooks());
  return removeCursorBridge(current, bridgePath);
}

function removeClaudeFromFile(
  configPath: string,
  bridgePath: string,
  appId: string,
): ClaudeSettingsFile {
  const current = readJsonFile(configPath, emptyClaudeSettings());
  const gatePath = remoteGateScriptPath(appId);
  return removeRemoteGate(removeClaudeBridge(current, bridgePath), gatePath);
}
