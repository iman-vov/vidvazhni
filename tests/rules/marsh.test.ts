// The Sleepy Marsh rules (marsh.ts).

import { describe, expect, it } from 'vitest';
import type { BossType, Content } from '../../src/rules/content';
import { takeDamage } from '../../src/rules/damage';
import { hitObstacle } from '../../src/rules/obstacles';
import { loomDisadvantage } from '../../src/rules/marsh';
import { secondaryMet } from '../../src/rules/objectives';
import type { GameState } from '../../src/rules/state';
import { act, finishRound, makeContent, monsterType, newGame, playHalf, selectAll } from '../helpers/engineFixtures';
import { apply } from '../../src/rules/engine';

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

describe('deepWater', () => {
  function deepGame(): { c: Content; s: GameState } {
    const c = makeContent({
      secondRoom: false,
      monsters: [monsterType('rat', 'tidle')],
      decks: [{ id: 'tidle', cards: [{ id: 'i.99', initiative: 99, steps: [] }] }],
      spawns: [{ monster: 'rat', hex: [6, 4] }],
      room: { terrain: [{ hex: [1, 2], terrain: 'deep' }] },
      scenario: { specials: ['deepWater'] },
    });
    const s = newGame(c);
    s.figures['hero:alpha']!.hex = [0, 2];
    return { c, s };
  }
  const moveTry = (c: Content, s: GameState, path: [number, number][]) => {
    const st = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: s.round === 1 ? 'alpha.c1' : 'alpha.c3', half: 'bottom' });
    return apply(st, { type: 'resolveStep', choice: { path } }, c);
  };

  it('a walker stops in deep water and moves 1 less on its next turn', () => {
    const { c, s: s0 } = deepGame();
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c9', 'beta.c10'] });
    expect(moveTry(c, s, [[1, 2], [2, 2]]).ok).toBe(false);
    s = playHalf(s, c, 'alpha', 'alpha.c1', 'bottom', [{ path: [[1, 2]] }]);
    expect(s.figures['hero:alpha']!.hex).toEqual([1, 2]);
    s = finishRound(s, c);
    s = selectAll(s, c, { alpha: ['alpha.c3', 'alpha.c4'], beta: ['beta.c7', 'beta.c8'] });
    // Move 2 out of the water is now move 1.
    expect(moveTry(c, s, [[2, 2], [3, 2]]).ok).toBe(false);
    expect(moveTry(c, s, [[2, 2]]).ok).toBe(true);
  });
});
