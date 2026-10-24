import { describe, expect, it } from 'vitest';
import { planHighlights, rangeOutline } from '../../src/render/highlightPlan';
import { Animator } from '../../src/render/animator';
import { floatPose } from '../../src/render/boardOverlay';

describe('planHighlights', () => {
  it('is empty for no highlights', () => {
    expect(planHighlights({})).toEqual({ cells: [], targets: [], path: [], range: [], tone: 'enemy' });
  });

  it('non-attack targets: the ally tone, a result preview and the range outline', () => {
    const plan = planHighlights({ targets: ['hero:a'], targetTone: 'ally', preview: { 'hero:a': { text: '5 → 8', icon: 'heal' } }, range: { center: [0, 0], radius: 1 } });
    expect(plan.tone).toBe('ally');
    expect(plan.targets).toEqual([{ figureId: 'hero:a', preview: { text: '5 → 8', icon: 'heal' } }]);
    // Seven hexes: the six outer ones show three outer edges each.
    expect(plan.range).toHaveLength(18);
  });

  it('the range outline follows the board edge', () => {
    expect(rangeOutline([0, 0], 0)).toEqual([]);
    // Only the centre is on the board: its six edges.
    expect(rangeOutline([0, 0], 2, (h) => h[0] === 0 && h[1] === 0)).toHaveLength(6);
  });

  it('one tint per hex: area over path end over path over reachable, costs kept', () => {
    const plan = planHighlights({
      reachable: [
        { hex: [1, 0], cost: 1 },
        { hex: [2, 0], cost: 2 },
        { hex: [3, 0], cost: 3 },
      ],
      path: [
        [1, 0],
        [2, 0],
      ],
      area: [[2, 0]],
    });
    const byHex = Object.fromEntries(plan.cells.map((c) => [`${c.hex[0]},${c.hex[1]}`, c]));
    expect(plan.cells).toHaveLength(3);
    expect(byHex['1,0']).toEqual({ hex: [1, 0], kind: 'path', cost: 1 });
    expect(byHex['2,0']).toEqual({ hex: [2, 0], kind: 'area', cost: 2 });
    expect(byHex['3,0']).toEqual({ hex: [3, 0], kind: 'reach', cost: 3 });
  });

  it('the last path hex is the path end', () => {
    const plan = planHighlights({ path: [[0, 1], [0, 2]] });
    expect(plan.cells.map((c) => c.kind)).toEqual(['path', 'pathEnd']);
    expect(plan.path).toEqual([[0, 1], [0, 2]]);
  });

  it('targets get expected damage; damage alone also marks a figure', () => {
    const plan = planHighlights({ targets: ['monster:a:1', 'monster:a:2'], expectedDamage: { 'monster:a:1': 3, 'monster:b:1': 1 } });
    expect(plan.targets).toEqual([
      { figureId: 'monster:a:1', expectedDamage: 3 },
      { figureId: 'monster:a:2' },
      { figureId: 'monster:b:1', expectedDamage: 1 },
    ]);
  });
});

describe('Animator', () => {
  it('runs tweens by board time with the speed applied', async () => {
    const a = new Animator();
    a.speed = 2;
    const seen: number[] = [];
    let done = false;
    void a.tween(1, (k) => seen.push(k), { ease: (k) => k }).then(() => (done = true));
    a.tick(0.25);
    expect(seen.at(-1)).toBeCloseTo(0.5);
    a.tick(0.25);
    await Promise.resolve();
    expect(done).toBe(true);
    expect(a.busy).toBe(false);
  });

  it('cancelAll ends every tween at k = 1 and resolves waits (skip)', async () => {
    const a = new Animator();
    let last = 0;
    let waited = false;
    void a.tween(5, (k) => (last = k));
    void a.wait(10).then(() => (waited = true));
    const gen = a.generation;
    a.cancelAll();
    await Promise.resolve();
    expect(last).toBe(1);
    expect(waited).toBe(true);
    expect(a.generation).toBe(gen + 1);
  });
});

describe('floatPose', () => {
  it('pops in, rises and fades out', () => {
    const [, s0, o0] = floatPose(0);
    const [, , oMid] = floatPose(0.3);
    const [y1, , o1] = floatPose(1);
    expect(o0).toBe(0);
    expect(s0).toBeLessThan(1);
    expect(oMid).toBe(1);
    expect(o1).toBeCloseTo(0);
    expect(y1).toBeLessThan(-30);
  });
});
