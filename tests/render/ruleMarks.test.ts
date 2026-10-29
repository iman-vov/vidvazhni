// What the board marks for the Act III rules (src/render/ruleMarks.ts), on the real scenarios.

import { describe, expect, it } from 'vitest';
import { turnAlly, windUpKey } from '../../src/rules/allies';
import type { Ctx } from '../../src/rules/effects/context';
import { createGame } from '../../src/rules/engine';
import { hexKey, type Hex } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { revealRoom } from '../../src/rules/setup';
import type { GameState, MonsterState } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';
import { ruleMarks, type HexTone } from '../../src/render/ruleMarks';

const content = loadContent();

/** Scenario `id` with two heroes and every room revealed. */
function game(id: string): GameState {
  const s = createGame(
    { scenarioId: id, seed: 7, heroes: ['warden', 'herbalist'].map((classId, i) => ({ classId, playerId: `p${i}`, level: 1 })), difficulty: 'normal', variants: { ...BASE_RULES } },
    content,
  );
  const scenario = content.scenarios[id]!;
  for (const room of scenario.rooms) if (!s.board.revealedRooms.includes(room.id)) revealRoom(ctx(s), scenario, room.id);
  return s;
}

const ctx = (s: GameState) => ({ s, c: content, ev: [], out: [] }) as unknown as Ctx;
const tones = (s: GameState, tone: HexTone) => ruleMarks(s, content).hexes.filter((m) => m.tone === tone).map((m) => hexKey(m.hex));
const objectAt = (s: GameState, id: string): Hex => {
  const k = Object.keys(s.board.tiles).find((x) => s.board.tiles[x]!.object?.id === id)!;
  return k.split(',').map(Number) as unknown as Hex;
};
const setState = (s: GameState, id: string, state: string) => (s.board.tiles[hexKey(objectAt(s, id))]!.object!.state = state);

