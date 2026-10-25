import { afterEach, describe, expect, it } from 'vitest';
import { floorDetail, onFloorDetailChange, setFloorDetail } from '../../src/render/floorDetail';

describe('floor-detail setting', () => {
  afterEach(() => setFloorDetail(null));

  it('follows the quality until the player picks a level', () => {
    expect(floorDetail('low')).toBe('few');
    expect(floorDetail('high')).toBe('many');
    setFloorDetail('off');
    expect(floorDetail('high')).toBe('off');
    setFloorDetail(null);
    expect(floorDetail('high')).toBe('many');
  });

  it('tells listeners about a change', () => {
    let n = 0;
    const stop = onFloorDetailChange(() => n++);
    setFloorDetail('few');
    stop();
    setFloorDetail('many');
    expect(n).toBe(1);
  });
});
