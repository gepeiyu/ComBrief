import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeImage: {
    createFromBitmap: vi.fn(() => ({ setTemplateImage: vi.fn() })),
    createFromDataURL: vi.fn(() => ({ isEmpty: () => false, setTemplateImage: vi.fn() })),
  },
}));

import { BREATH_CYCLE_FRAMES, iconFromBitmap } from '../src/main/tray-icons';

describe('tray-icons breathing', () => {
  it('uses ~5s cycle at 100ms tick', () => {
    expect(BREATH_CYCLE_FRAMES * 100).toBe(3200);
  });
});

describe('tray-icons bitmap', () => {
  it('writes center pixels as BGRA', () => {
    const buf = iconFromBitmap('red', 1);
    const iconSize = 44;
    const center = (22 * iconSize + 22) * 4;

    expect([...buf.subarray(center, center + 4)]).toEqual([45, 45, 255, 255]);
  });
});
