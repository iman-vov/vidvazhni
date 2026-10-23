import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../src/rules/content';
import type { MonsterState } from '../../src/rules/state';
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
  rejects,
  selectAll,
  stackBehaviour,
  stackModifiers,
  takeAllDamage,
  type FixtureOptions,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('f.wall', 10, [{ type: 'shield', value: 1, target: 'adjacentAllies', duration: 'round' }], [{ type: 'teleport', range: 3 }]),
  card('f.spikes', 25, [{ type: 'retaliate', value: 2, duration: { uses: 2 }, xp: 1 }], [{ type: 'push', value: 1, target: 'adjacentEnemies' }]),
  card('f.taunt', 20, [{ type: 'provoke', radius: 3 }], [{ type: 'condition', condition: 'muddle', target: 'enemiesInRadius', radius: 2 }]),
  card('f.trap', 35, [{ type: 'trap', damage: 3, conditions: ['immobilize'] }], [{ type: 'summon', summon: 'alpha.dog' }]),
  card('f.sphere', 15, [{ type: 'infuse', element: 'any', xp: 1 }], [{ type: 'special', name: 'recoverLost' }]),
  card('f.stone', 16, [{ type: 'active', uses: 2, on: 'attacked', grant: { shield: 1 } }], [{ type: 'move', value: 1 }]),
  ...fillerCards('f', 5),
];
CARDS[5]!.top.active = true;
CARDS[1]!.top.active = true;
CARDS[1]!.top.loss = true;
CARDS[3]!.bottom.active = true;
CARDS[3]!.bottom.loss = true;
CARDS[4]!.bottom.loss = true;

