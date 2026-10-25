import { describe, expect, it } from 'vitest';
import { hexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { environmentFor } from '../../src/render/environment/data';
import { bakeField } from '../../src/render/environment/field';
import { buildLayout } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';
import { isMarsh, planMarsh } from '../../src/render/environment/marsh';
import { worldToHex } from '../../src/render/hexLayout';

const content = loadContent();

function marsh(detail: 'off' | 'few' | 'many', quality: 'low' | 'high' = 'high') {
  const scenario = content.scenarios.s3!;
  const def = environmentFor('s3')!;
  const layout = buildLayout(scenario);
  const field = bakeField(layout, def, 120);
  const placements = planEnvironment(layout, def, quality);
  return { def, layout, placements, plan: planMarsh({ layout, def, field, quality, placements, detail }) };
}

describe('marsh growth', () => {
  it('grows by the flooded mill only', () => {
    expect(isMarsh(environmentFor('s3')!)).toBe(true);
    expect(isMarsh(environmentFor('s1')!)).toBe(false);
    expect(isMarsh(environmentFor('s2')!)).toBe(false);
  });

  it('replaces the old reed and lily pieces with clumps, and keeps everything else', () => {
    const { placements, plan } = marsh('many');
    const old = placements.filter((p) => ['reeds', 'reeds-bank', 'reeds-low', 'lilies'].includes(p.piece));
    expect(old.length).toBeGreaterThan(0);
    expect(plan.placements.length).toBe(placements.length - old.length);
    const kinds = new Set(plan.spots.map((s) => s.kind));
    for (const k of ['reeds', 'lily', 'bank']) expect(kinds.has(k as never), k).toBe(true);
    // Stands, not single sticks: several clumps per old piece.
    expect(plan.spots.filter((s) => s.kind === 'reeds' || s.kind === 'reeds-low').length).toBeGreaterThan(old.length * 2);
  });

  it('never grows on a playable hex', () => {
    const { layout, plan } = marsh('many');
    for (const s of plan.spots) expect(layout.footprint.has(hexKey(worldToHex(s.x, s.z))), `${s.kind} ${s.x},${s.z}`).toBe(false);
  });

  it('follows the floor-detail setting and is seeded', () => {
    const many = marsh('many').plan.spots.length;
    const few = marsh('few').plan.spots.length;
    const off = marsh('off').plan.spots.length;
    expect(many).toBeGreaterThan(few);
    expect(few).toBeGreaterThan(off);
    expect(off).toBeGreaterThan(0);
    expect(marsh('many').plan.spots).toEqual(marsh('many').plan.spots);
  });
});
