import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../../src/rules/content';
import { distance } from '../../../src/rules/hex';
import type { MonsterState } from '../../../src/rules/state';
import {
  eventsOf,
  finishRound,
  heroOf,
  makeContent,
  MELEE_CARDS,
  monsterType,
  selectAll,
  stackModifiers,
  takeAllDamage,
} from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const FORK_CARDS: MonsterCard[] = [
  {
    id: 'wolf.cond',
    initiative: 30,
    if: 'selfHpAtMostHalf',
    steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 2 }],
    otherwise: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }],
  },
  {
    id: 'wolf.flee',
    initiative: 40,
    if: 'selfHpAtMostHalf',
    steps: [{ type: 'special', name: 'retreat', params: { distance: 2 } }],
    otherwise: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }],
  },
];

function content(spawns: { hex: [number, number]; rank?: 'normal' | 'elite' }[] = [{ hex: [1, 2] }]) {
  return makeContent({
    monsters: [monsterType('wolf', 'tmelee', { forkCards: FORK_CARDS }), monsterType('ogre', 'tmelee', { normal: { hp: 10, move: 1, attack: 3 } })],
    spawns: spawns.map((s) => ({ monster: 'wolf', hex: s.hex, ...(s.rank ? { rank: s.rank } : {}) })),
  });
}

function game(c: ReturnType<typeof content>, on = true) {
  const s = forkGame(c, { threeIntents: on }, ['alpha']);
  stackModifiers(s, 'alpha', Array<string>(8).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(8).fill('+0'));
  return s;
}

const wolves = (s: ReturnType<typeof game>) => Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster');

describe('fork «Три можливі наміри» (threeIntents)', () => {
  it('off: the template deck only, no intents, base health', () => {
    const s = game(content(), false);
    expect(s.behaviourDecks.wolf).toMatchObject({ intents: [], current: null });
    expect(s.behaviourDecks.wolf!.draw.sort()).toEqual(['tmelee.50', 'tmelee.60']);
    expect(wolves(s)[0]).toMatchObject({ hp: 5, maxHp: 5 });
  });

  it('the deck gains the type’s own cards; 3 intents are drawn before card selection', () => {
    const s = game(content());
    const deck = s.behaviourDecks.wolf!;
    expect(deck.intents).toHaveLength(3);
    expect([...deck.draw, ...deck.intents].sort()).toEqual(['tmelee.50', 'tmelee.60', 'wolf.cond', 'wolf.flee']);
    expect(eventsOf(s.log, 'intentsDrawn')).toEqual([{ type: 'intentsDrawn', typeId: 'wolf', cards: deck.intents }]);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:alpha'] });
  });

  it('monster health +10%, rounded up', () => {
    const c = content([{ hex: [1, 2] }, { hex: [3, 3], rank: 'elite' }]);
    c.scenarios.test!.rooms[0]!.spawns!.push({ monster: 'ogre', hex: [4, 1], by: { '2': 'normal', '3': 'normal', '4': 'normal' } });
    const s = game(c);
    const hp = Object.fromEntries(Object.values(s.figures).filter((f) => f.kind === 'monster').map((f) => [f.id, f.maxHp]));
    expect(hp).toEqual({ 'monster:wolf:1': 6, 'monster:wolf:2': 9, 'monster:ogre:1': 11 });
  });

  it('after selection one intent is picked at random, the other two go back and the pile is shuffled', () => {
    const c = content();
    const s0 = game(c);
    const intents = [...s0.behaviourDecks.wolf!.intents];
    const s = selectAll(s0, c, { alpha: ['alpha.c9', 'alpha.c10'] });
    const deck = s.behaviourDecks.wolf!;
    expect(intents).toContain(deck.current);
    expect(deck.intents).toEqual([]);
    expect([...deck.draw, deck.current].sort()).toEqual(['tmelee.50', 'tmelee.60', 'wolf.cond', 'wolf.flee']);
    expect(eventsOf(s.log, 'behaviourDrawn')[0]).toMatchObject({ typeId: 'wolf', cardId: deck.current });
    const entry = s.turnOrder.find((e) => e.kind === 'monsterGroup');
    expect(entry?.initiative).toBe({ 'tmelee.50': 50, 'tmelee.60': 60, 'wolf.cond': 30, 'wolf.flee': 40 }[deck.current!]);

    const next = finishRound(takeAllDamage(s, c), c);
    expect(next.round).toBe(2);
    const d2 = next.behaviourDecks.wolf!;
    expect(d2.intents).toHaveLength(3);
    expect([...d2.draw, ...d2.discard, ...d2.intents].sort()).toEqual(['tmelee.50', 'tmelee.60', 'wolf.cond', 'wolf.flee']);
    expect(eventsOf(next.log, 'intentsDrawn')).toHaveLength(2);
  });

  it('the same seed picks the same intent', () => {
    const c = content();
    const a = selectAll(game(c), c, { alpha: ['alpha.c9', 'alpha.c10'] });
    const b = selectAll(game(c), c, { alpha: ['alpha.c9', 'alpha.c10'] });
    expect(a.behaviourDecks).toEqual(b.behaviourDecks);
  });

  it('a conditional card is evaluated on the monster’s own turn, for each figure', () => {
    const c = content([{ hex: [1, 2] }, { hex: [1, 1] }]);
    const s0 = game(c);
    s0.behaviourDecks.wolf!.draw.push(...s0.behaviourDecks.wolf!.intents.filter((x) => x !== 'wolf.cond'));
    s0.behaviourDecks.wolf!.intents = ['wolf.cond'];
    s0.figures['monster:wolf:1']!.hp = 3; // 3 of 6: at most half
    const s = takeAllDamage(selectAll(s0, c, { alpha: ['alpha.c9', 'alpha.c10'] }), c);
    expect(eventsOf(s.log, 'attacked').map((e) => [e.attackerId, e.base])).toEqual([
      ['monster:wolf:1', 4],
      ['monster:wolf:2', 2],
    ]);
    expect(heroOf(s, 'alpha').hp).toBe(4);
  });

  it('«відступити на 2»: the wounded monster moves away from the heroes', () => {
    const c = content();
    const s0 = game(c);
    s0.behaviourDecks.wolf!.intents = ['wolf.flee'];
    s0.figures['monster:wolf:1']!.hp = 2;
    const s = selectAll(s0, c, { alpha: ['alpha.c9', 'alpha.c10'] });
    const wolf = s.figures['monster:wolf:1']!;
    expect(wolf.hex).toEqual([1, 4]);
    expect(distance(wolf.hex, heroOf(s, 'alpha').hex)).toBe(3);
    expect(eventsOf(s.log, 'attacked')).toEqual([]);
  });
});