const LATE: MonsterCard[] = [{ id: 'late.90', initiative: 90, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];

function game(opts: FixtureOptions = {}, heroes = ['alpha']) {
  const content = makeContent({
    heroes: { alpha: CARDS, beta: fillerCards('beta') },
    heroExtra: { alpha: { summon: { id: 'alpha.dog', hp: 4, move: 3, attack: 2 } } },
    decks: [{ id: 'tmelee', cards: LATE }],
    spawns: [{ monster: 'rat', hex: [1, 2] }],
    ...opts,
  });
  const s = newGame(content, heroes);
  stackModifiers(s, 'alpha', Array<string>(8).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(8).fill('+0'));
  return { content, s };
}

describe('support effects', () => {
  it('shield on all adjacent allies, for the round', () => {
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [5, 2] }] }, ['alpha', 'beta']);
    let s = selectAll(s0, content, { alpha: ['f.wall', 'f.c1'], beta: ['beta.c9', 'beta.c10'] });
    s = playHalf(s, content, 'alpha', 'f.wall', 'top', [{}]);
    expect(heroOf(s, 'beta').shields).toEqual([{ value: 1, source: 'card:f.wall', until: 'round' }]);
    expect(heroOf(s, 'alpha').shields).toEqual([]);
    s = finishRound(s, content);
    expect(heroOf(s, 'beta').shields).toEqual([]);
  });

  it('retaliate with uses stays active until used up, then the (loss) card is lost', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['f.spikes', 'f.c1'] });
    s = playHalf(s, content, 'alpha', 'f.spikes', 'top', [{}]);
    expect(heroOf(s, 'alpha').active).toEqual([{ cardId: 'f.spikes', half: 'top', usesLeft: 2, lossOnEnd: true }]);
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'retaliated')).toEqual([{ type: 'retaliated', figureId: 'hero:alpha', targetId: 'monster:rat:1', damage: 2 }]);
    expect(heroOf(s, 'alpha').active[0]?.usesLeft).toBe(1);
    s = finishRound(s, content);
    expect(heroOf(s, 'alpha').active).toHaveLength(1);
    s = finishRound(selectAll(s, content, { alpha: ['f.c2', 'f.c3'] }), content);
    expect(heroOf(s, 'alpha').active).toEqual([]);
    expect(heroOf(s, 'alpha').lost).toContain('f.spikes');
  });

  it('provoke: monsters within the radius focus the provoking hero; it ends with the round', () => {
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [2, 3] }] }, ['alpha', 'beta']);
    heroOf(s0, 'alpha').hex = [0, 3];
    heroOf(s0, 'beta').hex = [2, 4];
    let s = selectAll(s0, content, { alpha: ['f.taunt', 'f.c1'], beta: ['beta.c3', 'beta.c4'] });
    s = playHalf(s, content, 'alpha', 'f.taunt', 'top', [{}]);
    expect(heroOf(s, 'alpha').provokeRadius).toBe(3);
    s = endTurn(s, content, 'alpha');
    s = endTurn(s, content, 'beta');
    expect(eventsOf(s.log, 'attacked').filter((e) => e.attackerId === 'monster:rat:1').map((e) => e.targetId)).toEqual(['hero:alpha']);
    s = finishRound(s, content);
    expect(heroOf(s, 'alpha').provokeRadius).toBeNull();
  });

  it('conditions on every enemy in a radius; push every adjacent enemy', () => {
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [1, 2] }, { monster: 'rat', hex: [2, 2] }, { monster: 'rat', hex: [5, 2] }] });
    let s = selectAll(s0, content, { alpha: ['f.taunt', 'f.spikes'] });
    s = playHalf(s, content, 'alpha', 'f.taunt', 'bottom', [{}]);
    const rats = () => [1, 2, 3].map((n) => s.figures[`monster:rat:${n}`] as MonsterState);
    expect(rats().map((r) => !!r.conditions.muddle)).toEqual([true, true, false]);
    const g = game({ spawns: [{ monster: 'rat', hex: [1, 2] }, { monster: 'rat', hex: [1, 1] }] });
    let t = selectAll(g.s, g.content, { alpha: ['f.taunt', 'f.spikes'] });
    t = playHalf(t, g.content, 'alpha', 'f.spikes', 'bottom', [{ pushPaths: { 'monster:rat:1': [[2, 2]] } }]);
    expect(t.figures['monster:rat:1']?.hex).toEqual([2, 2]);
    expect(t.figures['monster:rat:2']?.hex).not.toEqual([1, 1]);
  });

  it('teleport to a free hex in range, ignoring everything between', () => {
    const { content, s: s0 } = game({ room: { obstacles: [{ hex: [1, 3] }] } });
    let s = selectAll(s0, content, { alpha: ['f.wall', 'f.c1'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'f.wall', half: 'bottom' });
    rejects(s, content, { type: 'resolveStep', choice: { hex: [1, 2] } });
    rejects(s, content, { type: 'resolveStep', choice: { hex: [4, 2] } });
    s = act(s, content, { type: 'resolveStep', choice: { hex: [3, 2] } });
    expect(heroOf(s, 'alpha').hex).toEqual([3, 2]);
  });

  it('a placed trap hurts and immobilizes the monster that walks in', () => {
    // Obstacles leave [1, 2] as the only hex next to the hero.
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [3, 2] }], room: { obstacles: [{ hex: [1, 1] }, { hex: [0, 1] }, { hex: [0, 3] }] } });
    let s = selectAll(s0, content, { alpha: ['f.trap', 'f.c1'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'f.trap', half: 'top' });
    rejects(s, content, { type: 'resolveStep', choice: { hex: [3, 2] } });
    s = act(s, content, { type: 'resolveStep', choice: { hex: [1, 2] } });
    expect(s.board.tiles['1,2']?.trap).toEqual({ damage: 3, conditions: ['immobilize'] });
    s = endTurn(s, content, 'alpha');
    const rat = s.figures['monster:rat:1'] as MonsterState;
    expect(rat.hp).toBe(5 - 3);
    expect(rat.conditions.immobilize).toBeDefined();
  });

  it('a hero summon acts right before its owner using the monster AI, and its card stays active', () => {
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [4, 2] }] });
    let s = selectAll(s0, content, { alpha: ['f.c1', 'f.trap'] });
    s = playHalf(s, content, 'alpha', 'f.trap', 'bottom', [{ hex: [1, 2] }]);
    expect(s.figures['summon:alpha.dog']).toMatchObject({ hp: 4, hex: [1, 2], ownerId: 'hero:alpha' });
    expect(heroOf(s, 'alpha').active).toEqual([{ cardId: 'f.trap', half: 'bottom', lossOnEnd: true }]);
    s = finishRound(s, content);
    s = selectAll(s, content, { alpha: ['f.c2', 'f.c3'] });
    expect(s.turnOrder.slice(0, 2).map((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId))).toEqual(['summon:alpha.dog', 'hero:alpha']);
    expect(eventsOf(s.log, 'attacked').some((e) => e.attackerId === 'summon:alpha.dog' && e.targetId === 'monster:rat:1')).toBe(true);
    expect(heroOf(s, 'alpha').active).toHaveLength(1);
  });
});

