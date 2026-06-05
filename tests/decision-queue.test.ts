import { describe, it, expect, vi } from 'vitest';
import { DecisionQueue } from '../src/main/decision-queue';

describe('DecisionQueue', () => {
  it('resolves wait with hookStdout', async () => {
    const q = new DecisionQueue();
    const wait = q.wait('r1', 5000);
    q.resolve('r1', { hookStdout: '{"ok":true}' });
    await expect(wait).resolves.toEqual({ hookStdout: '{"ok":true}' });
  });

  it('times out with null hookStdout', async () => {
    vi.useFakeTimers();
    const q = new DecisionQueue();
    const wait = q.wait('r1', 1000);
    vi.advanceTimersByTime(1001);
    await expect(wait).resolves.toEqual({ hookStdout: null });
    vi.useRealTimers();
  });
});
