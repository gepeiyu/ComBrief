export interface DecisionResult {
  hookStdout: string | null;
  source?: 'timeout' | 'local' | 'slack' | 'hardware';
}

export class DecisionQueue {
  private pending = new Map<
    string,
    {
      resolve: (r: DecisionResult) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  wait(requestId: string, timeoutMs: number): Promise<DecisionResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ hookStdout: null });
      }, timeoutMs);
      this.pending.set(requestId, { resolve, timer });
    });
  }

  resolve(requestId: string, result: DecisionResult): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(result);
    return true;
  }

  isWaiting(requestId: string): boolean {
    return this.pending.has(requestId);
  }
}
