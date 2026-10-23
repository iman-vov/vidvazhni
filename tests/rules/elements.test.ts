import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../src/rules/content';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  finishRound,
  heroOf,
  makeContent,
  newGame,
  playHalf,
  rejects,
  selectAll,
  stackBehaviour,
  stackModifiers,
  takeAllDamage,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card(
    'e.fire',
    10,
    [{ type: 'attack', value: 2, consume: { element: 'fire', add: { value: 2 } } }],
    [{ type: 'infuse', element: 'fire' }],
  ),
  card(
    'e.any',
    20,
    [{ type: 'infuse', element: 'any' }],
    [{ type: 'move', value: 2, consume: { element: 'earth', add: { move: 1 }, then: [{ type: 'shield', value: 1, target: 'self', duration: 'round' }] } }],
  ),
  card('e.storm', 30, [{ type: 'attack', value: 1, consume: { element: 'any', count: 2, add: { value: 3 } } }], [{ type: 'move', value: 1 }]),
  ...fillerCards('e', 7),
];

const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];

function game(decks = [{ id: 'tmelee', cards: IDLE }]) {
  const content = makeContent({ heroes: { alpha: CARDS }, decks, spawns: [{ monster: 'rat', hex: [1, 2] }] });
  const s = newGame(content, ['alpha']);
  stackModifiers(s, 'alpha', Array<string>(6).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(6).fill('+0'));
  return { content, s };
}

describe('elements', () => {
  it('infuse makes the element strong at the end of the turn, not before', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['e.fire', 'e.any'] });
    s = playHalf(s, content, 'alpha', 'e.fire', 'bottom', [{}]);
    expect(s.elements.fire).toBe('inert');
    expect(s.pendingInfusions).toEqual(['fire']);
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'e.any', half: 'top' });
    rejects(s, content, { type: 'resolveStep', choice: {} });
    s = act(s, content, { type: 'resolveStep', choice: { element: 'air' } });
    s = endTurn(s, content, 'alpha');
    expect(eventsOf(s.log, 'elementChanged').slice(0, 2)).toEqual([
      { type: 'elementChanged', element: 'fire', level: 'strong' },
      { type: 'elementChanged', element: 'air', level: 'strong' },
    ]);
  });

  it('strong → waning → inert over two round ends', () => {
    const { content, s: s0 } = game();
    s0.elements.earth = 'strong';
    let s = finishRound(selectAll(s0, content, { alpha: ['e.c1', 'e.c2'] }), content);
    expect(s.elements.earth).toBe('waning');
    s = finishRound(selectAll(s, content, { alpha: ['e.c3', 'e.c4'] }), content);
    expect(s.elements.earth).toBe('inert');
  });

  it('consuming a strong or waning element adds the bonus and makes it inert', () => {
    const { content, s: s0 } = game();
    s0.elements.fire = 'waning';
    let s = selectAll(s0, content, { alpha: ['e.fire', 'e.any'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'e.fire', half: 'top' });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 4, damage: 4 });
    expect(s.elements.fire).toBe('inert');
  });

  it('consuming an inert element is rejected; without consume the step works as written', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['e.fire', 'e.any'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'e.fire', half: 'top' });
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true } });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 2 });
  });

  it('a consume bonus can add movement and follow-up steps', () => {
    const { content, s: s0 } = game();
    s0.elements.earth = 'strong';
    heroOf(s0, 'alpha').hex = [0, 4];
    let s = selectAll(s0, content, { alpha: ['e.fire', 'e.any'] });
    s = playHalf(s, content, 'alpha', 'e.any', 'bottom', [{ path: [[1, 4], [2, 4], [3, 4]], consume: true }]);
    expect(heroOf(s, 'alpha').hex).toEqual([3, 4]);
    expect(heroOf(s, 'alpha').shields).toEqual([{ value: 1, source: 'card:e.any', until: 'round' }]);
  });

  it('consume of two «any» elements needs two different available ones', () => {
    const { content, s: s0 } = game();
    s0.elements.ice = 'strong';
    s0.elements.dark = 'waning';
    let s = selectAll(s0, content, { alpha: ['e.storm', 'e.any'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'e.storm', half: 'top' });
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true, elements: ['ice', 'fire'] } });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true, elements: ['ice', 'dark'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 4 });
    expect([s.elements.ice, s.elements.dark]).toEqual(['inert', 'inert']);
  });

  it('monsters infuse at the end of their turn and consume when the element is there', () => {
    const decks = [
      {
        id: 'tmelee',
        cards: [
          {
            id: 'm.5',
            initiative: 5,
            steps: [
              { type: 'attack', value: 0, consume: { element: 'dark', add: { value: 2 } } },
              { type: 'infuse', element: 'earth' },
            ],
          },
        ] as MonsterCard[],
      },
    ];
    const { content, s: s0 } = game(decks);
    s0.elements.dark = 'strong';
    stackBehaviour(s0, 'rat', ['m.5']);
    let s = act(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['e.c1', 'e.c2'], leading: 'e.c1' });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ attackerId: 'monster:rat:1', base: 4 });
    s = takeAllDamage(s, content);
    expect(s.elements).toMatchObject({ dark: 'inert', earth: 'strong' });
  });
});
