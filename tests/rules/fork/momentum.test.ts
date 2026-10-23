import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard, Step } from '../../../src/rules/content';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  finishRound,
  heroOf,
  makeContent,
  playHalf,
  rejects,
  selectAll,
  stackModifiers,
} from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const marked = (id: string, ini: number, top: Step[] = [{ type: 'attack', value: 2 }]): HeroCard =>
  card(id, ini, top, [{ type: 'move', value: 2 }], { fork: { momentum: true } });

const CARDS: HeroCard[] = [
  marked('m.mark1', 10),
  marked('m.mark2', 20),
  marked('m.mark3', 30),
  marked('m.mark4', 40),
  card('m.plain', 50, [{ type: 'attack', value: 2 }], [{ type: 'move', value: 2 }]),
  marked('m.shot', 60, [{ type: 'attack', value: 2, range: 2 }]),
  ...fillerCards('m', 4),
];

const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const RAT = 'monster:rat:1';

function game(momentum = true, ratHex: [number, number] = [1, 2]) {
  const c = makeContent({
    heroes: { alpha: CARDS },
    heroExtra: {
      alpha: { surge: [{ type: 'shield', value: 2, target: 'self', duration: 'round' }, { type: 'attack', value: 3 }] },
    },
    decks: [{ id: 'tmelee', cards: IDLE }],
    spawns: [{ monster: 'rat', hex: ratHex, rank: 'elite' }],
  });
  const s = forkGame(c, { momentum }, ['alpha']);
  stackModifiers(s, 'alpha', Array<string>(10).fill('+0'));
  return { c, s };
}

