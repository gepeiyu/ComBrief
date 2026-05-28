export const COMBRIEF_MARKER = 'combrief-bridge';

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
  env?: Record<string, string>;
  type?: string;
  timeout?: number;
  matcher?: string;
}

export interface CursorHooksFile {
  version: number;
  hooks: Record<string, CursorHookEntry[]>;
}

export function isCombriefHook(entry: CursorHookEntry): boolean {
  return entry.env?.COMBRIEF_MARKER === COMBRIEF_MARKER;
}

export function collectChainCommands(hooksJson: CursorHooksFile): string[] {
  const commands = new Set<string>();
  for (const list of Object.values(hooksJson.hooks ?? {})) {
    for (const entry of list) {
      if (!isCombriefHook(entry) && entry.command) {
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
  const next: CursorHooksFile = structuredClone(hooksJson);
  next.version ??= 1;
  next.hooks ??= {};

  for (const event of CURSOR_EVENTS) {
    const entry: CursorHookEntry = {
      command: bridgePath,
      env: {
        CURSOR_HOOK_EVENT: event,
        COMBRIEF_APP_ID: appId,
        COMBRIEF_MARKER,
      },
    };
    const list = (next.hooks[event] ?? []).filter((h) => !isCombriefHook(h));
    list.push(entry);
    next.hooks[event] = list;
  }

  return next;
}

export function removeCursorBridge(hooksJson: CursorHooksFile): CursorHooksFile {
  const next: CursorHooksFile = structuredClone(hooksJson);
  for (const event of Object.keys(next.hooks ?? {})) {
    const list = (next.hooks[event] ?? []).filter((h) => !isCombriefHook(h));
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
