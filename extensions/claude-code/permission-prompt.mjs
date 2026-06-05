import readline from 'node:readline';
import { buildHookStdout } from './build-hook-stdout.mjs';

const MESSAGES = {
  en: {
    prompt: 'ComBrief — approval needed',
    allowOnce: 'Yes (this time only)',
    deny: 'No',
    allowAlways: (d) => `Yes, always allow: ${d}`,
    invalid: 'Invalid choice',
  },
  zh: {
    prompt: 'ComBrief — 需要你确认',
    allowOnce: '是（仅本次）',
    deny: '否',
    allowAlways: (d) => `是，始终允许：${d}`,
    invalid: '无效选项',
  },
  ja: {
    prompt: 'ComBrief — 承認が必要です',
    allowOnce: 'はい（今回のみ）',
    deny: 'いいえ',
    allowAlways: (d) => `はい、常に許可: ${d}`,
    invalid: '無効な選択',
  },
};

function strings(locale) {
  return MESSAGES[locale === 'zh' || locale === 'ja' ? locale : 'en'];
}

function extractSuggestions(raw) {
  const arr = raw?.permission_suggestions ?? raw?.permissionSuggestions;
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => x && typeof x === 'object');
}

function suggestionDetail(entry, toolName) {
  const type = String(entry.type ?? '');
  if (type === 'addRules' && Array.isArray(entry.rules)) {
    const rule = entry.rules[0];
    if (rule?.ruleContent) {
      return `${rule.toolName ?? toolName}: ${rule.ruleContent}`;
    }
    if (rule?.toolName) return rule.toolName;
  }
  if (type === 'addDirectories' && Array.isArray(entry.directories)) {
    return String(entry.directories[0] ?? toolName);
  }
  if (type === 'setMode' && entry.mode) return String(entry.mode);
  return toolName;
}

function buildChoices(input, locale) {
  const m = strings(locale);
  const toolName = input.tool_name ?? input.toolName ?? 'unknown';
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const hookEvent =
    input.hook_event_name === 'PermissionRequest'
      ? 'permissionRequest'
      : 'preToolUse';

  if (hookEvent === 'permissionRequest') {
    const choices = [
      {
        label: m.allowOnce,
        action: { kind: 'allowOnce' },
      },
    ];
    const suggestions = extractSuggestions(input).slice(0, 3);
    for (const s of suggestions) {
      const detail = suggestionDetail(s, toolName);
      choices.push({
        label: m.allowAlways(detail),
        action: { kind: 'allowAlways', suggestion: s },
        detail,
      });
    }
    choices.push({
      label: m.deny,
      action: { kind: 'deny', reason: 'Denied in terminal' },
    });
    return { hookEvent, toolName, toolInput, choices, m };
  }

  if (toolName === 'ExitPlanMode') {
    return {
      hookEvent,
      toolName,
      toolInput,
      choices: [
        { label: m.allowOnce, action: { kind: 'allow' } },
        { label: m.deny, action: { kind: 'deny', reason: 'Denied in terminal' } },
      ],
      m,
    };
  }

  if (toolName === 'AskUserQuestion') {
    const questions = toolInput.questions;
    const choices = [];
    if (Array.isArray(questions)) {
      for (const q of questions) {
        for (const opt of q?.options ?? []) {
          if (opt?.label) {
            choices.push({
              label: opt.label,
              action: { kind: 'option', optionLabel: opt.label },
            });
          }
        }
      }
    }
    return { hookEvent, toolName, toolInput, choices, m };
  }

  return null;
}

function canPromptLocally() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * 在 hook 子进程内显示与 Slack 并行的终端菜单（CC 原生弹窗在 hook 阻塞时通常不会出现）。
 */
export function promptLocalDecision(input, locale = 'en') {
  if (!canPromptLocally()) {
    return Promise.resolve(null);
  }

  const built = buildChoices(input, locale);
  if (!built || built.choices.length === 0) {
    return Promise.resolve(null);
  }

  const { hookEvent, toolName, toolInput, choices, m } = built;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const lines = [
      '',
      m.prompt,
      `Tool: ${toolName}`,
      ...choices.map((c, i) => `  ${i + 1}. ${c.label}`),
      '',
    ];
    process.stdout.write(lines.join('\n'));

    const ask = () => {
      rl.question(`> `, (answer) => {
        const n = Number.parseInt(answer.trim(), 10);
        if (!Number.isFinite(n) || n < 1 || n > choices.length) {
          process.stdout.write(`${m.invalid}\n`);
          ask();
          return;
        }
        const picked = choices[n - 1];
        rl.close();
        const stdout = buildHookStdout({
          hookEvent,
          toolName,
          toolInput,
          action: picked.action,
        });
        resolve({
          stdout,
          resolution: {
            kind:
              picked.action.kind === 'deny'
                ? 'deny'
                : picked.action.kind === 'allowAlways'
                  ? 'allowAlways'
                  : 'allow',
            detail: picked.detail,
          },
        });
      });
    };

    ask();
  });
}