describe('fork «Наснага», single scale (momentum)', () => {
  it('a half of a lightning-marked card adds a charge; the basic action and unmarked cards do not; at most 3', () => {
    const { c, s: s0 } = game();
    let s = selectAll(s0, c, { alpha: ['m.mark1', 'm.mark2'] });
    s = playHalf(s, c, 'alpha', 'm.mark1', 'top', [{ targets: [RAT] }]);
    s = playHalf(s, c, 'alpha', 'm.mark2', 'bottom', [null]);
    expect(heroOf(s, 'alpha').momentum).toBe(2);
    expect(eventsOf(s.log, 'momentumGained')).toEqual([
      { type: 'momentumGained', heroId: 'hero:alpha', charges: 1 },
      { type: 'momentumGained', heroId: 'hero:alpha', charges: 2 },
    ]);
    s = finishRound(endTurn(s, c, 'alpha'), c);
    s = selectAll(s, c, { alpha: ['m.mark3', 'm.plain'] });
    s = playHalf(s, c, 'alpha', 'm.mark3', 'top', [{ targets: [RAT] }], true);
    s = playHalf(s, c, 'alpha', 'm.plain', 'bottom', [null]);
    expect(heroOf(s, 'alpha').momentum).toBe(2);
    s = finishRound(endTurn(s, c, 'alpha'), c);
    s = selectAll(s, c, { alpha: ['m.mark4', 'm.shot'] });
    s = playHalf(s, c, 'alpha', 'm.mark4', 'top', [{ targets: [RAT] }]);
    s = playHalf(s, c, 'alpha', 'm.shot', 'bottom', [null]);
    expect(heroOf(s, 'alpha').momentum).toBe(3);
    expect(eventsOf(s.log, 'momentumGained')).toHaveLength(3);
  });

  it('off: no charges and no Порив', () => {
    const { c, s: s0 } = game(false);
    let s = selectAll(s0, c, { alpha: ['m.mark1', 'm.mark2'] });
    s = playHalf(s, c, 'alpha', 'm.mark1', 'top', [{ targets: [RAT] }]);
    expect(heroOf(s, 'alpha').momentum).toBe(0);
    heroOf(s, 'alpha').momentum = 3;
    expect(rejects(s, c, { type: 'surge', heroId: 'hero:alpha' })).toBe('variant «Наснага» is off');
  });

  it('Порив between halves: its steps are a half of their own, the scale goes back to 0, no card moves', () => {
    const { c, s: s0 } = game();
    expect(rejects(s0, c, { type: 'surge', heroId: 'hero:alpha' })).toBe('Порив is used on your own turn');
    let s = selectAll(s0, c, { alpha: ['m.plain', 'm.c1'] });
    expect(rejects(s, c, { type: 'surge', heroId: 'hero:alpha' })).toBe('Порив needs 3 charges');
    heroOf(s, 'alpha').momentum = 3;
    s = act(s, c, { type: 'surge', heroId: 'hero:alpha' });
    expect(s.pending).toMatchObject({ kind: 'stepChoice', step: { type: 'shield', value: 2 } });
    s = act(s, c, { type: 'resolveStep', choice: {} });
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
    const h = heroOf(s, 'alpha');
    expect(h.momentum).toBe(0);
    expect(h.shields).toEqual([{ value: 2, source: 'round', until: 'round' }]);
    expect(h.discard).toEqual([]);
    expect(eventsOf(s.log, 'surgeUsed')).toEqual([{ type: 'surgeUsed', heroId: 'hero:alpha' }]);
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 3 });
    // Both halves can still be played.
    s = playHalf(s, c, 'alpha', 'm.plain', 'top', [{ targets: [RAT] }]);
    s = playHalf(s, c, 'alpha', 'm.c1', 'bottom', [null]);
    expect(heroOf(s, 'alpha').discard.sort()).toEqual(['m.c1', 'm.plain']);
  });

  it('Порив during a half: its steps come before the pending step', () => {
    const { c, s: s0 } = game();
    let s = selectAll(s0, c, { alpha: ['m.plain', 'm.c1'] });
    heroOf(s, 'alpha').momentum = 3;
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'm.plain', half: 'top' });
    s = act(s, c, { type: 'surge', heroId: 'hero:alpha' });
    expect(s.half).toMatchObject({ cardId: 'm.plain', surgeRange: [0, 2], stepIndex: 0 });
    s = act(s, c, { type: 'resolveStep', choice: {} });
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    expect(eventsOf(s.log, 'attacked').map((e) => e.base)).toEqual([3, 2]);
    expect(heroOf(s, 'alpha').discard).toEqual(['m.plain']);
  });

  it('undo takes the Порив back with its charges', () => {
    const { c, s: s0 } = game();
    let s = selectAll(s0, c, { alpha: ['m.plain', 'm.c1'] });
    heroOf(s, 'alpha').momentum = 3;
    s = act(s, c, { type: 'surge', heroId: 'hero:alpha' });
    s = act(s, c, { type: 'resolveStep', choice: {} });
    s = act(s, c, { type: 'undo' });
    expect(heroOf(s, 'alpha').momentum).toBe(3);
    expect(heroOf(s, 'alpha').shields).toEqual([]);
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
  });

  it('an `active` step of a Порив grants its bonus to the next attack (Лучниця: +1 range)', () => {
    const { c, s: s0 } = game(true, [3, 2]);
    c.heroes.alpha!.surge = [{ type: 'active', uses: 1, on: 'rangedAttack', grant: { range: 1 } }];
    let s = selectAll(s0, c, { alpha: ['m.shot', 'm.c1'] });
    heroOf(s, 'alpha').momentum = 3;
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'm.shot', half: 'top' });
    rejects(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    s = act(s, c, { type: 'surge', heroId: 'hero:alpha' });
    s = act(s, c, { type: 'resolveStep', choice: {} });
    expect(heroOf(s, 'alpha').surgeGrants).toEqual([{ on: 'rangedAttack', usesLeft: 1, grant: { range: 1 } }]);
    s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
    expect(eventsOf(s.log, 'attacked')).toHaveLength(1);
    expect(heroOf(s, 'alpha').surgeGrants).toEqual([]);
  });
});
