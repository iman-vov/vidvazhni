// Every scenario map in data/scenarios/: schema, shared cross-checks, map checks of the editor,
// the design doc tables (osnova.md «Сценарії») and a dry run through the engine's room setup.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Content, ScenarioDef } from '../../src/rules/content';
import { createGame } from '../../src/rules/engine';
import { hexKey } from '../../src/rules/hex';
import { LANGS, loadContent, loadTranslations } from '../../src/rules/load';
import { goalZone } from '../../src/rules/objectives';
import { upcomingEvents } from '../../src/rules/queries';
import { revealRoom } from '../../src/rules/setup';
import type { MonsterState } from '../../src/rules/state';
import { BASE_RULES, FULL_FORK } from '../../src/rules/variants';
import { checkAll, formatCounts, hexCount, mapIssues, schemaErrors, sightLine, spawnSummary, walkable } from '../../tools/map-editor/checks';
import { formatScenario, sealRooms, toggleWall } from '../../tools/map-editor/model';
import { checkScenario } from './crossref';

const dir = 'data/scenarios';
const texts = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), readFileSync(`${dir}/${f}`, 'utf8')]),
);
const scenarios: Record<string, ScenarioDef> = Object.fromEntries(
  Object.entries(texts).map(([id, t]) => [id, JSON.parse(t) as ScenarioDef]),
);
const base = loadContent();
const content: Content = { ...base, scenarios };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('scenario files', () => {
  it('are s1–s10, s11–s14 and s16–s20', () => {
    expect(Object.keys(scenarios).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's16', 's17', 's18', 's19', 's20']);
  });

  for (const [id, s] of Object.entries(scenarios))
    it(`${id}: schema, cross-checks and map checks pass`, () => {
      expect(schemaErrors(s)).toEqual([]);
      expect(checkScenario(s, content)).toEqual([]);
      expect(mapIssues(s, content)).toEqual([]);
      expect(s.id).toBe(id);
    });

  for (const [id, s] of Object.entries(scenarios))
    it(`${id}: is saved in the editor's format (load + save changes nothing)`, () => {
      expect(formatScenario(s)).toBe(texts[id]);
    });

  it('loadContent() serves every scenario file as it is on disk', () => {
    expect(Object.keys(base.scenarios)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's16', 's17', 's18', 's19', 's20']);
    for (const id of Object.keys(base.scenarios)) expect(base.scenarios[id]).toEqual(scenarios[id]);
  });
});

/** Design doc tables, «звичайні + елітні» for 2 / 3 / 4 heroes. */
const TABLES: Record<string, Record<string, Record<string, string>>> = {
  s2: {
    's2.forest-edge': { 'grey-wolf': '1+0 / 1+1 / 2+1', thornling: '2+0 / 2+1 / 3+1' },
    's2.ravine': { 'grey-wolf': '2+0 / 2+0 / 2+1', thornling: '0+0 / 1+0 / 1+0' },
    's2.lodge': { 'bandit-brute': '1+0 / 0+1 / 1+0', 'grey-wolf': '0+0 / 1+0 / 0+1' },
  },
  s3: {
    's3.yard': { 'bandit-crossbow': '1+0 / 1+1 / 1+1', 'bandit-brute': '1+0 / 1+1 / 2+1' },
    's3.sluice': { 'bandit-crossbow': '0+0 / 1+0 / 1+0', 'bog-slime': '1+0 / 2+0 / 2+1' },
    's3.mill-hall': { 'bog-miller': '1+0 / 1+0 / 1+0' },
  },
  s4: {
    's4.gate': { 'stone-sentinel': '1+0 / 1+0 / 1+0', gremlin: '0+0 / 1+0 / 1+1' },
    's4.barracks': { 'gloom-cultist': '2+0 / 2+0 / 2+0', 'stone-sentinel': '0+0 / 0+0 / 1+0', gremlin: '0+0 / 1+0 / 1+0' },
    's4.upper-tier': { 'shadow-wraith': '2+0 / 3+0 / 4+0', 'stone-sentinel': '0+0 / 1+0 / 0+1' },
  },
  s5: {
    's5.tunnel': { 'shadow-wraith': '0+0 / 2+1 / 3+1', 'gloom-cultist': '1+0 / 1+0 / 1+1' },
    's5.heart': { shadowhand: '1+0 / 1+0 / 1+0' },
  },
};

