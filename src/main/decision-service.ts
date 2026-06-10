import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { CombriefConfig } from './config';
import { DecisionQueue } from './decision-queue';
import type { DecisionWaitBody, PendingDecision } from './decision/types';
import type { StateEvent, StateMeta } from './state-machine';
import type { SlackCardLabels } from './i18n/messages';
import { resolveLocale } from './i18n/messages';
import {
  buildDecisionBlocks,
  buildResolvedDecisionBlocks,
  type DecisionBlockInput,
  type DecisionCardMode,
  type PermissionButtonSpec,
  parseBlockActionValue,
} from './slack/blocks';
import { formatSlackCardTime } from './slack/card-time';
import {
  extractPermissionSuggestions,
  formatPermissionSuggestionLabel,
} from './slack/permission-suggestions';
import {
  buildHookStdout,
  type DecisionAction,
} from './slack/hook-stdout';
import { formatToolSummary } from './slack/tool-summary';
import type { BlockActionPayload, SlackAdapter } from './slack/adapter';
import { buildHardwareRequest } from './hardware/request-builder';
import { mapHardwareDecisionToAction } from './hardware/decision-mapper';
import {
  HARDWARE_PROTOCOL_VERSION,
  type HardwareDecisionMessage,
  type HardwareResolvedMessage,
  type HardwareResolvedResult,
} from './hardware/protocol';
import type { HardwareRuntime } from './hardware/runtime';

type ResolutionVia = 'slack' | 'local' | 'hardware';

interface SlackCardSnapshot {
  channelId: string;
  ts: string;
  input: DecisionBlockInput;
  toolName: string;
  requestedAtMs: number;
}

type CardResolution =
  | { kind: 'allow' | 'deny'; via: ResolutionVia; userId?: string }
  | {
      kind: 'allowAlways';
      via: ResolutionVia;
      userId?: string;
      detail: string;
    }
  | {
      kind: 'option';
      via: ResolutionVia;
      optionLabel: string;
      userId?: string;
    }
  | { kind: 'already' };

export interface StatePayload {
  appId: string;
  event: StateEvent;
  sessionId?: string;
  meta?: StateMeta;
}

/**
 * 双通道：Slack 卡片与 CC 原生确认 / 本地 CLI 并行；先处理者获胜。
 * AskUserQuestion / ExitPlanMode 仅走 PermissionRequest（不在 PreToolUse 阻塞）。
 * 本地已确认时返回 hookStdout: null，让 Hook 退出且不覆盖本地决策。
 */
export class DecisionService {
  private pendingMeta = new Map<string, PendingDecision>();
  private sessionIndex = new Map<string, string>();
  private cardSnapshots = new Map<string, SlackCardSnapshot>();
  private hardwareResolvedRequestIds = new Set<string>();
  private nonTimeoutResolvedRequestIds = new Set<string>();

  constructor(
    private getConfig: () => CombriefConfig,
    private slack: SlackAdapter | null,
    private queue: DecisionQueue,
    private getCardLabels: () => SlackCardLabels,
    private hardware: HardwareRuntime | null = null,
  ) {}

