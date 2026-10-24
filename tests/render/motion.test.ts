import { describe, expect, it } from 'vitest';
import { flyPose, JUMP_CROUCH, JUMP_LAND, jumpHeight, jumpPose, leanAngles, slidePose } from '../../src/render/motion';

describe('jump', () => {
  it('crouches in place, arcs over the middle, lands with a squash and ends standing', () => {
    const h = jumpHeight(2);
    const crouch = jumpPose(JUMP_CROUCH * 0.7, h);
    expect(crouch.travel).toBe(0);
    expect(crouch.y).toBe(0);
    expect(crouch.squash).toBeLessThan(0.9);
    const apexK = JUMP_CROUCH + (1 - JUMP_CROUCH - JUMP_LAND) / 2;
    const apex = jumpPose(apexK, h);
    expect(apex.travel).toBeCloseTo(0.5);
    expect(apex.y).toBeCloseTo(h);
    const land = jumpPose(1 - JUMP_LAND * 0.6, h);
    expect(land.travel).toBe(1);
    expect(land.y).toBe(0);
    expect(land.squash).toBeLessThan(0.9);
    const end = jumpPose(1, h);
    expect(end).toMatchObject({ travel: 1, y: 0 });
    expect(end.squash).toBeCloseTo(1, 2);
    expect(end.lean).toBeCloseTo(0);
  });

  it('goes higher for longer jumps and always clears what is in the way', () => {
    expect(jumpHeight(3)).toBeGreaterThan(jumpHeight(1));
    expect(jumpHeight(1, 1.0)).toBeGreaterThan(1.0);
    expect(jumpHeight(6)).toBeLessThanOrEqual(1.1);
  });

  it('moves monotonically forward', () => {
    let last = -1;
    for (let k = 0; k <= 1; k += 0.02) {
      const p = jumpPose(k, 1);
      expect(p.travel).toBeGreaterThanOrEqual(last);
      last = p.travel;
    }
  });
});

describe('flight and push', () => {
  it('a flight rises, glides and settles at the end', () => {
    expect(flyPose(0, 1).y).toBe(0);
    expect(flyPose(0.5, 1).y).toBeCloseTo(1);
    expect(flyPose(1, 1)).toMatchObject({ travel: 1, y: 0 });
  });

  it('a push travels fast at first, stumbles, and stops upright on the last hex', () => {
    expect(slidePose(0.3, 2).travel).toBeGreaterThan(0.5);
    const end = slidePose(1, 2);
    expect(end.travel).toBe(1);
    expect(end.y).toBeCloseTo(0);
    expect(end.lean).toBeCloseTo(0);
    expect(Math.max(...[0.1, 0.2, 0.3].map((k) => slidePose(k, 2).lean))).toBeGreaterThan(0.1);
  });

  it('leans in the direction of travel in the figure frame', () => {
    // Facing +Z, moving +Z: pure pitch forward; moving +X: a roll toward +X (−z rotation).
    expect(leanAngles(0.2, 0, 0, 1).pitch).toBeCloseTo(0.2);
    expect(leanAngles(0.2, 0, 1, 0).roll).toBeCloseTo(-0.2);
    expect(leanAngles(0.2, Math.PI, 0, 1).pitch).toBeCloseTo(-0.2);
  });
});
