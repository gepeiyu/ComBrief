export const CLAUDE_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
] as const;

export interface ClaudeHookCommand {
  type: 'command';
  command: string;
}

export interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHookCommand[];
}

export interface ClaudeSettingsFile {
  hooks?: Record<string, ClaudeHookGroup[]>;
  [key: string]: unknown;
}

export function formatClaudeHookCommand(path: string, event?: string): string {
  const command =
    process.platform === 'win32'
      ? `"${path.replace(/\\/g, '/').replace(/"/g, '\\"')}"`
      : path;
  return event ? `${command} ${event}` : command;
}

function normalizeHookCommand(command: string): string {
  const match = command.trim().match(/^"([^"]+)"|^(\S+)/);
  return (match?.[1] ?? match?.[2] ?? '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function isCombriefCommand(
  cmd: ClaudeHookCommand,
  bridgePath?: string,
): boolean {
  if (!bridgePath) return false;
  return normalizeHookCommand(cmd.command) === normalizeHookCommand(formatClaudeHookCommand(bridgePath));
}

export function collectClaudeChainCommands(
  settings: ClaudeSettingsFile,
  bridgePath?: string,
): string[] {
  const commands = new Set<string>();
  for (const groups of Object.values(settings.hooks ?? {})) {
    for (const group of groups) {
      for (const cmd of group.hooks ?? []) {
        if (!isCombriefCommand(cmd, bridgePath) && cmd.command) {
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
  const next = removeClaudeBridge(settings, bridgePath);
  next.hooks ??= {};

  for (const event of CLAUDE_EVENTS) {
    const cmd: ClaudeHookCommand = {
      type: 'command',
      command: formatClaudeHookCommand(bridgePath, event),
    };

    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter(
          (h) => !isCombriefCommand(h, bridgePath),
        ),
      }))
      .filter((group) => group.hooks.length > 0);

    groups.push({ hooks: [cmd] });
    next.hooks[event] = groups;
  }

  return next;
}

export function removeClaudeBridge(
  settings: ClaudeSettingsFile,
  bridgePath: string,
): ClaudeSettingsFile {
  const next: ClaudeSettingsFile = structuredClone(settings);
  if (!next.hooks) return next;

  for (const event of Object.keys(next.hooks)) {
    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter(
          (h) => !isCombriefCommand(h, bridgePath),
        ),
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
