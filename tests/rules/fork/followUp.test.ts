import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../../src/rules/content';
import { previewAttack } from '../../../src/rules/queries';
import type { MonsterState } from '../../../src/rules/state';
import {
  act,
  endTurn,
  eventsOf,
  finishRound,
  makeContent,
  playHalf,
  selectAll,
  stackModifiers,
} from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const RAT = 'monster:rat:1';

function game(followUp: boolean) {
  const c = makeContent({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [1, 2], rank: 'elite' }] });
  const s = forkGame(c, { followUp }, ['alpha', 'beta']);
  for (const h of ['alpha', 'beta']) stackModifiers(s, h, Array<string>(8).fill('+0'));
  return { c, s };
}

/** Round 1: alpha (10) attacks the rat, then beta (20) attacks it. */
function bothAttack(followUp: boolean, betaModifier = '+0') {
  const { c, s: s0 } = game(followUp);
  stackModifiers(s0, 'beta', [betaModifier]);
  let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c3'], beta: ['beta.c2', 'beta.c4'] });
  s = playHalf(s, c, 'alpha', 'alpha.c1', 'top', [{ targets: [RAT] }]);
  s = endTurn(s, c, 'alpha');
  expect((s.figures[RAT] as MonsterState).attackedBy).toEqual(['hero:alpha']);
  s = act(s, c, { type: 'startHalf', heroId: 'hero:beta', cardId: 'beta.c2', half: 'top' });
  const preview = previewAttack(s, 'hero:beta', RAT, c);
  s = act(s, c, { type: 'resolveStep', choice: { targets: [RAT] } });
  return { c, s, preview };
}

describe('fork «Підхоплення» (followUp)', () => {
  it('+1 attack against an enemy another hero already attacked this round', () => {
    const { s, preview } = bothAttack(true);
    const [first, second] = eventsOf(s.log, 'attacked');
    expect(first).toMatchObject({ attackerId: 'hero:alpha', base: 2, damage: 2 });
    expect(first?.followUp).toBeUndefined();
    expect(second).toMatchObject({ attackerId: 'hero:beta', base: 3, damage: 3, followUp: true });
    expect(preview).toMatchObject({ value: 3 });
  });

  it('the bonus is added before the modifier (×2 doubles it)', () => {
    const { s } = bothAttack(true, 'x2');
    expect(eventsOf(s.log, 'attacked')[1]).toMatchObject({ base: 3, chosen: 'x2', damage: 6 });
  });

  it('off: no bonus', () => {
    const { s } = bothAttack(false);
    expect(eventsOf(s.log, 'attacked')[1]).toMatchObject({ base: 2, damage: 2 });
    expect(eventsOf(s.log, 'attacked')[1]?.followUp).toBeUndefined();
  });

  it('a hero’s own earlier attack does not count, and the record resets every round', () => {
    const { c, s: s0 } = game(true);
    let s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c3'], beta: ['beta.c2', 'beta.c4'] });
    s = playHalf(s, c, 'alpha', 'alpha.c1', 'top', [{ targets: [RAT] }]);
    expect(previewAttack(s, 'hero:alpha', RAT, c, { type: 'attack', value: 2 })).toMatchObject({ value: 2 });
    s = endTurn(s, c, 'alpha');
    s = finishRound(s, c);
    expect((s.figures[RAT] as MonsterState).attackedBy).toEqual([]);
    s = selectAll(s, c, { alpha: ['alpha.c5', 'alpha.c7'], beta: ['beta.c6', 'beta.c8'] });
    s = endTurn(s, c, 'alpha');
    s = playHalf(s, c, 'beta', 'beta.c6', 'top', [{ targets: [RAT] }]);
    expect(eventsOf(s.log, 'attacked').at(-1)).toMatchObject({ attackerId: 'hero:beta', base: 2 });
  });
});
