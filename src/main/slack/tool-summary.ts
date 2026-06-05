export function formatToolSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  if (toolName === 'Bash') {
    const cmd = toolInput.command ?? toolInput.cmd;
    if (typeof cmd === 'string') {
      return truncate(cmd, 500);
    }
  }
  if (toolName === 'ExitPlanMode') {
    const plan = toolInput.plan;
    if (typeof plan === 'string') {
      return truncate(plan, 800) + (plan.length > 800 ? '…' : '');
    }
  }
  if (toolName === 'AskUserQuestion') {
    const questions = toolInput.questions;
    if (Array.isArray(questions)) {
      return questions
        .map((q, i) => {
          const text =
            q && typeof q === 'object' && 'question' in q
              ? String((q as { question: unknown }).question)
              : `Question ${i + 1}`;
          return `• ${text}`;
        })
        .join('\n');
    }
  }
  try {
    return truncate(JSON.stringify(toolInput), 400);
  } catch {
    return '(unable to serialize tool input)';
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}
