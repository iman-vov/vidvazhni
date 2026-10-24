import { describe, expect, it } from 'vitest';
import { forecastInitiative } from '../../../src/rules/queries';
import type { Variants } from '../../../src/rules/variants';
import { act, card, fillerCards, makeContent, MELEE_CARDS, monsterType } from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

function game(variants: Partial<Variants>) {
  const c = makeContent({
    heroes: {
      alpha: [card('alpha.quick', 40, [{ type: 'attack', value: 2 }], [{ type: 'move', value: 2 }], { fork: { initiative: 5 } }), ...fillerCards('alpha', 9)],
      beta: fillerCards('beta'),
    },
    monsters: [monsterType('rat', 'tmelee', { forkCards: [{ id: 'rat.fast', initiative: 25, steps: [{ type: 'attack', value: 0 }] }] })],
    decks: [{ id: 'tmelee', cards: MELEE_CARDS }],
    spawns: [{ monster: 'rat', hex: [4, 2] }],
  });
  let s = forkGame(c, variants, ['alpha', 'beta']);
  if (variants.threeIntents) {
    const deck = s.behaviourDecks.rat!;
    deck.draw = [];
    deck.intents = ['tmelee.50', 'tmelee.60', 'rat.fast'];
  }
  s = act(s, c, { type: 'selectCards', heroId: 'hero:beta', cards: ['beta.c2', 'beta.c4'], leading: 'beta.c2' });
  return { c, s };
}

describe('fork «Прогноз раунду» (roundForecast)', () => {
  it('off: no forecast', () => {
    const { c, s } = game({});
    expect(forecastInitiative(s, c, 'hero:alpha', 'alpha.c3')).toBeNull();
  });

  it('the hero’s place among allies that chose and the three intents of every monster type', () => {
    const { c, s } = game({ roundForecast: true, threeIntents: true });
    expect(forecastInitiative(s, c, 'hero:alpha', 'alpha.c3')).toEqual({
      heroId: 'hero:alpha',
      cardId: 'alpha.c3',
      initiative: 30,
      position: 1,
      order: [
        { kind: 'hero', figureId: 'hero:beta', initiative: 20 },
        { kind: 'monsterIntent', typeId: 'rat', cardId: 'rat.fast', initiative: 25 },
        { kind: 'hero', figureId: 'hero:alpha', initiative: 30, self: true },
        { kind: 'monsterIntent', typeId: 'rat', cardId: 'tmelee.50', initiative: 50 },
        { kind: 'monsterIntent', typeId: 'rat', cardId: 'tmelee.60', initiative: 60 },
      ],
      monsters: [
        {
          typeId: 'rat',
          intents: [
            { cardId: 'tmelee.50', initiative: 50, heroFirst: true },
            { cardId: 'tmelee.60', initiative: 60, heroFirst: true },
            { cardId: 'rat.fast', initiative: 25, heroFirst: false },
          ],
        },
      ],
      events: [],
    });
    // Equal initiative: heroes act first.
    const tie = forecastInitiative(s, c, 'hero:alpha', 'alpha.c5');
    expect(tie?.monsters[0]?.intents?.[0]).toEqual({ cardId: 'tmelee.50', initiative: 50, heroFirst: true });
    expect(tie?.order.map((e) => (e.kind === 'hero' ? e.figureId : e.cardId))).toEqual(['hero:beta', 'rat.fast', 'hero:alpha', 'tmelee.50', 'tmelee.60']);
    expect(forecastInitiative(s, c, 'hero:alpha', 'beta.c1')).toBeNull();
  });

  it('without intents the monster cards are unknown; the orbs fork initiative is used', () => {
    const { c, s } = game({ roundForecast: true, orbs: true });
    const f = forecastInitiative(s, c, 'hero:alpha', 'alpha.quick');
    expect(f).toMatchObject({ initiative: 5, position: 0, monsters: [{ typeId: 'rat', intents: null }] });
    expect(f?.order).toEqual([
      { kind: 'hero', figureId: 'hero:alpha', initiative: 5, self: true },
      { kind: 'hero', figureId: 'hero:beta', initiative: 20 },
    ]);
  });
});
