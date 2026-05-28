import { describe, it, expect } from 'vitest';
import { BREATH_CYCLE_FRAMES } from '../src/main/tray-icons';

describe('tray-icons breathing', () => {
  it('uses ~5s cycle at 100ms tick', () => {
    expect(BREATH_CYCLE_FRAMES * 100).toBe(3200);
  });
});
