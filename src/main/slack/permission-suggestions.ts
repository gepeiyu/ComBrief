/** Claude Code PermissionRequest `permission_suggestions` 条目 */
export type PermissionUpdateEntry = Record<string, unknown>;

export function extractPermissionSuggestions(
  raw?: Record<string, unknown>,
): PermissionUpdateEntry[] {
  const arr = raw?.permission_suggestions ?? raw?.permissionSuggestions;
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (x): x is PermissionUpdateEntry => !!x && typeof x === 'object',
  );
}

/** 将 suggestion 格式化为 Slack 按钮文案（对齐 CLI 中间项语义） */
export function formatPermissionSuggestionLabel(
  entry: PermissionUpdateEntry,
  toolName: string,
  formatAlways: (detail: string) => string,
): string {
  const type = String(entry.type ?? '');

  if (type === 'addRules' && Array.isArray(entry.rules)) {
    const rules = entry.rules as { toolName?: string; ruleContent?: string }[];
    const rule = rules[0];
    if (rule?.ruleContent) {
      const tn = rule.toolName ?? toolName;
      return formatAlways(`${tn}: ${rule.ruleContent}`);
    }
    if (rule?.toolName) {
      return formatAlways(rule.toolName);
    }
  }

  if (type === 'addDirectories' && Array.isArray(entry.directories)) {
    const dir = entry.directories[0];
    if (typeof dir === 'string') {
      return formatAlways(dir);
    }
  }

  if (type === 'setMode' && entry.mode) {
    return formatAlways(String(entry.mode));
  }

  return formatAlways(toolName);
}