  async handleWait(
    body: DecisionWaitBody,
  ): Promise<{ requestId: string; hookStdout: string | null }> {
    const cfg = this.getConfig();
    const hardwareDecisionEnabled =
      cfg.hardware.enabled && cfg.hardware.decisionPushEnabled && this.hardware !== null;
    if (!cfg.slack.enabled && !hardwareDecisionEnabled) {
      return { requestId: '', hookStdout: null };
    }

    const requestId = randomUUID();
    this.pendingMeta.set(requestId, {
      requestId,
      body,
      createdAt: Date.now(),
    });
    if (body.sessionId) {
      this.sessionIndex.set(body.sessionId, requestId);
    }

    const waitPromise = this.queue.wait(requestId, cfg.slack.decisionTimeoutMs);

    if (cfg.slack.enabled && this.slack) {
      void this.postCard(requestId, body).catch(() => {
        /* 仍等待；本地 CLI 可照常确认 */
      });
    }

    if (hardwareDecisionEnabled && this.hardware) {
      void this.hardware
        .sendRequest(
          buildHardwareRequest(
            requestId,
            body,
            process.env.npm_package_version ?? '0.0.0',
            cfg.slack.decisionTimeoutMs,
          ),
        )
        .catch(() => {
          /* 决策通道仍可由 Slack / 本地 / 超时完成 */
        });
    }

    try {
      const result = await waitPromise;

      if (
        result.hookStdout === null &&
        !this.nonTimeoutResolvedRequestIds.has(requestId)
      ) {
        this.sendHardwareResolved(requestId, 'expired', 'Request expired');
      }

      if (result.hookStdout === null && cfg.slack.failClosed) {
        const deny = buildHookStdout({
          hookEvent: body.hookEvent,
          toolName: body.toolName,
          toolInput: body.toolInput,
          action: { kind: 'deny', reason: 'Slack decision timed out' },
        });
        return { requestId, hookStdout: deny };
      }

      return { requestId, hookStdout: result.hookStdout };
    } finally {
      this.clearPending(requestId, body.sessionId);
    }
  }

  resolveFromHardware(message: HardwareDecisionMessage): boolean {
    const pending = this.pendingMeta.get(message.decisionId);
    if (!pending || !this.queue.isWaiting(message.decisionId)) return false;

    const action = mapHardwareDecisionToAction(message, pending);
    if (!action) return false;

    const hookStdout = buildHookStdout({
      hookEvent: pending.body.hookEvent,
      toolName: pending.body.toolName,
      toolInput: pending.body.toolInput,
      action,
    });
    if (!this.queue.resolve(message.decisionId, { hookStdout, source: 'hardware' })) return false;
    this.nonTimeoutResolvedRequestIds.add(message.decisionId);

    const resolved = this.hardwareResolvedFromAction(action);
    this.sendHardwareResolved(message.decisionId, resolved.result, resolved.message);
    void this.updateCardResolved(
      message.decisionId,
      this.resolutionFromAction(action, 'hardware', pending.body.toolName),
    );
    return true;
  }

  /** remote-gate 终端菜单先处理：结束等待并更新 Slack 卡片 */
  resolveLocalTerminal(body: {
    sessionId?: string;
    toolName: string;
    kind: 'allow' | 'deny' | 'allowAlways';
    detail?: string;
  }): boolean {
    if (!body.sessionId) return false;
    const requestId = this.sessionIndex.get(body.sessionId);
    if (!requestId || !this.queue.isWaiting(requestId)) return false;

    const pending = this.pendingMeta.get(requestId);
    if (!pending || pending.body.toolName !== body.toolName) return false;

    if (!this.queue.resolve(requestId, { hookStdout: null, source: 'local' })) return false;
    this.nonTimeoutResolvedRequestIds.add(requestId);

    if (body.kind === 'allowAlways' && body.detail) {
      void this.updateCardResolved(requestId, {
        kind: 'allowAlways',
        via: 'local',
        detail: body.detail,
      });
    } else if (body.kind === 'deny') {
      void this.updateCardResolved(requestId, { kind: 'deny', via: 'local' });
    } else {
      void this.updateCardResolved(requestId, { kind: 'allow', via: 'local' });
    }
    this.sendHardwareResolved(
      requestId,
      'handled_elsewhere',
      'Handled by local terminal',
    );
    return true;
  }

  /** bridge 上报：本地 CLI 已处理同一待办 */
  tryResolveFromLocal(payload: StatePayload): void {
    if (payload.appId !== 'claude-code' || !payload.sessionId) return;

    const requestId = this.sessionIndex.get(payload.sessionId);
    if (!requestId || !this.queue.isWaiting(requestId)) return;

    const pending = this.pendingMeta.get(requestId);
    if (!pending) return;

    if (payload.event === 'postToolUse') {
      if (
        payload.meta?.toolName &&
        payload.meta.toolName !== pending.body.toolName
      ) {
        return;
      }
      this.queue.resolve(requestId, { hookStdout: null, source: 'local' });
      this.nonTimeoutResolvedRequestIds.add(requestId);
      void this.updateCardResolved(requestId, { kind: 'allow', via: 'local' });
      this.sendHardwareResolved(requestId, 'handled_elsewhere', 'Handled elsewhere');
      return;
    }

    if (
      payload.event === 'postToolUseFailure' &&
      payload.meta?.failureType === 'permission_denied'
    ) {
      this.queue.resolve(requestId, { hookStdout: null, source: 'local' });
      this.nonTimeoutResolvedRequestIds.add(requestId);
      void this.updateCardResolved(requestId, { kind: 'deny', via: 'local' });
      this.sendHardwareResolved(requestId, 'handled_elsewhere', 'Handled elsewhere');
    }
  }

