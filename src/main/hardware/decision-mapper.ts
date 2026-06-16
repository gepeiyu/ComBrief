import type { PendingDecision } from '../decision/types';
import type { DecisionAction } from '../slack/hook-stdout';
import { extractPermissionSuggestions } from '../slack/permission-suggestions';
import type { HardwareDecisionMessage } from './protocol';
import { extractHardwareAskOptions } from './request-builder';

const remoteDenyReason = 'Denied via ComBrief Remote';

export function mapHardwareDecisionToAction(
  decision: HardwareDecisionMessage,
  pending: PendingDecision,
): DecisionAction | null {
  if (pending.body.toolName === 'AskUserQuestion') {
    const match = /^option:(\d+)$/.exec(decision.optionId);
    if (!match) {
      return null;
    }

    const optionIndex = Number(match[1]);
    const options = extractHardwareAskOptions(pending.body);
    const optionLabel = options[optionIndex]?.optionLabel;
    if (!optionLabel) {
      return null;
    }

    return { kind: 'option', optionLabel };
  }

  if (decision.optionId === 'allow') {
    return { kind: 'allowOnce' };
  }

  const allowAlwaysMatch = /^allowAlways:(\d+)$/.exec(decision.optionId);
  if (allowAlwaysMatch) {
    const suggestions = extractPermissionSuggestions(pending.body.raw);
    const suggestion = suggestions[Number(allowAlwaysMatch[1])];
    if (suggestion) {
      return { kind: 'allowAlways', suggestion };
    }
    return null;
  }

  if (decision.optionId === 'deny') {
    if (pending.body.toolName === 'ExitPlanMode') {
      return { kind: 'deny', reason: remoteDenyReason };
    }
    return { kind: 'deny' };
  }

  return null;
}
