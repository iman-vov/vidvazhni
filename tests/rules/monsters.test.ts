import { describe, expect, it } from 'vitest';
import type { BossType, Content, HeroCard, MonsterCard } from '../../src/rules/content';
import type { MonsterState } from '../../src/rules/state';
import {
  act,
  card,
  eventsOf,
  fillerCards,
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
  card('h.shot', 10, [{ type: 'attack', value: 2, range: 3 }], [{ type: 'move', value: 2 }]),
  card('h.stun', 15, [{ type: 'attack', value: 1, conditions: ['stun', 'poison'] }], [{ type: 'move', value: 2 }]),
  ...fillerCards('h', 8),
];

const BOSS: BossType = {
  id: 'miller',
  hpPerHero: 8,
  hpPerHeroPerLevel: 2,
  move: 2,
  attack: 3,
  shield: 1,
  deck: 'tboss',
  immune: ['stun', 'immobilize', 'muddle'],
};

describe('bosses', () => {
  it('health scales with the number of heroes and the level; immune conditions do not land', () => {
    const base = makeContent({ heroes: { alpha: CARDS, beta: fillerCards('beta') } });
    const content: Content = {
      ...base,
      bosses: { miller: BOSS },
      decks: { ...base.decks, tboss: { id: 'tboss', cards: [{ id: 'b.99', initiative: 99, steps: [] }] } },
    };
    content.scenarios.test!.rooms[0]!.spawns = [{ monster: 'miller', hex: [1, 2], by: { '2': 'normal' } }];
    let s = newGame(content, ['alpha', 'beta']);
    const boss = s.figures['monster:miller:1'] as MonsterState;
    expect(boss).toMatchObject({ rank: 'boss', hp: 16, maxHp: 16, shields: [{ value: 1, source: 'stats', until: 'scenario' }] });
    stackModifiers(s, 'alpha', ['+0']);
    s = selectAll(s, content, { alpha: ['h.stun', 'h.c1'], beta: ['beta.c5', 'beta.c6'] });
    s = playHalf(s, content, 'alpha', 'h.stun', 'top', [{ targets: ['monster:miller:1'] }]);
    expect((s.figures['monster:miller:1'] as MonsterState).conditions).toEqual({ poison: {} });
  });
});

describe('monster traits', () => {
  it('rat: attacks with advantage when another rat stands next to the target', () => {
    const content = makeContent({
      heroes: { alpha: CARDS },
      monsters: [monsterType('rat', 'tmelee', { traits: [{ trait: 'advantageIfSameTypeAdjacentToTarget' }] })],
      decks: [{ id: 'tmelee', cards: [{ id: 'a.5', initiative: 5, steps: [{ type: 'attack', value: 0 }] }] }],
      spawns: [
        { monster: 'rat', hex: [1, 2] },
        { monster: 'rat', hex: [0, 1] },
      ],
    });
    let s = newGame(content, ['alpha']);
    stackModifiers(s, 'monsters', ['-1', '+1', '-1', '+1']);
    s = act(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['h.c1', 'h.c2'], leading: 'h.c1' });
    s = takeAllDamage(s, content);
    expect(eventsOf(s.log, 'attacked').map((e) => [e.modifiers.length, e.chosen])).toEqual([
      [2, '+1'],
      [2, '+1'],
    ]);
  });

  it('ghost: ranged attacks against it have disadvantage', () => {
    const content = makeContent({
      heroes: { alpha: CARDS },
      monsters: [monsterType('ghost', 'tmelee', { traits: [{ trait: 'rangedAttacksAgainstHaveDisadvantage' }] })],
      decks: [{ id: 'tmelee', cards: [{ id: 'g.99', initiative: 99, steps: [] }] }],
      spawns: [{ monster: 'ghost', hex: [3, 2] }],
    });
    let s = newGame(content, ['alpha']);
    stackModifiers(s, 'alpha', ['+2', '-1']);
    s = selectAll(s, content, { alpha: ['h.shot', 'h.c1'] });
    s = playHalf(s, content, 'alpha', 'h.shot', 'top', [{ targets: ['monster:ghost:1'] }]);
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ modifiers: ['+2', '-1'], chosen: '-1' });
  });

  it('conditional behaviour cards pick their branch when the monster acts', () => {
    const cards: MonsterCard[] = [
      {
        id: 'c.5',
        initiative: 5,
        if: 'selfHpAtMostHalf',
        steps: [{ type: 'heal', value: 2, target: 'self' }],
        otherwise: [{ type: 'shield', value: 1, target: 'self', duration: 'round' }],
      },
    ];
    const content = makeContent({ heroes: { alpha: CARDS }, decks: [{ id: 'tmelee', cards }], spawns: [{ monster: 'rat', hex: [3, 2] }, { monster: 'rat', hex: [5, 2] }] });
    let s = newGame(content, ['alpha']);
    (s.figures['monster:rat:1'] as MonsterState).hp = 2;
    stackBehaviour(s, 'rat', ['c.5']);
    s = act(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['h.c1', 'h.c2'], leading: 'h.c1' });
    expect(s.figures['monster:rat:1']).toMatchObject({ hp: 4, shields: [] });
    expect(s.figures['monster:rat:2']).toMatchObject({ hp: 5, shields: [{ value: 1, source: 'round', until: 'round' }] });
  });
});