  shutdown(reason = 'Runtime stopped'): void {
    for (const [requestId] of [...this.pendingMeta]) {
      if (!this.queue.isWaiting(requestId)) continue;
      this.nonTimeoutResolvedRequestIds.add(requestId);
      this.sendHardwareResolved(requestId, 'handled_elsewhere', reason);
      this.queue.resolve(requestId, { hookStdout: null, source: 'local' });
    }
  }

  async handleBlockAction(payload: BlockActionPayload): Promise<void> {
    const parsed = parseBlockActionValue(payload.value);
    if (!parsed) return;

    const meta = this.pendingMeta.get(parsed.requestId);
    if (!meta) return;

    if (!this.queue.isWaiting(parsed.requestId)) {
      await this.updateCardResolved(
        parsed.requestId,
        { kind: 'already' },
        payload.channelId,
        payload.messageTs,
      );
      return;
    }

    const action = this.toDecisionAction(parsed, meta.body);
    const hookStdout = buildHookStdout({
      hookEvent: meta.body.hookEvent,
      toolName: meta.body.toolName,
      toolInput: meta.body.toolInput,
      action,
    });
    if (!this.queue.resolve(parsed.requestId, { hookStdout, source: 'slack' })) return;
    this.nonTimeoutResolvedRequestIds.add(parsed.requestId);

    const resolution = this.resolutionFromAction(
      action,
      payload.userId,
      meta.body.toolName,
    );
    const hardwareResolution = this.hardwareResolvedFromAction(action);
    this.sendHardwareResolved(
      parsed.requestId,
      hardwareResolution.result,
      hardwareResolution.message,
    );
    await this.updateCardResolved(
      parsed.requestId,
      resolution,
      payload.channelId,
      payload.messageTs,
    );
  }

  private clearPending(requestId: string, sessionId?: string): void {
    this.pendingMeta.delete(requestId);
    this.hardwareResolvedRequestIds.delete(requestId);
    this.nonTimeoutResolvedRequestIds.delete(requestId);
    if (sessionId && this.sessionIndex.get(sessionId) === requestId) {
      this.sessionIndex.delete(sessionId);
    }
  }

  private sendHardwareResolved(
    requestId: string,
    result: HardwareResolvedResult,
    message: string,
  ): void {
    if (!this.hardware || this.hardwareResolvedRequestIds.has(requestId)) return;

    this.hardwareResolvedRequestIds.add(requestId);
    const resolved: HardwareResolvedMessage = {
      protocol: HARDWARE_PROTOCOL_VERSION,
      type: 'resolved',
      decisionId: requestId,
      result,
      message,
    };
    void this.hardware.sendResolved(resolved).catch(() => {
      this.hardwareResolvedRequestIds.delete(requestId);
    });
  }

  private hardwareResolvedFromAction(action: DecisionAction): {
    result: HardwareResolvedResult;
    message: string;
  } {
    if (action.kind === 'option') {
      return { result: 'selected', message: 'Selected by Remote' };
    }
    if (action.kind === 'deny') {
      return { result: 'denied', message: 'Denied by Remote' };
    }
    return { result: 'approved', message: 'Approved by Remote' };
  }

