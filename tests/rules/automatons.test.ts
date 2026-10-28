// Sleeping monsters (sleep.ts) and automatonHelpers (s17, allies.ts): a wind-up key turns the
// nearest sleeper into an ally and wakes the others near it.

import { describe, expect, it } from 'vitest';
import type { Content } from '../../src/rules/content';
import { takeDamage } from '../../src/rules/damage';
import type { Hex } from '../../src/rules/hex';
import type { GameState, MonsterState, SummonState } from '../../src/rules/state';
import { act, eventsOf, finishRound, makeContent, monsterType, newGame, selectAll } from '../helpers/engineFixtures';

const KEY: Hex = [1, 2];

/** Alpha next to the key; rats asleep at `sleepers`, awake at `awake`. */
function fixture(sleepers: Hex[], awake: Hex[] = [], specials = ['automatonHelpers']): Content {
  return makeContent({
    monsters: [monsterType('rat', 'trat', { normal: { hp: 4, move: 2, attack: 2 } })],
    decks: [{ id: 'trat', cards: [{ id: 'rat.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }] }],
    spawns: [...sleepers.map((hex) => ({ monster: 'rat', hex })), ...awake.map((hex) => ({ monster: 'rat', hex }))],
    room: { objects: [{ hex: KEY, id: 'key', kind: 'wind-up-key', state: 'off', blocks: true, interact: { half: 'bottom', to: 'on' } }] },
    scenario: { specials },
  });
}

function game(c: Content, sleepers: number): GameState {
  const s = newGame(c);
  for (let n = 1; n <= sleepers; n++) (s.figures[`monster:rat:${n}`] as MonsterState).asleep = true;
  return s;
}

function windUp(c: Content, s0: GameState): GameState {
  s0.figures['hero:alpha']!.hex = [0, 2];
  const s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
  return act(s, c, { type: 'interact', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'bottom', objectId: 'key' });
}

const rat = (s: GameState, n: number) => s.figures[`monster:rat:${n}`];

describe('asleep', () => {
  it('a sleeping monster skips its turns; damage wakes it', () => {
    const c = fixture([[1, 3]]);
    let s = game(c, 1);
    s.figures['hero:alpha']!.hex = [0, 3];
    s = finishRound(selectAll(s, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] }), c);
    expect(s.figures['hero:alpha']!.hp).toBe(s.figures['hero:alpha']!.maxHp);
    const ctx = { s, c, ev: [], out: [] };
    takeDamage(ctx, rat(s, 1)!, 1, 'test');
    expect((rat(s, 1) as MonsterState).asleep).toBeUndefined();
    expect(eventsOf(ctx.ev, 'monsterWoke')).toHaveLength(1);
  });

  it('the spawn field puts it to sleep', () => {
    const c = fixture([]);
    c.scenarios.test!.rooms[0]!.spawns = [{ monster: 'rat', hex: [4, 4], by: { '2': 'normal' }, asleep: true }];
    expect((rat(newGame(c), 1) as MonsterState).asleep).toBe(true);
  });
});

describe('automatonHelpers', () => {
  it('a wind-up key winds the nearest sleeper onto the heroes side and wakes the others within 2', () => {
    const c = fixture([[2, 2], [3, 2], [6, 4]]);
    const s = windUp(c, game(c, 3));
    expect(s.board.tiles['1,2']?.object?.state).toBe('on');
    expect(rat(s, 1)).toMatchObject({ kind: 'summon', monsterType: 'rat', npc: { fights: true }, move: 2, attack: 2, hp: 4 });
    expect((rat(s, 2) as MonsterState).asleep).toBeUndefined();
    expect((rat(s, 3) as MonsterState).asleep).toBe(true);
  });

  it('the helper fights the monsters on its own turn', () => {
    const c = fixture([[2, 2], [3, 2]]);
    let s = finishRound(windUp(c, game(c, 2)), c);
    s = finishRound(selectAll(s, c, { alpha: ['alpha.c3', 'alpha.c4'], beta: ['beta.c3', 'beta.c4'] }), c);
    const helper = rat(s, 1) as SummonState;
    expect(helper.kind).toBe('summon');
    // It joins the order from the next round and hits the woken rat next to it.
    expect(eventsOf(s.log, 'attacked').filter((e) => e.attackerId === helper.id).map((e) => e.targetId)).toContain('monster:rat:2');
  });

  it('without the special a key only changes its state', () => {
    const c = fixture([[2, 2]], [], []);
    const s = windUp(c, game(c, 1));
    expect(rat(s, 1)?.kind).toBe('monster');
    expect((rat(s, 1) as MonsterState).asleep).toBe(true);
  });
});