describe('rule marks on the board (Act III)', () => {
  it('s11: every deep hex is marked, and a soaked figure shows «−1» until its slow turn is over', () => {
    const s = game('s11');
    const deep = Object.keys(s.board.tiles).filter((k) => s.board.tiles[k]!.terrain === 'deep');
    expect(deep.length).toBeGreaterThan(0);
    expect(tones(s, 'deep').sort()).toEqual(deep.sort());
    const hero = Object.values(s.figures).find((f) => f.kind === 'hero')!;
    hero.soakedTurn = hero.turnCount + 1;
    expect(ruleMarks(s, content).tags.get(hero.id)).toEqual([{ icon: 'move', text: '−1', tone: 'blue' }]);
    hero.turnCount += 1;
    expect(ruleMarks(s, content).tags.get(hero.id)).toBeUndefined();
  });

  it('s12: fog banks are marked, and a bank cleared by Fire or Air shows faint until it returns', () => {
    const s = game('s12');
    const fog = Object.keys(s.board.tiles).filter((k) => s.board.tiles[k]!.terrain === 'fog');
    expect(tones(s, 'fog').length).toBe(fog.length);
    s.board.tiles[fog[0]!]!.fogClearedUntil = s.round + 1;
    expect(tones(s, 'fogClear')).toEqual([fog[0]]);
    s.round += 2;
    expect(tones(s, 'fogClear')).toEqual([]);
  });

  it('s13: the pond is outlined and its chip counts the fireflies left', () => {
    const s = game('s13');
    expect(tones(s, 'pond').length).toBe(content.scenarios.s13!.zones!.find((z) => z.id === 's13.pond')!.hexes.length);
    s.goalCounter = 5;
    expect(ruleMarks(s, content).chips.map((c) => c.text)).toEqual(['5/8']);
  });

  it('s14: the row that floods next is marked with the rounds until it floods', () => {
    const s = game('s14');
    const rows = content.scenarios.s14!.rising!.rows;
    expect(tones(s, 'flood').sort()).toEqual(rows[0]!.map(hexKey).sort());
    expect(ruleMarks(s, content).chips[0]!.text).toBe('2'); // round 1, the first row floods at round 3
    s.round = 3;
    expect(tones(s, 'flood').sort()).toEqual(rows[1]!.map(hexKey).sort());
    expect(ruleMarks(s, content).chips[0]!.text).toBe('2');
    s.round = 99;
    expect(tones(s, 'flood')).toEqual([]);
  });

  it('s15: a thread runs from every standing loom to the Queen, who carries the crossed ranged mark', () => {
    const s = game('s15');
    const marks = ruleMarks(s, content);
    const queen = Object.values(s.figures).find((f) => f.kind === 'monster' && f.rank === 'boss')!;
    expect(marks.links.length).toBe(3);
    expect(marks.links.every(([, to]) => hexKey(to) === hexKey(queen.hex))).toBe(true);
    expect(marks.tags.get(queen.id)).toEqual([{ icon: 'ranged', text: '3', tone: 'violet', crossed: true }]);
  });

  it('s16: mirrors shine, a broken one turns grey', () => {
    const s = game('s16');
    expect(tones(s, 'mirror').length).toBe(8);
    setState(s, 's16.mirror-2', 'broken');
    expect(tones(s, 'mirror').length).toBe(7);
    expect(tones(s, 'broken')).toEqual([hexKey(objectAt(s, 's16.mirror-2'))]);
  });

  it('s17: sleeping automatons show «Zz»; a turned key makes one an ally with the heroes’ mark', () => {
    const s = game('s17');
    const sleepers = Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster' && !!f.asleep);
    expect(sleepers.length).toBeGreaterThan(0);
    for (const m of sleepers) expect(ruleMarks(s, content).tags.get(m.id)).toEqual([{ text: 'Zz', tone: 'violet' }]);
    expect(tones(s, 'key').length).toBe(2);
    const key = objectAt(s, 's17.lever-1');
    windUpKey(ctx(s), key);
    setState(s, 's17.lever-1', 'on');
    const marks = ruleMarks(s, content);
    expect([...marks.tags.values()].flat()).toContainEqual({ icon: 'hero', text: '', tone: 'green' });
    expect(tones(s, 'key').length).toBe(1);
  });

  it('s18: sleeping shelves show «Zz», an awake one is red with «!»; plain shelves have nothing', () => {
    const s = game('s18');
    expect(tones(s, 'asleep').length).toBe(4);
    setState(s, 's18.shelf-2', 'awake');
    expect(tones(s, 'awake')).toEqual([hexKey(objectAt(s, 's18.shelf-2'))]);
    expect(ruleMarks(s, content).chips.filter((c) => c.text === '!').length).toBe(1);
  });

  it('s19: the beam lights its mirrors gold; each turning mirror shows ✓ when it is right, else «turn me»', () => {
    const s = game('s19');
    expect(ruleMarks(s, content).chips.map((c) => c.icon)).toEqual(['rotate', 'rotate', 'rotate']);
    setState(s, 's19.mirror-1', 'lit');
    const marks = ruleMarks(s, content);
    expect(tones(s, 'lit').sort()).toEqual([objectAt(s, 's19.mirror-1'), objectAt(s, 's19.mirror-2')].map(hexKey).sort());
    expect(marks.chips.filter((c) => c.icon === 'check').length).toBe(1);
  });

  it('s20: the Guardian turned ally wears the heroes’ mark; the kept heart shows its health and the rounds left', () => {
    const s = game('s20');
    expect(tones(s, 'heart')).toEqual([]);
    const boss = Object.values(s.figures).find((f): f is MonsterState => f.kind === 'monster' && f.rank === 'boss')!;
    turnAlly(ctx(s), boss, 0);
    s.goal = { type: 'protect', object: 's20.heart', rounds: 3 };
    const marks = ruleMarks(s, content);
    expect(marks.tags.get(boss.id)).toEqual([{ icon: 'hero', text: '', tone: 'green' }]);
    expect(tones(s, 'heart').length).toBe(1);
    expect(marks.chips.map((c) => c.icon)).toEqual(['hp', 'defend-point']);
  });
});
