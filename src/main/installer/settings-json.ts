import { COMBRIEF_MARKER } from './hooks-json';

export const CLAUDE_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'PermissionRequest',
] as const;

export interface ClaudeHookCommand {
  type: 'command';
  command: string;
  env?: Record<string, string>;
}

export interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHookCommand[];
}

export interface ClaudeSettingsFile {
  hooks?: Record<string, ClaudeHookGroup[]>;
  [key: string]: unknown;
}

function isCombriefCommand(cmd: ClaudeHookCommand): boolean {
  return cmd.env?.COMBRIEF_MARKER === COMBRIEF_MARKER;
}

export function collectClaudeChainCommands(
  settings: ClaudeSettingsFile,
): string[] {
  const commands = new Set<string>();
  for (const groups of Object.values(settings.hooks ?? {})) {
    for (const group of groups) {
      for (const cmd of group.hooks ?? []) {
        if (!isCombriefCommand(cmd) && cmd.command) {
          commands.add(cmd.command);
        }
      }
    }
  }
  return [...commands];
}

export function injectClaudeBridge(
  settings: ClaudeSettingsFile,
  bridgePath: string,
  appId: string,
): ClaudeSettingsFile {
  const next: ClaudeSettingsFile = structuredClone(settings);
  next.hooks ??= {};

  for (const event of CLAUDE_EVENTS) {
    const cmd: ClaudeHookCommand = {
      type: 'command',
      command: bridgePath,
      env: {
        CLAUDE_HOOK_EVENT: event,
        COMBRIEF_APP_ID: appId,
        COMBRIEF_MARKER,
      },
    };

    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((h) => !isCombriefCommand(h)),
      }))
      .filter((group) => group.hooks.length > 0);

    groups.push({ hooks: [cmd] });
    next.hooks[event] = groups;
  }

  return next;
}

export function removeClaudeBridge(
  settings: ClaudeSettingsFile,
): ClaudeSettingsFile {
  const next: ClaudeSettingsFile = structuredClone(settings);
  if (!next.hooks) return next;

  for (const event of Object.keys(next.hooks)) {
    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((h) => !isCombriefCommand(h)),
      }))
      .filter((group) => group.hooks.length > 0);
    if (groups.length === 0) {
      delete next.hooks[event];
    } else {
      next.hooks[event] = groups;
    }
  }

  return next;
}

export function emptyClaudeSettings(): ClaudeSettingsFile {
  return { hooks: {} };
}
