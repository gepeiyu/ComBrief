export const CURSOR_EVENTS = [
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'beforeShellExecution',
  'afterShellExecution',
  'afterAgentResponse',
  'afterAgentThought',
  'subagentStart',
  'subagentStop',
  'stop',
] as const;

export interface CursorHookEntry {
  command: string;
  type?: string;
  timeout?: number;
  matcher?: string;
}

export interface CursorHooksFile {
  version: number;
  hooks: Record<string, CursorHookEntry[]>;
}

function normalizeHookCommand(command: string): string {
  return command
    .trim()
    .split(/\s+/)[0]
    .replace(/^"|"$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function formatCursorHookCommand(path: string, event: string): string {
  return `${path} ${event}`;
}

export function isCombriefHook(
  entry: CursorHookEntry,
  bridgePath?: string,
): boolean {
  if (!bridgePath) return false;
  return normalizeHookCommand(entry.command) === normalizeHookCommand(bridgePath);
}

export function collectChainCommands(
  hooksJson: CursorHooksFile,
  bridgePath?: string,
  gatePath?: string,
): string[] {
  const commands = new Set<string>();
  for (const list of Object.values(hooksJson.hooks ?? {})) {
    for (const entry of list) {
      if (
        !isCombriefHook(entry, bridgePath) &&
        !isCombriefHook(entry, gatePath) &&
        entry.command
      ) {
        commands.add(entry.command);
      }
    }
  }
  return [...commands];
}

export function injectCursorBridge(
  hooksJson: CursorHooksFile,
  bridgePath: string,
  appId: string,
): CursorHooksFile {
  const next = removeCursorBridge(hooksJson, bridgePath);
  next.version ??= 1;
  next.hooks ??= {};

  for (const event of CURSOR_EVENTS) {
    const entry: CursorHookEntry = {
      command: formatCursorHookCommand(bridgePath, event),
    };
    const list = (next.hooks[event] ?? []).filter(
      (h) => !isCombriefHook(h, bridgePath),
    );
    list.push(entry);
    next.hooks[event] = list;
  }

  return next;
}

export const CURSOR_DECISION_TIMEOUT_MS = 630_000;
export const CURSOR_REMOTE_GATE_EVENTS = [
  'preToolUse',
  'beforeShellExecution',
] as const;

export function injectCursorRemoteGate(
  hooksJson: CursorHooksFile,
  gatePath: string,
): CursorHooksFile {
  const next = removeCursorRemoteGate(hooksJson, gatePath);
  next.version ??= 1;
  next.hooks ??= {};

  for (const event of CURSOR_REMOTE_GATE_EVENTS) {
    const list = (next.hooks[event] ?? []).filter(
      (h) => !isCombriefHook(h, gatePath),
    );
    list.push({
      command: formatCursorHookCommand(gatePath, event),
      timeout: CURSOR_DECISION_TIMEOUT_MS,
    });
    next.hooks[event] = list;
  }

  return next;
}

export function removeCursorRemoteGate(
  hooksJson: CursorHooksFile,
  gatePath: string,
): CursorHooksFile {
  const next: CursorHooksFile = structuredClone(hooksJson);
  for (const event of Object.keys(next.hooks ?? {})) {
    const list = (next.hooks[event] ?? []).filter(
      (h) => !isCombriefHook(h, gatePath),
    );
    if (list.length === 0) {
      delete next.hooks[event];
    } else {
      next.hooks[event] = list;
    }
  }
  return next;
}

export function removeCursorBridge(
  hooksJson: CursorHooksFile,
  bridgePath: string,
): CursorHooksFile {
  const next: CursorHooksFile = structuredClone(hooksJson);
  for (const event of Object.keys(next.hooks ?? {})) {
    const list = (next.hooks[event] ?? []).filter(
      (h) => !isCombriefHook(h, bridgePath),
    );
    if (list.length === 0) {
      delete next.hooks[event];
    } else {
      next.hooks[event] = list;
    }
  }
  return next;
}

export function emptyCursorHooks(): CursorHooksFile {
  return { version: 1, hooks: {} };
}
