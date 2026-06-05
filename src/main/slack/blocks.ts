export type DecisionCardMode = 'permission' | 'askUser' | 'exitPlan';

export interface PermissionButtonSpec {
  label: string;
  action: 'allowOnce' | 'allowAlways' | 'deny';
  suggestionIndex?: number;
  style?: 'primary' | 'danger';
}

export interface DecisionBlockInput {
  requestId: string;
  title: string;
  toolName: string;
  cwdLabel: string;
  sessionLabel: string;
  summary: string;
  mode: DecisionCardMode;
  options?: { label: string }[];
  permissionButtons?: PermissionButtonSpec[];
  /** 顶部 context 行：请求/处理时间 */
  timeFooter?: string;
}

function withCardChrome(blocks: unknown[], timeFooter?: string): unknown[] {
  const chrome: unknown[] = [{ type: 'divider' }];
  if (timeFooter) {
    chrome.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: timeFooter }],
    });
  }
  return [...chrome, ...blocks];
}

const ACTION_PREFIX = 'combrief_decision';

export function buildDecisionBlocks(input: DecisionBlockInput): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: input.title, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Tool:*\n\`${input.toolName}\`` },
        { type: 'mrkdwn', text: `*Session:*\n\`${input.sessionLabel}\`` },
        { type: 'mrkdwn', text: `*Project:*\n\`${input.cwdLabel}\`` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: input.summary.slice(0, 2900),
      },
    },
  ];

  const actions: unknown[] = [];

  if (input.mode === 'askUser' && input.options?.length) {
    for (let i = 0; i < input.options.length; i++) {
      const label = input.options[i].label;
      actions.push({
        type: 'button',
        action_id: `${ACTION_PREFIX}_option_${i}`,
        text: { type: 'plain_text', text: label.slice(0, 75) },
        value: JSON.stringify({
          requestId: input.requestId,
          action: 'option',
          optionLabel: label,
        }),
      });
    }
  } else if (input.mode === 'exitPlan') {
    actions.push(
      decisionButton(input.requestId, 'allow', '批准计划', 'primary'),
      decisionButton(input.requestId, 'deny', '拒绝', 'danger'),
    );
  } else if (input.permissionButtons?.length) {
    for (const spec of input.permissionButtons) {
      actions.push(
        decisionButton(
          input.requestId,
          spec.action,
          spec.label,
          spec.style,
          spec.suggestionIndex,
        ),
      );
    }
  } else {
    actions.push(
      decisionButton(input.requestId, 'allowOnce', '允许', 'primary'),
      decisionButton(input.requestId, 'deny', '拒绝', 'danger'),
    );
  }

  blocks.push({ type: 'actions', elements: actions });
  return withCardChrome(blocks, input.timeFooter);
}

/** 决策完成后替换按钮为状态行（移除 actions block） */
export function buildResolvedDecisionBlocks(
  input: DecisionBlockInput,
  statusText: string,
): unknown[] {
  const blocks = buildDecisionBlocks(input).filter(
    (b) =>
      !(
        b &&
        typeof b === 'object' &&
        (b as { type: string }).type === 'actions'
      ),
  );
  return [
    ...blocks,
    {
      type: 'section',
      text: { type: 'mrkdwn', text: statusText },
    },
  ];
}

export function buildTestBlocks(text: string, timeFooter: string): unknown[] {
  return withCardChrome(
    [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ ${text}` },
      },
    ],
    timeFooter,
  );
}

function decisionButton(
  requestId: string,
  action: string,
  label: string,
  style?: 'primary' | 'danger',
  suggestionIndex?: number,
): unknown {
  const value: Record<string, unknown> = { requestId, action };
  if (suggestionIndex !== undefined) {
    value.suggestionIndex = suggestionIndex;
  }
  const btn: Record<string, unknown> = {
    type: 'button',
    action_id: `${ACTION_PREFIX}_${action}_${suggestionIndex ?? 0}`,
    text: { type: 'plain_text', text: label.slice(0, 75) },
    value: JSON.stringify(value),
  };
  if (style) {
    btn.style = style;
  }
  return btn;
}

export function parseBlockActionValue(
  raw: string,
): {
  requestId: string;
  action: string;
  optionLabel?: string;
  suggestionIndex?: number;
} | null {
  try {
    const v = JSON.parse(raw) as {
      requestId?: string;
      action?: string;
      optionLabel?: string;
      suggestionIndex?: number;
    };
    if (typeof v.requestId === 'string' && typeof v.action === 'string') {
      return {
        requestId: v.requestId,
        action: v.action,
        optionLabel: v.optionLabel,
        suggestionIndex:
          typeof v.suggestionIndex === 'number' ? v.suggestionIndex : undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