describe('drafts s2–s5 follow the design doc', () => {
  for (const [id, rooms] of Object.entries(TABLES))
    it(`${id}: rooms and monsters per party size match the table`, () => {
      const s = scenarios[id]!;
      expect(s.rooms.map((r) => r.id)).toEqual(Object.keys(rooms));
      const summary = spawnSummary(s);
      const got = Object.fromEntries(
        Object.entries(summary).map(([room, byMonster]) => [
          room,
          Object.fromEntries(Object.entries(byMonster).map(([m, c]) => [m, formatCounts(c)])),
        ]),
      );
      expect(got).toEqual(rooms);
    });

  for (const id of ['s2', 's3', 's4', 's5'])
    it(`${id}: is a draft of 30–90 hexes whose rooms differ in size`, () => {
      const s = scenarios[id]!;
      expect(s.draft).toBe(true);
      expect(hexCount(s)).toBeGreaterThanOrEqual(30);
      expect(hexCount(s)).toBeLessThanOrEqual(90);
      // A hall next to a closet or a corridor: the biggest room at least twice the smallest.
      const sizes = s.rooms.map((r) => r.hexes.length);
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(2 * Math.min(...sizes));
      expect(s.startHexes).toHaveLength(4);
    });

  it('s2 Тернова стежка: exit hexes for all four heroes, thorns, 2 ravine traps, potion reward', () => {
    const s = scenarios['s2']!;
    expect(s.goal.type).toBe('reachExit');
    expect(goalZone(s).length).toBeGreaterThanOrEqual(4);
    for (const h of goalZone(s)) expect(s.rooms[2]!.hexes.map(hexKey)).toContain(hexKey(h));
    expect(s.rooms.flatMap((r) => r.terrain ?? []).filter((t) => t.terrain === 'hazardous').length).toBeGreaterThanOrEqual(4);
    expect(s.rooms.flatMap((r) => r.terrain ?? []).some((t) => t.terrain === 'difficult')).toBe(true);
    expect(s.rooms.find((r) => r.id === 's2.ravine')?.traps).toHaveLength(2);
    expect(s.introduces).toEqual(expect.arrayContaining(['conditions', 'elements', 'hazardousTerrain', 'traps']));
    expect(s.reward).toEqual({ goldEach: 10, items: ['healing-potion'], unlock: ['s3'] });
  });

  it('s3 Затоплений млин: boss, water in the hall, sluice lever, millstones infuse Earth each round', () => {
    const s = scenarios['s3']!;
    expect(s.goal).toEqual({ type: 'killBoss', boss: 'bog-miller' });
    const hall = s.rooms.find((r) => r.id === 's3.mill-hall')!;
    expect((hall.terrain ?? []).filter((t) => t.terrain === 'water').length).toBeGreaterThanOrEqual(5);
    const lever = s.rooms.find((r) => r.id === 's3.sluice')?.objects?.find((o) => o.kind === 'lever');
    expect(lever).toMatchObject({ id: 's3.sluice-lever', blocks: true });
    expect(hall.objects?.find((o) => o.kind === 'millstone')?.id).toBe('s3.millstones');
    expect(s.forkOrbs).toEqual({ eachRound: [{ orb: 'earth', source: 's3.millstones' }] });
    expect(s.specials).toEqual(['millSluice']);
    expect(s.reward.goldEach).toBe(15);
  });

  it('s4 Стара сторожова вежа: locked tier, key from the last cultist, runes, carry the shard back', () => {
    const s = scenarios['s4']!;
    const [gate, barracks, tier] = s.rooms;
    expect(barracks?.doors).toEqual([{ hex: expect.any(Array), to: 's4.upper-tier', key: 'tower-key' }]);
    expect(barracks?.drops).toEqual([{ monster: 'gloom-cultist', questItem: 'tower-key' }]);
    expect(barracks?.objects?.filter((o) => o.kind === 'rune').length).toBeGreaterThanOrEqual(2);
    expect(tier?.chests?.[0]?.loot?.questItem).toBe('lantern-shard-2');
    expect(s.goal).toMatchObject({ type: 'carryItem', item: 'lantern-shard-2' });
    for (const h of goalZone(s)) expect(gate?.hexes.map(hexKey)).toContain(hexKey(h));
    expect(s.reward).toEqual({ goldEach: 15, unlock: ['s5'] });
  });

  it('s5 Серце Мороку: three unlit braziers around Тінерук, Fire and Air orbs at the start', () => {
    const s = scenarios['s5']!;
    expect(s.goal).toEqual({ type: 'killBoss', boss: 'shadowhand' });
    const braziers = s.rooms[1]?.objects?.filter((o) => o.kind === 'brazier') ?? [];
    expect(braziers).toHaveLength(3);
    for (const b of braziers) expect(b).toMatchObject({ state: 'unlit', blocks: true });
    expect(s.forkOrbs).toEqual({ atStart: [{ orb: 'fire' }, { orb: 'air' }] });
    expect(content.bosses['shadowhand']?.special).toEqual(['secondPhase']);
    expect(s.reward.goldEach).toBe(25);
  });
});

