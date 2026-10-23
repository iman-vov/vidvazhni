import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../../src/rules/content';
import { createGame } from '../../../src/rules/engine';
import { orbBonusPreview } from '../../../src/rules/queries';
import {
  act,
  card,
  endTurn,
  eventsOf,
  fillerCards,
  finishRound,
  makeContent,
  playHalf,
  rejects,
  selectAll,
  stackModifiers,
} from '../../helpers/engineFixtures';
import { forkGame, forkSetup } from './fixtures';

function cardsFor(p: string): HeroCard[] {
  return [
    card(`${p}.fire`, 10, [{ type: 'attack', value: 2, consume: { element: 'fire', add: { value: 2 } } }], [{ type: 'infuse', element: 'fire' }]),
    card(`${p}.any`, 20, [{ type: 'infuse', element: 'any' }], [{ type: 'move', value: 2, consume: { element: 'earth', add: { move: 1 } } }]),
    card(`${p}.fork`, 30, [{ type: 'infuse', element: 'ice' }], [{ type: 'move', value: 1 }], {
      fork: { initiative: 5, top: { steps: [{ type: 'infuse', element: 'earth' }] } },
    }),
    card(`${p}.trans`, 40, [{ type: 'special', name: 'transmuteOrb' }], [{ type: 'move', value: 1 }]),
    card(`${p}.boots`, 50, [{ type: 'attack', value: 1 }], [{ type: 'move', value: 2, consume: { element: 'earth', add: { move: 1 } } }]),
    ...fillerCards(p, 5),
  ];
}

const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const ORB_MONSTER: MonsterCard[] = [
  {
    id: 'orb.05',
    initiative: 5,
    steps: [
      { type: 'infuse', element: 'fire' },
      { type: 'move', value: 0 },
      { type: 'attack', value: 0, consume: { element: 'fire', add: { value: 5 } } },
    ],
  },
];

function content(opts: { cards?: MonsterCard[]; startHexes?: [number, number][]; beta?: HeroCard[] } = {}) {
  return makeContent({
    heroes: { alpha: cardsFor('a'), beta: opts.beta ?? cardsFor('b') },
    decks: [{ id: 'tmelee', cards: opts.cards ?? IDLE }],
    spawns: [{ monster: 'rat', hex: [1, 2] }],
    ...(opts.startHexes ? { startHexes: opts.startHexes } : {}),
  });
}

function game(c: ReturnType<typeof content>, heroes = ['alpha'], orbs = true) {
  const s = forkGame(c, { orbs }, heroes);
  for (const h of heroes) stackModifiers(s, h, Array<string>(8).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(8).fill('+0'));
  return s;
}

