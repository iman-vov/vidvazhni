import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../../src/rules/content';
import type { Hex } from '../../../src/rules/hex';
import { legalActions } from '../../../src/rules/queries';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  finishRound,
  heroOf,
  makeContent,
  monsterType,
  rejects,
  selectAll,
  stackModifiers,
  takeAllDamage,
} from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const BRUTE: MonsterCard[] = [{ id: 'tbrute.05', initiative: 5, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];
const BETA: HeroCard[] = [
  card('beta.loss', 30, [{ type: 'attack', value: 2 }], [{ type: 'move', value: 2 }], { top: { steps: [{ type: 'attack', value: 2 }], loss: true } }),
  ...fillerCards('beta', 9),
];

function game(reviveAlly = true, startHexes: Hex[] = [[0, 2], [0, 3]], heroes = ['alpha', 'beta']) {
  const c = makeContent({
    heroes: { alpha: fillerCards('alpha'), beta: BETA },
    monsters: [monsterType('brute', 'tbrute', { normal: { hp: 30, move: 1, attack: 20 } })],
    decks: [{ id: 'tbrute', cards: BRUTE }],
    spawns: [{ monster: 'brute', hex: [1, 1] }],
    startHexes,
  });
  const s = forkGame(c, { reviveAlly }, heroes);
  stackModifiers(s, 'monsters', Array<string>(10).fill('+0'));
  return { c, s };
}

/** Round 1: the brute (initiative 5) knocks alpha down. */
function alphaDown(reviveAlly = true, startHexes?: Hex[]) {
  const { c, s: s0 } = game(reviveAlly, startHexes);
  const s = takeAllDamage(selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c4', 'beta.loss'] }), c);
  return { c, s };
}

describe('fork «Підняти друга» (reviveAlly)', () => {
  it('at 0 hp a hero is downed: stays on its hex, skips its turn (selected cards are discarded)', () => {
    const { s } = alphaDown();
    const a = heroOf(s, 'alpha');
    expect(a).toMatchObject({ downed: true, exhausted: false, revived: false, hp: 0, hex: [0, 2] });
    expect(eventsOf(s.log, 'heroDowned')).toEqual([{ type: 'heroDowned', heroId: 'hero:alpha' }]);
    expect(eventsOf(s.log, 'heroExhausted')).toEqual([]);
    expect(a.discard.sort()).toEqual(['alpha.c1', 'alpha.c2']);
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:beta' });
  });

  it('off: 0 hp exhausts as in the base rules', () => {
    const { s } = alphaDown(false);
    expect(heroOf(s, 'alpha')).toMatchObject({ downed: false, exhausted: true });
  });

  it('an adjacent ally spends a half to raise the hero with 3 hp and the same hand', () => {
    const { c, s: s0 } = alphaDown();
    const hand = [...heroOf(s0, 'alpha').hand];
    expect(legalActions(s0, c)).toContainEqual({ type: 'reviveAlly', heroId: 'hero:beta', cardId: 'beta.c4', half: 'top', targetId: 'hero:alpha' });
    let s = act(s0, c, { type: 'reviveAlly', heroId: 'hero:beta', cardId: 'beta.c4', half: 'top', targetId: 'hero:alpha' });
    expect(heroOf(s, 'alpha')).toMatchObject({ downed: false, revived: true, hp: 3, hand });
    expect(heroOf(s, 'beta').discard).toEqual(['beta.c4']);
    expect(eventsOf(s.log, 'heroRevived')).toEqual([{ type: 'heroRevived', heroId: 'hero:alpha', byId: 'hero:beta' }]);
    // The top action is spent; the other card's bottom is still free.
    expect(rejects(s, c, { type: 'startHalf', heroId: 'hero:beta', cardId: 'beta.loss', half: 'top' })).toBe('top action already played');
    s = act(s, c, { type: 'startHalf', heroId: 'hero:beta', cardId: 'beta.loss', half: 'bottom' });
    expect(s.pending).toMatchObject({ kind: 'stepChoice' });
  });

  it('a half with the loss mark sends the card to the lost pile; undo takes the raise back', () => {
    const { c, s: s0 } = alphaDown();
    const s = act(s0, c, { type: 'reviveAlly', heroId: 'hero:beta', cardId: 'beta.loss', half: 'top', targetId: 'hero:alpha' });
    expect(heroOf(s, 'beta').lost).toEqual(['beta.loss']);
    const u = act(s, c, { type: 'undo' });
    expect(heroOf(u, 'alpha')).toMatchObject({ downed: true, hp: 0 });
    expect(heroOf(u, 'beta').lost).toEqual([]);
  });

  it('the ally must be adjacent', () => {
    const { c, s } = alphaDown(true, [[0, 2], [4, 4]]);
    expect(rejects(s, c, { type: 'reviveAlly', heroId: 'hero:beta', cardId: 'beta.c4', half: 'top', targetId: 'hero:alpha' })).toBe(
      'the ally must be adjacent',
    );
  });

  it('a downed hero is not targeted, not asked to choose cards, and blocks its hex', () => {
    const { c, s: s0 } = alphaDown();
    // Beta may pass through but not stop on the downed ally's hex.
    let s = act(s0, c, { type: 'startHalf', heroId: 'hero:beta', cardId: 'beta.c4', half: 'bottom' });
    rejects(s, c, { type: 'resolveStep', choice: { path: [[0, 2]] } });
    s = act(s, c, { type: 'skipStep' });
    s = finishRound(endTurn(s, c, 'beta'), c);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:beta'] });
    // Round 2: the brute ignores the downed alpha, steps next to beta and knocks beta down too:
    // every hero is downed, the scenario is lost.
    s = takeAllDamage(selectAll(s, c, { beta: ['beta.c5', 'beta.c6'] }), c);
    expect(eventsOf(s.log, 'attacked').map((e) => e.targetId)).toEqual(['hero:alpha', 'hero:beta']);
    expect(s.figures['monster:brute:1']!.hex).toEqual([1, 2]);
    expect(heroOf(s, 'beta').downed).toBe(true);
    expect(s.phase).toBe('lost');
  });

  it('the second fall is normal exhaustion', () => {
    const { c, s: s0 } = alphaDown();
    let s = act(s0, c, { type: 'reviveAlly', heroId: 'hero:beta', cardId: 'beta.c4', half: 'top', targetId: 'hero:alpha' });
    s = finishRound(endTurn(s, c, 'beta'), c);
    s = takeAllDamage(selectAll(s, c, { alpha: ['alpha.c3', 'alpha.c4'], beta: ['beta.c5', 'beta.c6'] }), c);
    expect(heroOf(s, 'alpha')).toMatchObject({ exhausted: true, downed: false });
    expect(eventsOf(s.log, 'heroExhausted')).toEqual([{ type: 'heroExhausted', heroId: 'hero:alpha', reason: 'damage' }]);
    expect(s.phase).toBe('turns');
  });

  it('a wound that downs the hero at the start of its turn skips the turn', () => {
    const { c, s: s0 } = game();
    const a0 = heroOf(s0, 'alpha');
    a0.hp = 21;
    a0.maxHp = 21;
    a0.conditions.wound = {};
    const s = takeAllDamage(selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c4', 'beta.loss'] }), c);
    expect(heroOf(s, 'alpha')).toMatchObject({ downed: true, hp: 0 });
    expect(heroOf(s, 'alpha').discard.sort()).toEqual(['alpha.c1', 'alpha.c2']);
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:beta' });
  });

  it('a lone hero downed = scenario lost', () => {
    const { c, s: s0 } = game(true, [[0, 2]], ['alpha']);
    const s = takeAllDamage(selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] }), c);
    expect(heroOf(s, 'alpha').downed).toBe(true);
    expect(s.phase).toBe('lost');
  });
});
