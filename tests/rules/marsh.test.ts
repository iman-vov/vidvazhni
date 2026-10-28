// The Sleepy Marsh rules (marsh.ts).

import { describe, expect, it } from 'vitest';
import type { BossType, Content } from '../../src/rules/content';
import { takeDamage } from '../../src/rules/damage';
import { hitObstacle } from '../../src/rules/obstacles';
import { loomDisadvantage } from '../../src/rules/marsh';
import { secondaryMet } from '../../src/rules/objectives';
import type { GameState } from '../../src/rules/state';
import { makeContent, newGame } from '../helpers/engineFixtures';

const QUEEN: BossType = { id: 'queen', hpPerHero: 8, hpPerHeroPerLevel: 0, move: 0, attack: 2, deck: 'tboss', immune: [] };
const QUEEN_ID = 'monster:queen:1';

function loomGame(specials = ['fogLooms']): { c: Content; s: GameState } {
  const base = makeContent({
    secondRoom: false,
    room: { objects: [{ hex: [5, 4], id: 'loom-1', kind: 'loom', hp: 2, blocks: true }] },
    scenario: { specials, secondary: [{ id: 'looms', check: 'loomsBrokenBeforeHalf', reward: { xp: 3 } }] },
  });
  base.scenarios.test!.rooms[0]!.spawns = [{ monster: 'queen', hex: [3, 2], by: { '2': 'normal' } }];
  const c = { ...base, bosses: { queen: QUEEN }, decks: { ...base.decks, tboss: { id: 'tboss', cards: [{ id: 'b.99', initiative: 99, steps: [] }] } } };
  return { c, s: newGame(c) };
}

describe('fogLooms', () => {
  it('while a loom stands, ranged attacks on the boss have disadvantage; melee and other targets do not', () => {
    const { c, s } = loomGame();
    const ctx = { s, c, ev: [], out: [] };
    const queen = s.figures[QUEEN_ID]!;
    expect(loomDisadvantage(ctx, queen, true)).toBe(true);
    expect(loomDisadvantage(ctx, queen, false)).toBe(false);
    expect(loomDisadvantage(ctx, s.figures['hero:beta']!, true)).toBe(false);
    hitObstacle(ctx, 'hero:alpha', [5, 4], 2);
    expect(loomDisadvantage(ctx, queen, true)).toBe(false);
    const off = loomGame([]);
    expect(loomDisadvantage({ s: off.s, c: off.c }, off.s.figures[QUEEN_ID]!, true)).toBe(false);
  });

  it('secondary: every loom broken before the boss falls to half', () => {
    const goal = { id: 'looms', check: 'loomsBrokenBeforeHalf', reward: { xp: 3 } };
    const late = loomGame();
    const ctxL = { s: late.s, c: late.c, ev: [], out: [] };
    expect(secondaryMet(late.s, goal)).toBe(false);
    takeDamage(ctxL, late.s.figures[QUEEN_ID]!, 8, 'test');
    hitObstacle(ctxL, 'hero:alpha', [5, 4], 2);
    expect(secondaryMet(late.s, goal)).toBe(false);

    const early = loomGame();
    const ctxE = { s: early.s, c: early.c, ev: [], out: [] };
    hitObstacle(ctxE, 'hero:alpha', [5, 4], 2);
    takeDamage(ctxE, early.s.figures[QUEEN_ID]!, 8, 'test');
    expect(secondaryMet(early.s, goal)).toBe(true);
  });
});