  private toDecisionAction(
    parsed: {
      action: string;
      optionLabel?: string;
      suggestionIndex?: number;
    },
    body: DecisionWaitBody,
  ): DecisionAction {
    if (parsed.action === 'option' && parsed.optionLabel) {
      return { kind: 'option', optionLabel: parsed.optionLabel };
    }
    if (
      parsed.action === 'allowAlways' &&
      parsed.suggestionIndex !== undefined
    ) {
      const suggestions = extractPermissionSuggestions(body.raw).slice(0, 3);
      const suggestion = suggestions[parsed.suggestionIndex];
      if (suggestion) {
        return { kind: 'allowAlways', suggestion };
      }
    }
    if (
      parsed.action === 'allow' ||
      parsed.action === 'allowOnce' ||
      parsed.action === 'allowAlways'
    ) {
      return { kind: 'allowOnce' };
    }
    if (body.toolName === 'ExitPlanMode') {
      return { kind: 'deny', reason: 'Denied via Slack' };
    }
    return { kind: 'deny' };
  }

  private buildPermissionButtons(body: DecisionWaitBody): PermissionButtonSpec[] {
    const labels = this.getCardLabels();
    const suggestions = extractPermissionSuggestions(body.raw).slice(0, 3);
    const buttons: PermissionButtonSpec[] = [
      {
        label: labels.slackAllowOnce,
        action: 'allowOnce',
        style: 'primary',
      },
    ];
    for (let i = 0; i < suggestions.length; i++) {
      buttons.push({
        label: formatPermissionSuggestionLabel(
          suggestions[i],
          body.toolName,
          labels.slackAllowAlways,
        ),
        action: 'allowAlways',
        suggestionIndex: i,
      });
    }
    buttons.push({
      label: labels.slackDeny,
      action: 'deny',
      style: 'danger',
    });
    return buttons;
  }

  private formatCardTime(ms: number): string {
    return formatSlackCardTime(ms, resolveLocale(this.getConfig().locale));
  }

  private requestedTimeFooter(ms: number): string {
    return this.getCardLabels().slackCardRequestedAt(this.formatCardTime(ms));
  }

  private resolvedTimeFooter(requestedMs: number, resolvedMs: number): string {
    const labels = this.getCardLabels();
    return labels.slackCardResolvedAt(
      this.formatCardTime(requestedMs),
      this.formatCardTime(resolvedMs),
    );
  }

  private cardInput(
    requestId: string,
    body: DecisionWaitBody,
    requestedAtMs: number,
  ): DecisionBlockInput {
    const mode: DecisionCardMode =
      body.toolName === 'AskUserQuestion'
        ? 'askUser'
        : body.toolName === 'ExitPlanMode'
          ? 'exitPlan'
          : 'permission';

    const options =
      mode === 'askUser' && Array.isArray(body.toolInput.questions)
        ? (
            body.toolInput.questions as { options?: { label: string }[] }[]
          ).flatMap((q) => q.options ?? [])
        : undefined;

    const sessionLabel = (body.sessionId ?? 'unknown').slice(-6);
    const cwdLabel = body.cwd ? basename(body.cwd) : '—';
    const summary = formatToolSummary(body.toolName, body.toolInput);
    const labels = this.getCardLabels();

    const permissionButtons =
      mode === 'permission' && body.hookEvent === 'permissionRequest'
        ? this.buildPermissionButtons(body)
        : undefined;

    return {
      requestId,
      title: labels.slackCardTitle,
      toolName: body.toolName,
      cwdLabel,
      sessionLabel,
      summary,
      mode,
      options,
      permissionButtons,
      timeFooter: this.requestedTimeFooter(requestedAtMs),
    };
  }