describe('fork «Три стихії-сфери» (orbs)', () => {
  it('infusing puts the orb above the infuser at once; the six elements stay inert', () => {
    const c = content();
    let s = selectAll(game(c), c, { alpha: ['a.fire', 'a.any'] });
    s = playHalf(s, c, 'alpha', 'a.fire', 'bottom', [{}]);
    expect(s.orbs.fire).toEqual({ ownerId: 'hero:alpha', age: 0 });
    expect(eventsOf(s.log, 'orbInfused')).toEqual([{ type: 'orbInfused', orb: 'fire', ownerId: 'hero:alpha' }]);
    expect(s.pendingInfusions).toEqual([]);
    expect(s.elements.fire).toBe('inert');
    // `any` means one of the three orbs; ice, light and dark do not exist.
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.any', half: 'top' });
    rejects(s, c, { type: 'resolveStep', choice: { element: 'ice' } });
    s = act(s, c, { type: 'resolveStep', choice: { element: 'air' } });
    s = endTurn(s, c, 'alpha');
    expect(Object.keys(s.orbs).sort()).toEqual(['air', 'fire']);
    expect(eventsOf(s.log, 'elementChanged')).toEqual([]);
  });

  it('one orb per kind: infusing it again refreshes it and moves it to the new infuser; consume works from anywhere', () => {
    const c = content({ startHexes: [[0, 2], [5, 4]] });
    let s = game(c, ['alpha', 'beta']);
    s = selectAll(s, c, { alpha: ['a.fire', 'a.any'], beta: ['b.any', 'b.boots'] });
    s = playHalf(s, c, 'alpha', 'a.fire', 'bottom', [{}]);
    s = playHalf(s, c, 'alpha', 'a.any', 'top', [{ element: 'earth' }]);
    s = endTurn(s, c, 'alpha');
    s.orbs.fire!.age = 1;
    s = playHalf(s, c, 'beta', 'b.any', 'top', [{ element: 'fire' }]);
    expect(s.orbs.fire).toEqual({ ownerId: 'hero:beta', age: 0 });
    // Beta is 5 hexes from the earth orb's owner and still consumes it: Рух 2 + 1.
    s = playHalf(s, c, 'beta', 'b.boots', 'bottom', [{ path: [[4, 4], [3, 4], [2, 4]], consume: true }]);
    expect(s.figures['hero:beta']!.hex).toEqual([2, 4]);
    expect(s.orbs.earth).toBeUndefined();
    expect(eventsOf(s.log, 'orbConsumed')).toEqual([{ type: 'orbConsumed', orb: 'earth', byId: 'hero:beta', fromId: 'hero:alpha' }]);
  });

  it('a dimmed orb can still be consumed; the bonus is added to the step', () => {
    const c = content();
    const s0 = game(c);
    s0.orbs.fire = { ownerId: 'hero:alpha', age: 1 };
    let s = selectAll(s0, c, { alpha: ['a.fire', 'a.any'] });
    s = playHalf(s, c, 'alpha', 'a.fire', 'top', [{ targets: ['monster:rat:1'], consume: true }]);
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 4, damage: 4 });
    expect(s.orbs.fire).toBeUndefined();
    // Without an orb the consume choice is refused.
    const t = selectAll(game(c), c, { alpha: ['a.fire', 'a.any'] });
    const u = act(t, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.fire', half: 'top' });
    expect(rejects(u, c, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], consume: true } })).toBe('element not available');
  });

  it('an orb dims at the end of its first round and goes out at the end of the second', () => {
    const c = content();
    const s0 = game(c);
    s0.orbs.earth = { ownerId: 'hero:alpha', age: 0 };
    let s = finishRound(selectAll(s0, c, { alpha: ['a.c1', 'a.c2'] }), c);
    expect(s.orbs.earth).toEqual({ ownerId: 'hero:alpha', age: 1 });
    expect(eventsOf(s.log, 'orbDimmed')).toEqual([{ type: 'orbDimmed', orb: 'earth' }]);
    s = finishRound(selectAll(s, c, { alpha: ['a.c3', 'a.c4'] }), c);
    expect(s.orbs.earth).toBeUndefined();
    expect(eventsOf(s.log, 'orbExpired')).toEqual([{ type: 'orbExpired', orb: 'earth' }]);
  });

  it('monsters neither create nor consume orbs', () => {
    const c = content({ cards: ORB_MONSTER });
    const s0 = game(c);
    s0.orbs.fire = { ownerId: 'hero:alpha', age: 0 };
    const s = selectAll(s0, c, { alpha: ['a.c1', 'a.c2'] });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ attackerId: 'monster:rat:1', base: 2 });
    expect(s.orbs.fire).toEqual({ ownerId: 'hero:alpha', age: 0 });
    expect(eventsOf(s.log, 'orbConsumed')).toEqual([]);
    expect(eventsOf(s.log, 'orbInfused')).toEqual([]);
    // Base rules: the same card infuses fire and consumes it when strong.
    const b0 = game(c, ['alpha'], false);
    b0.elements.fire = 'strong';
    const b = selectAll(b0, c, { alpha: ['a.c1', 'a.c2'] });
    expect(eventsOf(b.log, 'attacked')[0]).toMatchObject({ base: 7 });
  });

  it('hero cards use their fork initiative and halves only with the variant on', () => {
    const c = content();
    let s = selectAll(game(c), c, { alpha: ['a.fork', 'a.c1'] });
    expect(s.figures['hero:alpha']).toMatchObject({ initiative: 5 });
    s = playHalf(s, c, 'alpha', 'a.fork', 'top', [{}]);
    expect(s.orbs.earth).toEqual({ ownerId: 'hero:alpha', age: 0 });

    let b = selectAll(game(c, ['alpha'], false), c, { alpha: ['a.fork', 'a.c1'] });
    expect(b.figures['hero:alpha']).toMatchObject({ initiative: 30 });
    b = playHalf(b, c, 'alpha', 'a.fork', 'top', [{}]);
    expect(b.pendingInfusions).toEqual(['ice']);
  });

  it('scenario orbs: at the start and again every round', () => {
    const c = content();
    c.scenarios.test!.forkOrbs = { atStart: [{ orb: 'air', hex: [3, 3] }], eachRound: [{ orb: 'earth', source: 'millstones' }] };
    const s0 = game(c);
    expect(s0.orbs).toEqual({ air: { ownerId: 'scenario', age: 0, hex: [3, 3] }, earth: { ownerId: 'millstones', age: 0 } });
    const s = finishRound(selectAll(s0, c, { alpha: ['a.c1', 'a.c2'] }), c);
    expect(s.round).toBe(2);
    expect(s.orbs).toEqual({ air: { ownerId: 'scenario', age: 1, hex: [3, 3] }, earth: { ownerId: 'millstones', age: 0 } });
    expect(createGame(forkSetup(c, {}, ['alpha']), c).orbs).toEqual({});
  });

  it('Перетворення: an orb becomes another kind with a fresh life, above the transmuter', () => {
    const c = content();
    const s0 = game(c);
    s0.orbs.fire = { ownerId: 'hero:beta', age: 1 };
    let s = selectAll(s0, c, { alpha: ['a.trans', 'a.c1'] });
    s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'a.trans', half: 'top' });
    rejects(s, c, { type: 'resolveStep', choice: { element: 'fire' } });
    s = act(s, c, { type: 'resolveStep', choice: { element: 'air' } });
    expect(s.orbs).toEqual({ air: { ownerId: 'hero:alpha', age: 0 } });
  });

  it('orbBonusPreview: present orbs, infusions of heroes acting earlier, and the numbers', () => {
    const beta = [card('b.burn', 5, [{ type: 'attack', value: 1 }], [{ type: 'infuse', element: 'fire' }]), ...fillerCards('b', 9)];
    const c = content({ beta });
    let s = game(c, ['alpha', 'beta']);
    s = act(s, c, { type: 'selectCards', heroId: 'hero:beta', cards: ['b.burn', 'b.c1'], leading: 'b.burn' });
    const preview = orbBonusPreview(s, c, 'hero:alpha');
    expect(preview.find((p) => p.cardId === 'a.fire')).toEqual({
      cardId: 'a.fire',
      half: 'top',
      stepIndex: 0,
      stepType: 'attack',
      element: 'fire',
      count: 1,
      available: true,
      now: false,
      from: ['hero:beta'],
      value: 2,
      boosted: 4,
    });
    expect(preview.find((p) => p.cardId === 'a.any')).toMatchObject({ element: 'earth', available: false, now: false, from: [], value: 2, boosted: 3 });
    s.orbs.earth = { ownerId: 'scenario', age: 1 };
    expect(orbBonusPreview(s, c, 'hero:alpha').find((p) => p.cardId === 'a.any')).toMatchObject({ available: true, now: true });
  });
});
