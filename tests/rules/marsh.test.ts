// The Sleepy Marsh rules (marsh.ts).

import { describe, expect, it } from 'vitest';
import type { BossType, Content } from '../../src/rules/content';
import { takeDamage } from '../../src/rules/damage';
import { hitObstacle } from '../../src/rules/obstacles';
import { clearFog, floodedRows, loomDisadvantage } from '../../src/rules/marsh';
import { hasLineOfSight } from '../../src/rules/los';
import { inRangeWithSight } from '../../src/rules/effects/support';
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

describe('risingWater', () => {
  const RISING = { from: 3, every: 2, rows: [[[1, 0], [1, 1]], [[2, 0]]] as [number, number][][] };

  it('counts the flooded rows', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map((r) => floodedRows(RISING, r))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('round 3 floods the first row, round 5 deepens it and floods the next', () => {
    const c = makeContent({
      secondRoom: false,
      monsters: [monsterType('rat', 'tidle')],
      decks: [{ id: 'tidle', cards: [{ id: 'i.99', initiative: 99, steps: [] }] }],
      spawns: [{ monster: 'rat', hex: [6, 4] }],
      scenario: { specials: ['risingWater'], rising: RISING },
    });
    let s = newGame(c);
    const terrain = (h: string) => s.board.tiles[h]?.terrain;
    const pick = (n: number) => ({ alpha: [`alpha.c${2 * n - 1}`, `alpha.c${2 * n}`] as [string, string], beta: [`beta.c${2 * n - 1}`, `beta.c${2 * n}`] as [string, string] });
    for (let r = 1; r <= 2; r++) s = finishRound(selectAll(s, c, pick(r)), c);
    expect(s.round).toBe(3);
    expect([terrain('1,0'), terrain('1,1'), terrain('2,0')]).toEqual(['water', 'water', 'normal']);
    for (let r = 3; r <= 4; r++) s = finishRound(selectAll(s, c, pick(r)), c);
    expect([terrain('1,0'), terrain('1,1'), terrain('2,0')]).toEqual(['deep', 'deep', 'water']);
  });
});

describe('fogBanks', () => {
  function fogGame(): { c: Content; s: GameState } {
    const c = makeContent({
      secondRoom: false,
      monsters: [monsterType('rat', 'tidle')],
      decks: [{ id: 'tidle', cards: [{ id: 'i.99', initiative: 99, steps: [] }] }],
      spawns: [{ monster: 'rat', hex: [6, 4] }],
      room: { terrain: [{ hex: [2, 2], terrain: 'fog' }] },
      scenario: { specials: ['fogBanks'] },
    });
    return { c, s: newGame(c) };
  }

  it('no sight through, into or out of fog; a neighbour still sees', () => {
    const { c, s } = fogGame();
    const ctx = { s, c, ev: [], out: [] };
    expect(hasLineOfSight(s, [1, 2], [3, 2])).toBe(false); // through
    expect(hasLineOfSight(s, [0, 2], [2, 2])).toBe(false); // into
    expect(hasLineOfSight(s, [2, 2], [4, 2])).toBe(false); // out of
    expect(hasLineOfSight(s, [0, 0], [4, 0])).toBe(true); // past it
    expect(inRangeWithSight(ctx, [1, 2], [2, 2], 3)).toBe(true); // a neighbour
    expect(inRangeWithSight(ctx, [0, 2], [2, 2], 3)).toBe(false);
  });

  it('Fire or Air made next to the fog clears it through the next round', () => {
    const { c, s } = fogGame();
    const ctx = { s, c, ev: [], out: [] };
    s.figures['hero:alpha']!.hex = [1, 2];
    clearFog(ctx, 'hero:alpha');
    expect(s.board.tiles['2,2']?.fogClearedUntil).toBe(2);
    expect(hasLineOfSight(s, [1, 2], [3, 2])).toBe(true);
    s.round = 3;
    expect(hasLineOfSight(s, [1, 2], [3, 2])).toBe(false);
  });
});

describe('fireflyPond', () => {
  function pondGame(specials = ['fireflyPond']): { c: Content; s: GameState } {
    const c = makeContent({
      secondRoom: false,
      monsters: [monsterType('rat', 'trat', { normal: { hp: 9, move: 3, attack: 2 } })],
      decks: [{ id: 'trat', cards: [{ id: 'r.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }] }],
      spawns: [{ monster: 'rat', hex: [2, 2] }],
      goal: { type: 'defend', zone: 'pond', rounds: 7, counter: 8 },
      scenario: { specials, zones: [{ id: 'pond', hexes: [[5, 2], [5, 3], [6, 2]] }], secondary: [{ id: 'lights', check: 'counterKept', reward: { xp: 3 } }] },
    });
    const s = newGame(c);
    s.figures['hero:alpha']!.hex = [1, 2];
    return { c, s };
  }
  const pick = { alpha: ['alpha.c1', 'alpha.c2'] as [string, string], beta: ['beta.c1', 'beta.c2'] as [string, string] };

  it('a monster outside the pond heads for it instead of fighting, and puts out a light there', () => {
    const { c, s: s0 } = pondGame();
    const s = finishRound(selectAll(s0, c, pick), c);
    expect(s.figures['monster:rat:1']!.hex[0]).toBeGreaterThanOrEqual(5);
    expect(s.figures['hero:alpha']!.hp).toBe(s.figures['hero:alpha']!.maxHp);
    expect(s.goalCounter).toBe(7);
    expect(secondaryMet(s, { id: 'lights', check: 'counterKept', reward: { xp: 3 } })).toBe(false);
  });

  it('without the special the monster fights the hero next to it', () => {
    const { c, s: s0 } = pondGame([]);
    const s = finishRound(selectAll(s0, c, pick), c);
    expect(s.figures['hero:alpha']!.hp).toBeLessThan(s.figures['hero:alpha']!.maxHp);
    expect(s.goalCounter).toBeUndefined();
  });
});
