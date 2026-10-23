import { describe, expect, it } from 'vitest';
import type { HeroCard } from '../../src/rules/content';
import { apply } from '../../src/rules/engine';
import { legalActions, previewAttack } from '../../src/rules/queries';
import type { GameState } from '../../src/rules/state';
import { act, card, fillerCards, heroOf, makeContent, monsterType, newGame, selectAll } from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('q.hit', 10, [{ type: 'attack', value: 3, pierce: 1 }], [{ type: 'move', value: 2 }]),
  card('q.shot', 20, [{ type: 'attack', value: 2, range: 3, targets: 2 }], [{ type: 'infuse', element: 'any' }]),
  ...fillerCards('q', 8),
];

function game() {
  const content = makeContent({
    heroes: { alpha: CARDS },
    monsters: [monsterType('rat', 'tmelee', { normal: { hp: 5, move: 2, attack: 2, shield: 2 } })],
    decks: [{ id: 'tmelee', cards: [{ id: 'idle.99', initiative: 99, steps: [{ type: 'attack', value: 0 }] }] }],
    spawns: [
      { monster: 'rat', hex: [1, 2] },
      { monster: 'rat', hex: [3, 2] },
    ],
  });
  return { content, s: newGame(content, ['alpha']) };
}

function allApply(s: GameState, content: ReturnType<typeof makeContent>) {
  const actions = legalActions(s, content);
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) expect(apply(s, a, content).ok, JSON.stringify(a)).toBe(true);
  return actions;
}

describe('legalActions', () => {
  it('offers every card pair with either leading card during selection', () => {
    const { content, s } = game();
    const actions = allApply(s, content);
    expect(actions.filter((a) => a.type === 'selectCards')).toHaveLength(45 * 2);
    expect(actions.some((a) => a.type === 'declareLongRest')).toBe(false);
  });

  it('offers halves, basic actions and ending the turn; then legal step choices', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['q.hit', 'q.shot'] });
    const turn = allApply(s, content);
    expect(turn.filter((a) => a.type === 'startHalf')).toHaveLength(8);
    expect(turn).toContainEqual({ type: 'endTurn', heroId: 'hero:alpha' });

    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'q.shot', half: 'top' });
    const step = allApply(s, content);
    expect(step).toContainEqual({ type: 'skipStep' });
    expect(step).toContainEqual({ type: 'undo' });
    const targets = step.flatMap((a) => (a.type === 'resolveStep' ? [a.choice.targets] : []));
    expect(targets).toEqual(expect.arrayContaining([['monster:rat:2'], ['monster:rat:1', 'monster:rat:2']]));

    s = act(s, content, { type: 'skipStep' });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'q.hit', half: 'bottom' });
    const moves = allApply(s, content).filter((a) => a.type === 'resolveStep');
    expect(moves.length).toBeGreaterThan(3);
  });

  it('offers the avoid-damage choices and short rest decisions', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['q.hit', 'q.shot'] });
    s = act(s, content, { type: 'endTurn', heroId: 'hero:alpha' });
    expect(s.pending?.kind).toBe('avoidDamage');
    const avoid = allApply(s, content);
    expect(avoid).toContainEqual({ type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(avoid.filter((a) => a.type === 'avoidDamage')).toHaveLength(1 + 8 + 1);
    while (s.pending?.kind === 'avoidDamage') s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(s.pending?.kind).toBe('endOfRound');
    expect(allApply(s, content)).toHaveLength(2);
  });
});

describe('previewAttack', () => {
  it('expected damage before the modifier: card value, poison, shield minus pierce', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['q.hit', 'q.shot'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'q.hit', half: 'top' });
    expect(previewAttack(s, 'hero:alpha', 'monster:rat:1', content)).toEqual({
      value: 3,
      shield: 2,
      pierce: 1,
      damage: 2,
      advantage: false,
      disadvantage: false,
    });
    s.figures['monster:rat:1']!.conditions.poison = {};
    expect(previewAttack(s, 'hero:alpha', 'monster:rat:1', content)?.damage).toBe(3);
  });

  it('works for a monster’s attack of the round and for a given step', () => {
    const { content, s: s0 } = game();
    const s = selectAll(s0, content, { alpha: ['q.hit', 'q.shot'] });
    expect(previewAttack(s, 'monster:rat:1', 'hero:alpha', content)).toMatchObject({ value: 2, damage: 2 });
    expect(previewAttack(s, 'hero:alpha', 'monster:rat:2', content, { type: 'attack', value: 2, range: 3 })).toMatchObject({ damage: 0 });
    expect(heroOf(s, 'alpha').hp).toBe(10);
  });
});
