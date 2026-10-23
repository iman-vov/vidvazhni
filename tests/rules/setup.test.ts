import { describe, expect, it } from 'vitest';
import { coinValue, scaleMonsterStats, trapDamage, victoryXp } from '../../src/rules/effects/context';
import { createGame } from '../../src/rules/engine';
import { scenarioLevel, spawnKey } from '../../src/rules/setup';
import type { MonsterState } from '../../src/rules/state';
import { act, fillerCards, heroOf, makeContent, monsterType, newGame, rejects, setupFor } from '../helpers/engineFixtures';

describe('scenario level', () => {
  it('is ceil(average hero level / 2), ±1 for difficulty, within 0–7', () => {
    expect(scenarioLevel([1, 1], 'normal')).toBe(1);
    expect(scenarioLevel([1, 2], 'normal')).toBe(1);
    expect(scenarioLevel([3, 4], 'normal')).toBe(2);
    expect(scenarioLevel([1], 'easy')).toBe(0);
    expect(scenarioLevel([3], 'hard')).toBe(3);
    expect(scenarioLevel([9, 9], 'hard')).toBe(6);
    expect(scenarioLevel([13, 13], 'hard')).toBe(7);
  });

  it('sets trap damage, coin value and victory xp', () => {
    const content = makeContent();
    const s = newGame(content, ['alpha']);
    expect(trapDamage(s)).toBe(3);
    expect([0, 1, 2, 3, 4, 5, 6].map(coinValue)).toEqual([2, 2, 3, 3, 4, 4, 5]);
    expect(victoryXp(2)).toBe(8);
  });
});

describe('monster stats per level', () => {
  const base = { hp: 4, move: 2, attack: 2, shield: 1, retaliate: 1 };
  it('hp +25% of base per level above 1, rounded up', () => {
    expect(scaleMonsterStats(base, 1).hp).toBe(4);
    expect(scaleMonsterStats(base, 2).hp).toBe(5);
    expect(scaleMonsterStats({ ...base, hp: 3 }, 2).hp).toBe(4);
    expect(scaleMonsterStats(base, 5).hp).toBe(8);
  });
  it('attack +1 at levels 3 and 5, shield and retaliate +1 at level 4', () => {
    expect(scaleMonsterStats(base, 2).attack).toBe(2);
    expect(scaleMonsterStats(base, 3).attack).toBe(3);
    expect(scaleMonsterStats(base, 5).attack).toBe(4);
    expect(scaleMonsterStats(base, 3).shield).toBe(1);
    expect(scaleMonsterStats(base, 4).shield).toBe(2);
    expect(scaleMonsterStats(base, 4).retaliate).toBe(2);
    expect(scaleMonsterStats({ hp: 4, move: 2, attack: 2 }, 4).shield).toBeUndefined();
  });
  it('spawned monsters use the scaled stats; permanent shield is a scenario-long effect', () => {
    const content = makeContent({
      monsters: [monsterType('rat', 'tmelee', { normal: { hp: 4, move: 2, attack: 2, shield: 1 } })],
      spawns: [{ monster: 'rat', hex: [4, 2] }],
    });
    const s = createGame({ ...setupFor(content, ['alpha'], 1, 4) }, content);
    expect(s.level).toBe(2);
    const rat = s.figures['monster:rat:1'] as MonsterState;
    expect(rat.hp).toBe(5);
    expect(rat.shields).toEqual([{ value: 1, source: 'stats', until: 'scenario' }]);
  });
});

describe('spawns by hero count', () => {
  it('1 hero uses the 2-hero column', () => {
    expect([1, 2, 3, 4].map(spawnKey)).toEqual(['2', '2', '3', '4']);
    const content = makeContent({
      room: {
        spawns: [
          { monster: 'rat', hex: [4, 1], by: { '2': 'normal', '3': 'normal', '4': 'elite' } },
          { monster: 'rat', hex: [4, 2], by: { '3': 'normal', '4': 'normal' } },
        ],
      },
    });
    const one = newGame(content, ['alpha']);
    expect(Object.keys(one.figures).filter((id) => id.startsWith('monster:'))).toEqual(['monster:rat:1']);
    const two = newGame(content, ['alpha', 'beta']);
    expect(Object.keys(two.figures).filter((id) => id.startsWith('monster:'))).toHaveLength(1);
  });
});

describe('createGame', () => {
  it('reveals only the start room, places heroes, shuffles decks with the seed', () => {
    const content = makeContent();
    const s = newGame(content, ['alpha', 'beta'], 42);
    expect(s.board.revealedRooms).toEqual(['r1']);
    expect(s.board.tiles['8,0']).toBeUndefined();
    expect(heroOf(s, 'alpha').hex).toEqual([0, 2]);
    expect(heroOf(s, 'beta').hex).toEqual([0, 3]);
    expect(heroOf(s, 'alpha').modifierDeck.draw).toHaveLength(20);
    expect(s.monsterDeck.draw).toHaveLength(20);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:alpha', 'hero:beta'] });
    const again = newGame(content, ['alpha', 'beta'], 42);
    expect(again).toEqual(s);
    expect(newGame(content, ['alpha', 'beta'], 43).monsterDeck.draw).not.toEqual(s.monsterDeck.draw);
  });

  it('asks for a hand first when the class has more cards than its hand size', () => {
    const content = makeContent({ heroExtra: { alpha: { handSize: 8 } } });
    let s = newGame(content, ['alpha', 'beta']);
    expect(s.pending).toEqual({ kind: 'chooseHandBeforeScenario', heroIds: ['hero:alpha'] });
    const cards = fillerCards('alpha').map((c) => c.id);
    rejects(s, content, { type: 'chooseHand', heroId: 'hero:alpha', cards: cards.slice(0, 7) });
    s = act(s, content, { type: 'chooseHand', heroId: 'hero:alpha', cards: cards.slice(0, 8) });
    expect(heroOf(s, 'alpha').hand).toEqual(cards.slice(0, 8));
    expect(heroOf(s, 'beta').hand).toHaveLength(10);
    expect(s.pending?.kind).toBe('selectCards');
  });
});