  private resolutionStatusText(resolution: CardResolution): string {
    const labels = this.getCardLabels();
    if (resolution.kind === 'already') {
      return labels.slackResolvedAlready();
    }
    if (resolution.kind === 'option') {
      if (resolution.via === 'hardware') {
        return `Selected by ComBrief Remote: ${resolution.optionLabel}`;
      }
      if (resolution.via === 'slack' && resolution.userId) {
        return labels.slackResolvedOptionSlack(
          resolution.optionLabel,
          resolution.userId,
        );
      }
      return labels.slackResolvedOptionLocal();
    }
    if (resolution.kind === 'allowAlways') {
      if (resolution.via === 'hardware') {
        return `Allowed by ComBrief Remote: ${resolution.detail}`;
      }
      if (resolution.via === 'local') {
        return labels.slackResolvedAllowAlwaysLocal(resolution.detail);
      }
      return labels.slackResolvedAllowAlwaysSlack(
        resolution.detail,
        resolution.userId ?? '',
      );
    }
    if (resolution.kind === 'allow') {
      if (resolution.via === 'hardware') {
        return 'Allowed by ComBrief Remote';
      }
      if (resolution.via === 'slack' && resolution.userId) {
        return labels.slackResolvedAllowSlack(resolution.userId);
      }
      return labels.slackResolvedAllowLocal();
    }
    if (resolution.via === 'hardware') {
      return 'Denied by ComBrief Remote';
    }
    if (resolution.via === 'slack' && resolution.userId) {
      return labels.slackResolvedDenySlack(resolution.userId);
    }
    return labels.slackResolvedDenyLocal();
  }

  private resolutionFromAction(
    action: DecisionAction,
    userId: string,
    toolName: string,
  ): CardResolution {
    const via: 'slack' | 'hardware' = userId === 'hardware' ? 'hardware' : 'slack';
    const resolvedUserId = via === 'slack' ? userId : undefined;
    if (action.kind === 'option') {
      return {
        kind: 'option',
        via,
        optionLabel: action.optionLabel,
        userId: resolvedUserId,
      };
    }
    if (action.kind === 'allowAlways') {
      const detail = formatPermissionSuggestionLabel(
        action.suggestion,
        toolName,
        (d) => d,
      );
      return { kind: 'allowAlways', via, userId: resolvedUserId, detail };
    }
    if (action.kind === 'allow' || action.kind === 'allowOnce') {
      return { kind: 'allow', via, userId: resolvedUserId };
    }
    return { kind: 'deny', via, userId: resolvedUserId };
  }

  private async updateCardResolved(
    requestId: string,
    resolution: CardResolution,
    channelId?: string,
    messageTs?: string,
  ): Promise<void> {
    if (!this.slack) return;

    const snapshot = this.cardSnapshots.get(requestId);
    const resolvedChannelId = channelId ?? snapshot?.channelId;
    const resolvedTs = messageTs ?? snapshot?.ts;
    if (!snapshot || !resolvedChannelId || !resolvedTs) return;

    const statusText = this.resolutionStatusText(resolution);
    const labels = this.getCardLabels();
    const resolvedInput: DecisionBlockInput = {
      ...snapshot.input,
      timeFooter: this.resolvedTimeFooter(
        snapshot.requestedAtMs,
        Date.now(),
      ),
    };

    try {
      await this.slack.updateDecisionMessage({
        channelId: resolvedChannelId,
        ts: resolvedTs,
        text: `${labels.slackCardTitle}: ${snapshot.toolName} — ${statusText}`,
        blocks: buildResolvedDecisionBlocks(resolvedInput, statusText),
      });
      this.cardSnapshots.delete(requestId);
    } catch {
      /* 决策已生效；卡片更新失败不阻塞 */
    }
  }

  private async postCard(requestId: string, body: DecisionWaitBody): Promise<void> {
    if (!this.slack) return;

    const requestedAtMs = Date.now();
    const input = this.cardInput(requestId, body, requestedAtMs);
    const labels = this.getCardLabels();
    const cfg = this.getConfig();

    const ts = await this.slack.postDecisionMessage({
      text: `${labels.slackCardTitle}: ${body.toolName}`,
      blocks: buildDecisionBlocks(input),
    });
    this.cardSnapshots.set(requestId, {
      channelId: cfg.slack.channelId,
      ts,
      input,
      toolName: body.toolName,
      requestedAtMs,
    });
  }

  async sendTest(): Promise<void> {
    if (!this.slack) throw new Error('Slack adapter not running');
    const labels = this.getCardLabels();
    const now = Date.now();
    await this.slack.postTestMessage(
      'ComBrief Slack is connected',
      labels.slackCardRequestedAt(this.formatCardTime(now)),
    );
  }
}
