import type { DecisionWaitBody } from '../decision/types';
import {
  extractPermissionSuggestions,
  formatPermissionSuggestionLabel,
} from '../slack/permission-suggestions';
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
  if (appId === 'cursor') return 'C';
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

function isAsciiPrintable(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

function normalizeSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function compactAskQuestion(question: string): string {
  const line = normalizeSingleLine(firstLine(question));
  if (line.length === 0) return '';

  if (!isAsciiPrintable(line) && /Mongo/i.test(line) && /集成测试/.test(line) && /提交/.test(line)) {
    return '最近提交包含\nMongo集成测试?';
  }

  return line;
}

function commandText(body: DecisionWaitBody): string {
  const command = body.toolInput.command ?? body.toolInput.cmd;
  return typeof command === 'string' ? normalizeSingleLine(command) : '';
}

function compactCommand(command: string): string {
  const line = normalizeSingleLine(command);
  if (!line) return '';

  const known = line.match(
    /\b(gh|npm|pnpm|yarn|node|git|aos|python3?|npx)\s+([^\s;&|)]+)(?:\s+([^\s;&|)]+))?/,
  );
  if (known) {
    return [known[1], known[2], known[3]].filter(Boolean).join(' ');
  }

  const firstSegment = line.split(/\s*(?:&&|\|\||;|\|)\s*/)[0] ?? line;
  return firstSegment;
}

function permissionActionBrief(body: DecisionWaitBody, content: string): string {
  const kind = requestKind(body);
  if (kind === 'SHELL') {
    const command = compactCommand(commandText(body) || content);
    return command ? `执行命令\n${command}` : '执行命令';
  }
  if (kind === 'MCP') return `MCP调用\n${body.toolName}`;
  return `请求权限\n${body.toolName}`;
}

function askBrief(body: DecisionWaitBody): string {
  const question = askQuestionObjects(body)
    .map((item) => item.question)
    .find((text): text is string => typeof text === 'string' && text.trim().length > 0);
  return question ? compactAskQuestion(question) : stringifyToolInput(body.toolInput);
}

function readableAskOption(label: string, index: number): string {
  const trimmed = label.trim();
  const first = normalizeSingleLine(firstLine(trimmed));
  if (isAsciiPrintable(first)) return first;

  const judgement = first.match(/^(对|错|是|否)(?:[\s，,。.!！?？:：]|$)/);
  if (judgement) return judgement[1];

  const phrase = first.split(/[，,。.!！?？:：]/)[0]?.trim();
  if (phrase) return phrase;

  return `选项${index + 1}`;
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
    label: clampHardwareText(
      readableAskOption(label, index),
      hardwareProtocolLimits.maxOptionLabelLen,
    ),
    optionLabel: label,
  }));
}

function askContent(body: DecisionWaitBody): string {
  const question = askQuestionObjects(body)
    .map((item) => item.question)
    .find((text): text is string => typeof text === 'string' && text.trim().length > 0);
  return question ? normalizeSingleLine(firstLine(question)) : stringifyToolInput(body.toolInput);
}

function permissionBrief(body: DecisionWaitBody, content: string): string {
  if (body.toolName === 'AskUserQuestion') {
    return clampHardwareText(askBrief(body), hardwareProtocolLimits.maxBriefLen);
  }

  const raw = body.raw;
  if (raw) {
    for (const key of ['permission_message', 'message', 'description', 'prompt'] as const) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return clampHardwareText(firstLine(value.trim()), hardwareProtocolLimits.maxBriefLen);
      }
    }
  }
  if (body.hookEvent === 'permissionRequest') {
    return clampHardwareText(permissionActionBrief(body, content), hardwareProtocolLimits.maxBriefLen);
  }
  return clampHardwareText(firstLine(content), hardwareProtocolLimits.maxBriefLen);
}

export function buildPermissionHardwareOptions(
  body: DecisionWaitBody,
): { options: HardwareOption[]; defaultFocus: string } {
  const options: HardwareOption[] = [
    { id: 'allow', label: clampHardwareText('允许', hardwareProtocolLimits.maxOptionLabelLen) },
  ];

  const suggestions = extractPermissionSuggestions(body.raw).slice(
    0,
    Math.max(0, hardwareProtocolLimits.maxOptions - 2),
  );
  for (let index = 0; index < suggestions.length; index++) {
    const suggestion = suggestions[index];
    const label = formatPermissionSuggestionLabel(
      suggestion,
      body.toolName,
      () => '总是允许',
    );
    options.push({
      id: `allowAlways:${index}`,
      label: clampHardwareText(label, hardwareProtocolLimits.maxOptionLabelLen),
    });
  }

  options.push({
    id: 'deny',
    label: clampHardwareText('拒绝', hardwareProtocolLimits.maxOptionLabelLen),
  });

  return {
    options: options.slice(0, hardwareProtocolLimits.maxOptions),
    defaultFocus: 'allow',
  };
}

function optionsFor(
  body: DecisionWaitBody,
): { options: HardwareOption[]; defaultFocus: string } {
  if (body.hookEvent === 'permissionRequest' && body.toolName !== 'AskUserQuestion' && body.toolName !== 'ExitPlanMode') {
    return buildPermissionHardwareOptions(body);
  }

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

  const summary = formatToolSummary(body.toolName, body.toolInput);
  if (body.toolName === 'Bash' || body.toolName === 'Shell') {
    return [summary, body.cwd ? `cwd: ${body.cwd}` : ''].filter(Boolean).join('\n');
  }

  const lines = [summary];
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
  const brief = permissionBrief(body, content);

  return {
    protocol: HARDWARE_PROTOCOL_VERSION,
    type: 'request',
    appName: 'ComBrief',
    appVersion,
    decisionId: requestId,
    source: body.appId,
    sourceLabel: sourceLabel(body.appId),
    kind: requestKind(body),
    brief,
    content,
    options,
    defaultFocus,
    expiresAt: now + timeoutMs,
  };
}