describe('demo scenario events', () => {
  const party = (id: string) =>
    createGame({ scenarioId: id, seed: 1, heroes: ['warden', 'herbalist'].map((classId, i) => ({ classId, playerId: `p${i}`, level: 1 })), difficulty: 'normal', variants: { ...BASE_RULES } }, content);

  it('every scenario has one; the barrel ambush is a surprise, the rest are warned in the intents', () => {
    for (const id of ['s1', 's2', 's3', 's4', 's5']) expect(scenarios[id]!.events ?? [], id).toHaveLength(1);
    expect(upcomingEvents(party('s1'), content)).toEqual([]);
    expect(upcomingEvents(party('s2'), content).map((w) => [w.eventId, w.kind])).toEqual([['s2.howl', 'call']]);
    expect(upcomingEvents(party('s3'), content)).toMatchObject([{ eventId: 's3.wave', kind: 'wave', round: 4 }]);
    expect(upcomingEvents(party('s5'), content)).toMatchObject([{ eventId: 's5.pulse', kind: 'wave', round: 4 }]);
    // The bell runner shows once the barracks are open.
    const s4 = party('s4');
    revealRoom({ s: s4, c: content, ev: [], out: [] }, scenarios['s4']!, 's4.barracks');
    expect(upcomingEvents(s4, content)).toMatchObject([{ eventId: 's4.alarm', kind: 'alarm', hex: [10, -3] }]);
  });
});

describe('scenario texts', () => {
  it('every scenario has names, briefings, rooms, rules, specials and objects in uk, de and en', () => {
    const tables = loadTranslations();
    const need: string[] = [];
    for (const s of Object.values(scenarios)) {
      need.push(`scenario.${s.id}`, `scenario.${s.id}.goal`, `scenario.${s.id}.intro`, `scenario.${s.id}.outro`);
      need.push(`goal.type.${s.goal.type}`);
      for (const i of s.introduces) need.push(`introduces.${i}`);
      for (const sp of s.specials ?? []) need.push(`scenarioSpecial.${sp}`);
      for (const room of s.rooms) {
        need.push(`room.${room.id}`);
        for (const chest of room.chests ?? []) if (chest.loot?.questItem) need.push(`questItem.${chest.loot.questItem}`);
        for (const d of room.drops ?? []) need.push(`questItem.${d.questItem}`);
        for (const o of room.objects ?? []) need.push(`object.${o.kind}`);
      }
    }
    for (const lang of LANGS) expect(need.filter((k) => !tables[lang][k]), lang).toEqual([]);
  });
});

