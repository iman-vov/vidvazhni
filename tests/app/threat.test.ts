// The board overlays of the round card choice: a monster's move, reach and sight, and the hero's move
// with a card half (src/app/threat.ts), built from the engine's own path and line-of-sight helpers.
import { describe, expect, it } from 'vitest';
import { allThreats, heroMove, monsterThreat } from '../../src/app/threat';
import { distance, hexKey, type Hex } from '../../src/rules/hex';
import type { LoadedContent } from '../../src/rules/load';
import type { GameState, MonsterState } from '../../src/rules/state';
import { card, fillerCards, makeContent, newGame } from '../helpers/engineFixtures';

const WALKER = [card('walk', 20, [{ type: 'attack', value: 2 }], [{ type: 'move', value: 3 }]), card('stand', 30, [{ type: 'attack', value: 1 }], [{ type: 'attack', value: 1 }]), ...fillerCards('alpha', 8)];

function game(rats: Hex[]): { s: GameState; c: LoadedContent } {
  const c = makeContent({ heroes: { alpha: WALKER, beta: fillerCards('beta') }, spawns: rats.map((hex) => ({ monster: 'rat', hex })) }) as LoadedContent;
  return { s: newGame(c), c };
}

const rat = (s: GameState, hex: Hex) => Object.values(s.figures).find((f): f is MonsterState => f.kind === 'monster' && hexKey(f.hex) === hexKey(hex))!;
const keys = (hexes: Hex[]) => new Set(hexes.map(hexKey));

describe('monster threat while choosing cards', () => {
  it('uses the base move and attack while the card is not revealed', () => {
    const { s, c } = game([[4, 2]]);
    const t = monsterThreat(s, c, rat(s, [4, 2]));
    expect(t.known).toBe(false);
    expect(t.move).toBe(2);
    expect(t.range).toBe(1);
    expect(t.reach.every((r) => r.cost <= 2 && distance(r.hex, [4, 2]) <= 2)).toBe(true);
    expect(t.reach.some((r) => r.cost === 2)).toBe(true);
    // Melee: every threatened hex is next to a hex it can reach.
    const reach = t.reach.map((r) => r.hex);
    expect(t.threatened.length).toBeGreaterThan(reach.length);
    expect(t.threatened.every((h) => reach.some((r) => distance(r, h) === 1))).toBe(true);
  });

  it('marks the heroes it sees and the ones it can hit this round', () => {
    const { s, c } = game([[2, 2]]);
    const t = monsterThreat(s, c, rat(s, [2, 2]));
    const byHex = new Map(t.heroes.map((x) => [hexKey(x.hex), x]));
    // Heroes start on the q = 0 column: [0, 2] is two hexes away (one step and a hit).
    expect(byHex.get(hexKey([0, 2]))).toMatchObject({ sight: true, hit: true });
    expect(t.heroes.every((x) => x.sight)).toBe(true);
    const far = game([[6, 0]]);
    expect(monsterThreat(far.s, far.c, rat(far.s, [6, 0])).heroes.some((x) => x.hit)).toBe(false);
  });

  it('follows the revealed card and conditions', () => {
    const { s, c } = game([[4, 2]]);
    const m = rat(s, [4, 2]);
    const revealed: GameState = { ...s, behaviourDecks: { ...s.behaviourDecks, rat: { ...s.behaviourDecks['rat']!, current: 'tmelee.50' } } };
    const t = monsterThreat(revealed, c, m);
    expect(t.known).toBe(true);
    expect(t.steps.map((st) => st.type)).toEqual(['move', 'attack']);
    const stuck = monsterThreat(s, c, { ...m, conditions: { immobilize: true } } as unknown as MonsterState);
    expect(stuck.move).toBe(0);
    expect(stuck.reach).toEqual([{ hex: m.hex, cost: 0 }]);
    const disarmed = monsterThreat(s, c, { ...m, conditions: { disarm: true } } as unknown as MonsterState);
    expect(disarmed.attack).toBeNull();
    expect(disarmed.threatened).toEqual([]);
  });

  it('«Усі загрози» is the union of every monster', () => {
    const { s, c } = game([[4, 0], [4, 4]]);
    const all = keys(allThreats(s, c));
    for (const hex of [[4, 0], [4, 4]] as Hex[]) for (const h of monsterThreat(s, c, rat(s, hex)).threatened) expect(all.has(hexKey(h))).toBe(true);
  });
});

describe('hero move preview', () => {
  it('reads the half: its own move, the default «Рух 2» on a bottom without one, none on a top without one', () => {
    const { s, c } = game([[6, 4]]);
    const hero = Object.values(s.figures).find((f) => f.kind === 'hero' && f.classId === 'alpha')!;
    const bottom = heroMove(s, c, hero.id, 'walk', 'bottom')!;
    expect(bottom).toMatchObject({ move: 3, fallback: false });
    expect(bottom.reach.length).toBeGreaterThan(0);
    expect(bottom.reach.every((r) => r.cost >= 1 && r.cost <= 3 && hexKey(r.hex) !== hexKey(hero.hex))).toBe(true);
    expect(heroMove(s, c, hero.id, 'walk', 'top')).toMatchObject({ move: 0, reach: [] });
    expect(heroMove(s, c, hero.id, 'stand', 'bottom')).toMatchObject({ move: 2, fallback: true });
  });
});
