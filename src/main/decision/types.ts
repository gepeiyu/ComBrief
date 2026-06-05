export type HookEventKind = 'permissionRequest' | 'preToolUse';

export interface DecisionWaitBody {
  appId: string;
  hookEvent: HookEventKind;
  sessionId?: string;
  cwd?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface PendingDecision {
  requestId: string;
  body: DecisionWaitBody;
  createdAt: number;
}
