import { describe, expect, it } from 'vitest';
import type { HeroCard } from '../../src/rules/content';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  heroOf,
  makeContent,
  newGame,
  playHalf,
  rejects,
  selectAll,
  stackModifiers,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('a.strike', 10, [{ type: 'attack', value: 3 }], [{ type: 'move', value: 3 }]),
  card('a.guard', 20, [{ type: 'shield', value: 2, target: 'self', duration: 'round', xp: 1 }], [{ type: 'heal', value: 2, target: 'self' }]),
  card('a.big', 30, [{ type: 'attack', value: 4, xp: 2 }], [{ type: 'move', value: 2 }]),
  card('a.multi', 50, [{ type: 'move', value: 2 }, { type: 'attack', value: 2 }], [{ type: 'infuse', element: 'fire' }]),
  ...fillerCards('a', 6),
];
CARDS[1]!.top.active = true;
CARDS[2]!.top.loss = true;

function game() {
  const content = makeContent({ heroes: { alpha: CARDS }, spawns: [{ monster: 'rat', hex: [3, 2] }] });
  const s = newGame(content, ['alpha']);
  stackModifiers(s, 'alpha', ['+0', '+0', '+0', '+0']);
  stackModifiers(s, 'monsters', ['+0', '+0', '+0', '+0']);
  return { content, s };
}

describe('hero turn', () => {
  it('plays the top of one card and the bottom of the other, in either order', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.strike', 'a.big'] });
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
    s = playHalf(s, content, 'alpha', 'a.big', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    rejects(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.big', half: 'top' });
    rejects(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.strike', half: 'bottom' });
    s = playHalf(s, content, 'alpha', 'a.strike', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(s.figures['monster:rat:1']?.hp).toBe(2);
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
    rejects(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.c1', half: 'top' });
  });

  it('basic actions: top Атака 2, bottom Рух 2; the card goes to the discard', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.big', 'a.guard'] });
    s = playHalf(s, content, 'alpha', 'a.guard', 'bottom', [{ path: [[1, 2], [2, 2]] }], true);
    rejects(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.big', half: 'bottom' });
    s = playHalf(s, content, 'alpha', 'a.big', 'top', [{ targets: ['monster:rat:1'] }], true);
    expect(s.figures['monster:rat:1']?.hp).toBe(3);
    expect(heroOf(s, 'alpha').discard).toEqual(['a.guard', 'a.big']);
    expect(heroOf(s, 'alpha').lost).toEqual([]);
    expect(heroOf(s, 'alpha').xp).toBe(0);
  });

  it('parts of an action can be skipped, but not reordered', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.multi', 'a.strike'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.multi', half: 'top' });
    expect(s.pending).toMatchObject({ kind: 'stepChoice', stepIndex: 0, step: { type: 'move' } });
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    s = act(s, content, { type: 'skipStep' });
    expect(s.pending).toMatchObject({ kind: 'stepChoice', stepIndex: 1, step: { type: 'attack' } });
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } }); // not adjacent
    s = act(s, content, { type: 'skipStep' });
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
  });

  it('cards go to discard, lost (loss mark) or active; unplayed selected cards are discarded', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.strike', 'a.big'] });
    s = playHalf(s, content, 'alpha', 'a.strike', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    s = playHalf(s, content, 'alpha', 'a.big', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(heroOf(s, 'alpha').discard).toEqual(['a.strike']);
    expect(heroOf(s, 'alpha').lost).toEqual(['a.big']);

    const g = game();
    let t = selectAll(g.s, g.content, { alpha: ['a.guard', 'a.multi'] });
    t = playHalf(t, g.content, 'alpha', 'a.guard', 'top', [{}]);
    expect(heroOf(t, 'alpha').active).toEqual([{ cardId: 'a.guard', half: 'top', lossOnEnd: false }]);
    expect(heroOf(t, 'alpha').shields).toEqual([{ value: 2, source: 'card:a.guard', until: 'round' }]);
    t = endTurn(t, g.content, 'alpha');
    expect(heroOf(t, 'alpha').discard).toEqual(['a.multi', 'a.guard']);
    expect(heroOf(t, 'alpha').active).toEqual([]);
  });

  it('XP comes from performed steps only', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.guard', 'a.big'] });
    s = playHalf(s, content, 'alpha', 'a.guard', 'top', [null]);
    expect(heroOf(s, 'alpha').xp).toBe(0);
    s = playHalf(s, content, 'alpha', 'a.big', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    const { content: c2, s: g2 } = game();
    let t = selectAll(g2, c2, { alpha: ['a.big', 'a.strike'] });
    t = playHalf(t, c2, 'alpha', 'a.strike', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    t = playHalf(t, c2, 'alpha', 'a.big', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(heroOf(t, 'alpha').xp).toBe(2);
    expect(eventsOf(t.log, 'xpGained')).toEqual([{ type: 'xpGained', heroId: 'hero:alpha', amount: 2 }]);
  });

  it('a stunned hero cannot act but still ends the turn and discards both cards', () => {
    const { content, s: s0 } = game();
    heroOf(s0, 'alpha').conditions.stun = { expiresAfterTurn: 1 };
    let s = selectAll(s0, content, { alpha: ['a.strike', 'a.big'] });
    rejects(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.strike', half: 'top' });
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').discard).toEqual(['a.strike', 'a.big']);
    expect(heroOf(s, 'alpha').conditions.stun).toBeUndefined();
  });
});

describe('undo', () => {
  it('reverts to the start of the current half', () => {
    const { content, s: s0 } = game();
    const start = selectAll(s0, content, { alpha: ['a.strike', 'a.big'] });
    let s = playHalf(start, content, 'alpha', 'a.strike', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    expect(heroOf(s, 'alpha').hex).toEqual([2, 2]);
    s = act(s, content, { type: 'undo' });
    expect(heroOf(s, 'alpha').hex).toEqual([0, 2]);
    expect({ ...s, log: [] }).toEqual({ ...start, log: [] });
    rejects(s, content, { type: 'undo' });
  });

  it('is blocked once a modifier was drawn', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['a.strike', 'a.big'] });
    s = playHalf(s, content, 'alpha', 'a.big', 'bottom', [{ path: [[1, 2], [2, 2]] }]);
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.strike', half: 'top' });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(s.undoPoint).toBeNull();
    rejects(s, content, { type: 'undo' });
  });
});
