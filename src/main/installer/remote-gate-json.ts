import type { ClaudeHookCommand, ClaudeSettingsFile } from './settings-json';
import { formatClaudeHookCommand } from './settings-json';

/** PermissionRequest 双通道：CC 原生 UI 与 Slack 并行，先处理者获胜。 */
export const REMOTE_GATE_HOOKS: Array<{ event: string; matcher?: string }> = [
  { event: 'PermissionRequest' },
];

function normalizeHookCommand(command: string): string {
  const match = command.trim().match(/^"([^"]+)"|^(\S+)/);
  return (match?.[1] ?? match?.[2] ?? '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function isRemoteGateCommand(
  cmd: ClaudeHookCommand,
  gatePath?: string,
): boolean {
  if (!gatePath) return false;
  const base = normalizeHookCommand(formatClaudeHookCommand(gatePath));
  const cmdBase = normalizeHookCommand(cmd.command);
  return cmdBase === base || cmdBase.startsWith(`${base} `);
}

export function injectRemoteGate(
  settings: ClaudeSettingsFile,
  gatePath: string,
): ClaudeSettingsFile {
  const next = removeRemoteGate(settings, gatePath);
  next.hooks ??= {};

  const byEvent = new Map<string, Array<{ matcher?: string }>>();
  for (const entry of REMOTE_GATE_HOOKS) {
    const list = byEvent.get(entry.event) ?? [];
    list.push({ matcher: entry.matcher });
    byEvent.set(entry.event, list);
  }

  for (const [event, entries] of byEvent) {
    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter(
          (h) => !isRemoteGateCommand(h, gatePath),
        ),
      }))
      .filter((group) => group.hooks.length > 0);

    for (const { matcher } of entries) {
      groups.push({
        ...(matcher ? { matcher } : {}),
        hooks: [
          {
            type: 'command',
            command: formatClaudeHookCommand(gatePath, event),
          },
        ],
      });
    }
    next.hooks[event] = groups;
  }

  return next;
}

export function removeRemoteGate(
  settings: ClaudeSettingsFile,
  gatePath: string,
): ClaudeSettingsFile {
  const next: ClaudeSettingsFile = structuredClone(settings);
  if (!next.hooks) return next;

  for (const event of Object.keys(next.hooks)) {
    const groups = (next.hooks[event] ?? [])
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter(
          (h) => !isRemoteGateCommand(h, gatePath),
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
