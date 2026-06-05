import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getAppDefinition } from './apps/registry';
import { resolveLocale, type Locale } from './i18n';
import { normalizeTrayAbbrev } from './tray-icons';

export interface SlackConfig {
  enabled: boolean;
  botToken: string;
  appToken: string;
  channelId: string;
  decisionTimeoutMs: number;
  failClosed: boolean;
  allowedUserIds: string[];
}

export function defaultSlackConfig(): SlackConfig {
  return {
    enabled: false,
    botToken: '',
    appToken: '',
    channelId: '',
    decisionTimeoutMs: 600_000,
    failClosed: false,
    allowedUserIds: [],
  };
}

export interface CombriefConfig {
  port: number;
  token: string;
  heartbeatTimeoutMs: number;
  idleAfterWorkingMs: number;
  /** preToolUse 后无 postToolUse 超过此毫秒 → 视为等待用户批准执行 */
  pendingToolApprovalMs: number;
  notificationsEnabled: boolean;
  /** 写入 ~/.combrief/logs（events.log / bridge.log）；默认关 */
  eventLoggingEnabled: boolean;
  launchAtLogin: boolean;
  /** macOS 菜单栏圆点旁显示缩写 */
  showTrayAbbrev: boolean;
  /** 按 appId 覆盖默认缩写：最多 2 字母或 1 汉字 */
  trayAbbrevs: Record<string, string>;
  /** UI language */
  locale: Locale;
  apps: string[];
  slack: SlackConfig;
}

export function resolveEventLoggingEnabled(cfg: CombriefConfig): boolean {
  return cfg.eventLoggingEnabled === true;
}

export function resolveTrayAbbrev(
  appId: string,
  cfg: CombriefConfig,
): string {
  if (!cfg.showTrayAbbrev) return '';
  const custom = cfg.trayAbbrevs[appId];
  if (custom !== undefined && custom.trim() !== '') {
    return normalizeTrayAbbrev(custom);
  }
  return normalizeTrayAbbrev(getAppDefinition(appId).trayAbbrev);
}

export function combriefHome(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error('Cannot resolve home directory');
  return join(home, '.combrief');
}

export function defaultConfig(): CombriefConfig {
  return {
    port: 3847,
    token: randomBytes(24).toString('hex'),
    heartbeatTimeoutMs: 45_000,
    idleAfterWorkingMs: 5_000,
    pendingToolApprovalMs: 5_000,
    notificationsEnabled: true,
    eventLoggingEnabled: false,
    launchAtLogin: false,
    showTrayAbbrev: true,
    trayAbbrevs: {},
    locale: 'en',
    apps: [],
    slack: defaultSlackConfig(),
  };
}

export function loadConfig(home = combriefHome()): CombriefConfig {
  const path = join(home, 'config.json');
  if (!existsSync(path)) {
    const cfg = defaultConfig();
    return cfg;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CombriefConfig>;
  const base = defaultConfig();
  return {
    ...base,
    ...raw,
    token: raw.token ?? base.token,
    apps: raw.apps ?? [],
    showTrayAbbrev: raw.showTrayAbbrev ?? base.showTrayAbbrev,
    eventLoggingEnabled: raw.eventLoggingEnabled ?? base.eventLoggingEnabled,
    trayAbbrevs: { ...base.trayAbbrevs, ...raw.trayAbbrevs },
    locale: resolveLocale(raw.locale ?? base.locale),
    slack: {
      ...base.slack,
      ...(raw.slack ?? {}),
      allowedUserIds: raw.slack?.allowedUserIds ?? base.slack.allowedUserIds,
    },
  };
}

export function saveConfig(home: string, cfg: CombriefConfig): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify(cfg, null, 2));
}

export function ensureConfig(home = combriefHome()): CombriefConfig {
  const path = join(home, 'config.json');
  if (!existsSync(path)) {
    const cfg = defaultConfig();
    saveConfig(home, cfg);
    return cfg;
  }
  return loadConfig(home);
}
