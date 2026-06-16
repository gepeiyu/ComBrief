import { describe, expect, it, vi } from 'vitest';
import { HardwareStatePusher } from '../src/main/hardware/state-pusher';

describe('HardwareStatePusher', () => {
  it('coalesces overlapping state pushes and sends only one latest follow-up', async () => {
    let finishFirst: (() => void) | null = null;
    const sendSnapshot = vi.fn(() => {
      if (sendSnapshot.mock.calls.length === 1) {
        return new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    const onError = vi.fn();
    const pusher = new HardwareStatePusher(sendSnapshot, onError);

    pusher.request();
    pusher.request();
    pusher.request();
    await Promise.resolve();

    expect(sendSnapshot).toHaveBeenCalledTimes(1);

    finishFirst?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendSnapshot).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('continues after a failed send when a newer state is queued', async () => {
    const error = new Error('temporary BLE write failure');
    let rejectFirst: ((error: Error) => void) | null = null;
    const sendSnapshot = vi.fn(() => {
      if (sendSnapshot.mock.calls.length === 1) {
        return new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Promise.resolve();
    });
    const onError = vi.fn();
    const pusher = new HardwareStatePusher(sendSnapshot, onError);

    pusher.request();
    pusher.request();
    await Promise.resolve();

    rejectFirst?.(error);
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(error);
    expect(sendSnapshot).toHaveBeenCalledTimes(2);
  });
});