describe('every scenario runs through the engine setup', () => {
  for (const id of Object.keys(scenarios))
    for (const heroes of [1, 2, 3, 4])
      it(`${id} with ${heroes} hero(es): every room reveals with the table's monsters`, () => {
        const classes = ['warden', 'wind-archer', 'herbalist', 'rogue'].slice(0, heroes);
        for (const variants of [BASE_RULES, FULL_FORK]) {
          const s = createGame(
            {
              scenarioId: id,
              seed: 7,
              heroes: classes.map((classId, i) => ({ classId, playerId: `p${i}`, level: 1 })),
              difficulty: 'normal',
              variants: { ...variants },
            },
            content,
          );
          const scenario = scenarios[id]!;
          for (const room of scenario.rooms) revealRoom({ s, c: content, ev: [], out: [] }, scenario, room.id);
          expect(s.board.revealedRooms).toHaveLength(scenario.rooms.length);
          expect(Object.keys(s.board.tiles)).toHaveLength(hexCount(scenario));
          const key = String(Math.max(2, heroes)) as '2' | '3' | '4';
          const expected = scenario.rooms.flatMap((r) => (r.spawns ?? []).filter((sp) => sp.by[key]));
          const monsters = Object.values(s.figures).filter((f): f is MonsterState => f.kind === 'monster');
          expect(monsters).toHaveLength(expected.length);
          // No figure starts on top of another.
          const hexes = Object.values(s.figures).map((f) => hexKey(f.hex));
          expect(new Set(hexes).size).toBe(hexes.length);
        }
      });
});

describe('map editor model and checks', () => {
  it('flags a broken map: missing key source, unreachable spawn, door to nowhere', () => {
    const s = clone(scenarios['s4']!);
    delete s.rooms[1]!.drops;
    const issues = checkAll(s, content).map((i) => i.msg);
    expect(issues).toContainEqual(expect.stringContaining('needs key tower-key'));

    const t = clone(scenarios['s2']!);
    t.rooms[0]!.doors![0]!.to = 's2.nowhere';
    expect(checkAll(t, content).map((i) => i.msg)).toContainEqual(expect.stringContaining('missing room s2.nowhere'));

    const u = clone(scenarios['s1']!);
    // Wall the start room's door shut: the cellar is no longer reachable on foot.
    const door = u.rooms[0]!.doors![0]!.hex;
    for (const room of u.rooms)
      for (const h of room.hexes)
        if (Math.abs(h[0] - door[0]) + Math.abs(h[1] - door[1]) + Math.abs(h[0] + h[1] - door[0] - door[1]) === 2 && room.id === u.startRoom)
          toggleWall(u, h, door);
    expect(walkable(u).has(hexKey(door))).toBe(false);
    expect(mapIssues(u, content).some((i) => i.level === 'error' && i.msg.includes('cannot be reached'))).toBe(true);
  });

  it('seals room borders except at doors, which is what the cross-checks want', () => {
    const s = clone(scenarios['s1']!);
    // Fill the left-out strip beside the door: the pantry now touches the cellar with no wall.
    s.rooms[0]!.hexes.push([3, 0]);
    for (const room of s.rooms) delete room.walls;
    expect(checkScenario(s, content).length).toBeGreaterThan(0);
    expect(sealRooms(s)).toBeGreaterThan(0);
    expect(checkScenario(s, content)).toEqual([]);
    expect(sealRooms(s)).toBe(0);
  });

  it('line of sight uses the engine rule (src/rules/los.ts)', () => {
    // Two hexes alone: the thin wall between them blocks.
    const pair: ScenarioDef = { ...clone(scenarios['s1']!), rooms: [{ id: 's1.pantry', hexes: [[0, 0], [1, 0]] }] };
    expect(sightLine(pair, [0, 0], [1, 0])).toBe(true);
    toggleWall(pair, [0, 0], [1, 0]);
    expect(sightLine(pair, [0, 0], [1, 0])).toBe(false);
    // s1: open floor inside the pantry; the left-out strip between pantry and cellar blocks.
    expect(sightLine(scenarios['s1']!, [0, 0], [2, 2])).toBe(true);
    expect(sightLine(scenarios['s1']!, [0, 0], [4, -2])).toBe(false);
  });
});
