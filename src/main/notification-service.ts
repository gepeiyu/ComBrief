import type { LightStatus } from './state-machine';

export class NotificationService {
  private lastNotifiedAt = new Map<string, number>();

  constructor(private debounceMs: number) {}

  shouldNotify(
    appId: string,
    next: LightStatus,
    prev: LightStatus,
  ): boolean {
    if (next !== 'waiting_user') return false;
    if (prev !== 'waiting_user') return true;
    const last = this.lastNotifiedAt.get(appId) ?? 0;
    return Date.now() - last >= this.debounceMs;
  }

  markNotified(appId: string): void {
    this.lastNotifiedAt.set(appId, Date.now());
  }
}
