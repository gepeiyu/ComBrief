import type { DecisionWaitBody } from '../decision/types';
import { formatToolSummary } from '../slack/tool-summary';
import {
  HARDWARE_PROTOCOL_VERSION,
  clampHardwareText,
  hardwareProtocolLimits,
  type HardwareOption,
  type HardwareRequestKind,
  type HardwareRequestMessage,
} from './protocol';

function sourceLabel(appId: string): string {
  if (appId === 'claude-code') return 'CC';
  if (appId === 'cursor') return 'CU';
  return appId.slice(0, 2).toUpperCase();
}

function requestKind(body: DecisionWaitBody): HardwareRequestKind {
  if (body.toolName === 'AskUserQuestion') return 'ASK';
  if (body.toolName === 'ExitPlanMode') return 'PLAN';
  if (body.toolName === 'Bash' || body.toolName === 'Shell') return 'SHELL';
  if (body.toolName.toLowerCase().includes('mcp')) return 'MCP';
  return 'PERMISSION';
}

function firstLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}

function stringifyToolInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([key, value]) => {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return `${key}: ${value}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');
}

type AskOptionsSource = DecisionWaitBody | unknown;

function askQuestions(source: AskOptionsSource): unknown {
  if (source && typeof source === 'object' && 'toolInput' in source) {
    return (source as DecisionWaitBody).toolInput.questions;
  }
  return source;
}

function askQuestionObjects(source: AskOptionsSource): Array<Record<string, unknown>> {
  const questions = askQuestions(source);
  if (!Array.isArray(questions)) return [];
  return questions.filter(
    (question): question is Record<string, unknown> =>
      Boolean(question) && typeof question === 'object',
  );
}

export interface HardwareAskOption extends HardwareOption {
  optionLabel: string;
}

export function extractHardwareAskOptions(source: AskOptionsSource): HardwareAskOption[] {
  const labels = askQuestionObjects(source).flatMap((question) => {
    const options = question.options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const label = (option as { label?: unknown }).label;
      if (typeof label !== 'string' || label.trim().length === 0) return [];
      return [label];
    });
  });

  return labels.slice(0, hardwareProtocolLimits.maxOptions).map((label, index) => ({
    id: `option:${index}`,
    label: clampHardwareText(label, hardwareProtocolLimits.maxOptionLabelLen),
    optionLabel: label,
  }));
}

function askContent(body: DecisionWaitBody): string {
  const questions = askQuestionObjects(body)
    .flatMap((question) => {
      const text = question.question;
      return typeof text === 'string' ? [text] : [];
    })
    .join('\n');
  return questions || stringifyToolInput(body.toolInput);
}

function optionsFor(
  body: DecisionWaitBody,
): { options: HardwareOption[]; defaultFocus: string } {
  if (body.toolName === 'AskUserQuestion') {
    const askOptions = extractHardwareAskOptions(body);
    const options = askOptions.map(({ id, label }) => ({ id, label }));
    return { options, defaultFocus: options[0]?.id ?? 'option:0' };
  }

  if (body.toolName === 'ExitPlanMode') {
    return {
      options: [
        { id: 'allow', label: 'Approve' },
        { id: 'deny', label: 'Reject' },
      ],
      defaultFocus: 'allow',
    };
  }

  return {
    options: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Deny' },
    ],
    defaultFocus: 'allow',
  };
}

function contentFor(body: DecisionWaitBody): string {
  if (body.toolName === 'AskUserQuestion') return askContent(body);

  const lines = [formatToolSummary(body.toolName, body.toolInput)];
  const input = stringifyToolInput(body.toolInput);
  if (input) lines.push(input);
  if (body.cwd) lines.push(`cwd: ${body.cwd}`);
  return lines.filter(Boolean).join('\n');
}

export function buildHardwareRequest(
  requestId: string,
  body: DecisionWaitBody,
  appVersion: string,
  timeoutMs: number,
  now = Date.now(),
): HardwareRequestMessage {
  const content = clampHardwareText(
    contentFor(body),
    hardwareProtocolLimits.maxContentLen,
  );
  const { options, defaultFocus } = optionsFor(body);

  return {
    protocol: HARDWARE_PROTOCOL_VERSION,
    type: 'request',
    appName: 'ComBrief',
    appVersion,
    decisionId: requestId,
    source: body.appId,
    sourceLabel: sourceLabel(body.appId),
    kind: requestKind(body),
    brief: clampHardwareText(firstLine(content), hardwareProtocolLimits.maxBriefLen),
    content,
    options,
    defaultFocus,
    expiresAt: now + timeoutMs,
  };
}
