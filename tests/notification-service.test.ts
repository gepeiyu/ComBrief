import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../src/main/notification-service';

describe('NotificationService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows first waiting_user notification', () => {
    const svc = new NotificationService(30_000);
    expect(svc.shouldNotify('cursor', 'waiting_user', 'idle')).toBe(true);
  });

  it('blocks duplicate within debounce window', () => {
    const svc = new NotificationService(30_000);
    svc.markNotified('cursor');
    expect(svc.shouldNotify('cursor', 'waiting_user', 'waiting_user')).toBe(
      false,
    );
    vi.advanceTimersByTime(29_000);
    expect(svc.shouldNotify('cursor', 'waiting_user', 'waiting_user')).toBe(
      false,
    );
    vi.advanceTimersByTime(2_000);
    expect(svc.shouldNotify('cursor', 'waiting_user', 'waiting_user')).toBe(
      true,
    );
  });

  it('re-notifies after leaving red and returning', () => {
    const svc = new NotificationService(30_000);
    svc.markNotified('cursor');
    expect(svc.shouldNotify('cursor', 'waiting_user', 'working')).toBe(true);
  });
});
