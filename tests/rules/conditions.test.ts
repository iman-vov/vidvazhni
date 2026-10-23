import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard, MonsterType } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import type { GameState, MonsterState } from '../../src/rules/state';
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
  newGame,
  playHalf,
  selectAll,
  stackBehaviour,
  stackModifiers,
  takeAllDamage,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('k.immo', 10, [{ type: 'attack', value: 1, conditions: ['immobilize'] }], [{ type: 'condition', condition: 'strengthen', target: 'self' }]),
  card('k.heal', 20, [{ type: 'heal', value: 3, target: 'self' }], [{ type: 'heal', value: 2, target: 'self', removeNegative: 2 }]),
  card('k.stun', 15, [{ type: 'attack', value: 1, conditions: ['stun'] }], [{ type: 'condition', condition: 'invisible', target: 'self' }]),
  card('k.disarm', 12, [{ type: 'attack', value: 1, conditions: ['disarm', 'muddle'] }], [{ type: 'move', value: 2 }]),
  ...fillerCards('k', 6),
];

const MONSTER_CARDS: MonsterCard[] = [{ id: 'm.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];

function game(hex: Hex = [2, 2], extra: Partial<MonsterType> = {}) {
  const content = makeContent({
    heroes: { alpha: CARDS },
    monsters: [monsterType('rat', 'tmelee', extra)],
    decks: [{ id: 'tmelee', cards: MONSTER_CARDS }],
    spawns: [{ monster: 'rat', hex }],
  });
  const s = newGame(content, ['alpha']);
  stackModifiers(s, 'alpha', Array<string>(6).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(6).fill('+0'));
  return { content, s };
}

const rat = (s: GameState) => s.figures['monster:rat:1'] as MonsterState;

describe('conditions', () => {
  it('a timed condition on a monster lasts until the end of its next turn', () => {
    const { content, s: s0 } = game([1, 2]);
    let s = selectAll(s0, content, { alpha: ['k.immo', 'k.heal'] });
    s = playHalf(s, content, 'alpha', 'k.immo', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(rat(s).conditions.immobilize).toEqual({ expiresAfterTurn: 1 });
    heroOf(s, 'alpha').hex = [0, 4]; // out of reach: an immobilized rat cannot follow
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'moved').filter((e) => e.figureId === 'monster:rat:1')).toEqual([]);
    expect(rat(s).conditions.immobilize).toBeUndefined();
  });

  it('a condition taken during the own turn lasts through the next turn', () => {
    const { content, s: s0 } = game([5, 2]);
    let s = selectAll(s0, content, { alpha: ['k.heal', 'k.immo'] });
    s = playHalf(s, content, 'alpha', 'k.immo', 'bottom', [{}]);
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').conditions.strengthen).toEqual({ expiresAfterTurn: 2 });
    s = finishRound(s, content);
    s = selectAll(s, content, { alpha: ['k.c1', 'k.c2'] });
    expect(heroOf(s, 'alpha').conditions.strengthen).toBeDefined();
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').conditions.strengthen).toBeUndefined();
  });

  it('wound deals 1 damage at the start of each turn until healed; heal removes it', () => {
    const { content, s: s0 } = game([5, 2]);
    heroOf(s0, 'alpha').conditions.wound = {};
    rat(s0).conditions.wound = {};
    let s = act(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['k.heal', 'k.c1'], leading: 'k.heal' });
    expect(s.pending).toEqual({ kind: 'avoidDamage', heroId: 'hero:alpha', amount: 1, source: 'condition' });
    s = takeAllDamage(s, content);
    expect(heroOf(s, 'alpha').hp).toBe(9);
    s = playHalf(s, content, 'alpha', 'k.heal', 'top', [{}]);
    expect(heroOf(s, 'alpha')).toMatchObject({ hp: 10, conditions: {} });
    s = endTurn(s, content, 'alpha');
    expect(rat(s).hp).toBe(4);
  });

  it('poison: +1 per attack; heal on a poisoned figure only removes the poison', () => {
    const { content, s: s0 } = game([5, 2]);
    heroOf(s0, 'alpha').conditions.poison = {};
    heroOf(s0, 'alpha').hp = 5;
    let s = selectAll(s0, content, { alpha: ['k.heal', 'k.c1'] });
    s = playHalf(s, content, 'alpha', 'k.heal', 'top', [{}]);
    expect(heroOf(s, 'alpha')).toMatchObject({ hp: 5, conditions: {} });
    expect(eventsOf(s.log, 'healed')).toEqual([{ type: 'healed', figureId: 'hero:alpha', amount: 0, removed: ['poison'] }]);
  });

  it('heal can remove negative conditions', () => {
    const { content, s: s0 } = game([5, 2]);
    heroOf(s0, 'alpha').conditions = { muddle: { expiresAfterTurn: 5 }, disarm: { expiresAfterTurn: 5 }, immobilize: { expiresAfterTurn: 5 } };
    let s = selectAll(s0, content, { alpha: ['k.c1', 'k.heal'] });
    s = playHalf(s, content, 'alpha', 'k.heal', 'bottom', [{}]);
    expect(Object.keys(heroOf(s, 'alpha').conditions)).toEqual(['muddle']);
  });

  it('a stunned monster does nothing on its turn', () => {
    const { content, s: s0 } = game([1, 2]);
    let s = selectAll(s0, content, { alpha: ['k.stun', 'k.c1'] });
    s = playHalf(s, content, 'alpha', 'k.stun', 'top', [{ targets: ['monster:rat:1'] }]);
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'attacked').filter((e) => e.attackerId === 'monster:rat:1')).toEqual([]);
    expect(rat(s).conditions.stun).toBeUndefined();
  });

  it('a disarmed monster does not attack', () => {
    const { content, s: s0 } = game([1, 2]);
    let s = selectAll(s0, content, { alpha: ['k.disarm', 'k.c1'] });
    s = playHalf(s, content, 'alpha', 'k.disarm', 'top', [{ targets: ['monster:rat:1'] }]);
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'attacked').filter((e) => e.attackerId === 'monster:rat:1')).toEqual([]);
  });

  it('monsters cannot target an invisible hero', () => {
    const { content, s: s0 } = game([1, 2]);
    let s = selectAll(s0, content, { alpha: ['k.c1', 'k.stun'] });
    s = playHalf(s, content, 'alpha', 'k.stun', 'bottom', [{}]);
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').hp).toBe(10);
  });

  it('immune monsters ignore those conditions', () => {
    const { content, s: s0 } = game([1, 2], { traits: [{ trait: 'immune', conditions: ['stun', 'immobilize'] }] });
    let s = selectAll(s0, content, { alpha: ['k.stun', 'k.c1'] });
    s = playHalf(s, content, 'alpha', 'k.stun', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(rat(s).conditions).toEqual({});
  });
});

describe('monster effects', () => {
  it('a monster type with onAttack conditions applies them', () => {
    const { content, s: s0 } = game([1, 2], { normal: { hp: 5, move: 2, attack: 2, onAttack: ['poison'] } });
    let s = selectAll(s0, content, { alpha: ['k.c6', 'k.c1'] });
    s = takeAllDamage(s, content);
    expect(heroOf(s, 'alpha').conditions.poison).toEqual({});
  });

  it('the monster group uses its behaviour card relative to its stats', () => {
    const content = makeContent({
      heroes: { alpha: CARDS },
      decks: [{ id: 'tmelee', cards: [{ id: 'm.5', initiative: 5, steps: [{ type: 'move', value: 1 }, { type: 'attack', value: 1 }] }] }],
      spawns: [{ monster: 'rat', hex: [3, 2] }],
    });
    let s = newGame(content, ['alpha']);
    stackBehaviour(s, 'rat', ['m.5']);
    stackModifiers(s, 'monsters', ['+0']);
    s = selectAll(s, content, { alpha: ['k.c1', 'k.c2'] });
    expect(eventsOf(s.log, 'moved')[0]).toMatchObject({ figureId: 'monster:rat:1' });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ attackerId: 'monster:rat:1', base: 3 });
  });
});