describe('active shield while attacked', () => {
  it('«Щит 1 на N атак» reduces each attack and is used up', () => {
    const fast: MonsterCard[] = [{ id: 'fast.5', initiative: 99, steps: [{ type: 'attack', value: 1 }] }];
    const { content, s: s0 } = game({ decks: [{ id: 'tmelee', cards: fast }] });
    let s = selectAll(s0, content, { alpha: ['f.stone', 'f.c1'] });
    s = playHalf(s, content, 'alpha', 'f.stone', 'top', [{}]);
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ targetId: 'hero:alpha', base: 3, shield: 1, damage: 2 });
    expect(heroOf(s, 'alpha').active).toEqual([{ cardId: 'f.stone', half: 'top', usesLeft: 1, lossOnEnd: false }]);
  });
});

describe('monster summons', () => {
  it('a summoned monster appears next to its summoner and does not act this round; max per figure', () => {
    const SUMMON: MonsterCard[] = [{ id: 'sum.10', initiative: 10, steps: [{ type: 'summon', summon: 'ghost', rank: 'normal' }] }];
    const content = makeContent({
      monsters: [
        monsterType('cultist', 'tcaster', { traits: [{ trait: 'maxSummonsPerFigure', value: 1 }] }),
        monsterType('ghost', 'tmelee'),
      ],
      decks: [
        { id: 'tcaster', cards: SUMMON },
        { id: 'tmelee', cards: LATE },
      ],
      spawns: [{ monster: 'cultist', hex: [5, 2] }],
    });
    let s = newGame(content, ['alpha']);
    stackBehaviour(s, 'cultist', ['sum.10']);
    s = selectAll(s, content, { alpha: ['alpha.c5', 'alpha.c6'] });
    const ghost = s.figures['monster:ghost:1'] as MonsterState;
    expect(ghost).toMatchObject({ summonerId: 'monster:cultist:1', summonedRound: 1 });
    expect(Math.abs(ghost.hex[0] - 5) + Math.abs(ghost.hex[1] - 2)).toBeLessThanOrEqual(2);
    expect(eventsOf(s.log, 'turnStarted').map((e) => e.figureId)).not.toContain('monster:ghost:1');
    s = finishRound(s, content);
    s = selectAll(s, content, { alpha: ['alpha.c7', 'alpha.c8'] });
    expect(Object.keys(s.figures).filter((id) => id.startsWith('monster:ghost'))).toHaveLength(1);
  });
});

describe('specials', () => {
  it('«Сфера стихій» bottom: all lost cards return to the hand, this card is lost', () => {
    const { content, s: s0 } = game({ spawns: [{ monster: 'rat', hex: [5, 2] }] });
    const h = heroOf(s0, 'alpha');
    h.hand = h.hand.filter((c) => c !== 'f.c4' && c !== 'f.c5');
    h.lost = ['f.c4', 'f.c5'];
    let s = selectAll(s0, content, { alpha: ['f.sphere', 'f.c1'] });
    s = playHalf(s, content, 'alpha', 'f.sphere', 'bottom', [{}]);
    expect(heroOf(s, 'alpha').lost).toEqual(['f.sphere']);
    expect(heroOf(s, 'alpha').hand).toEqual(expect.arrayContaining(['f.c4', 'f.c5']));
    s = takeAllDamage(s, content);
  });
});
