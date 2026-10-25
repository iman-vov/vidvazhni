// Every room is either indoors or outdoors, never in between (the user's rule after a walled marsh
// with reeds inside, s3): an interior has a built floor, walls, furniture and at most a leak puddle;
// open ground has natural ground, natural dividers and no house walls or house furniture.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RoomKind, ScenarioDef, SurfaceId } from '../../src/rules/content';
import { dividerFor, environmentFor, withRoomEdges } from '../../src/render/environment';
import type { EdgeStyle } from '../../src/render/environment/types';

const SCENARIOS: ScenarioDef[] = readdirSync('data/scenarios')
  .filter((f) => /^s\d+\.json$/.test(f))
  .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))
  .map((f) => JSON.parse(readFileSync(`data/scenarios/${f}`, 'utf8')) as ScenarioDef);

const BUILT_EDGES: EdgeStyle[] = ['stone', 'tower', 'timber', 'mine', 'forge'];
/** Floors of an interior; bare rock only down a mine. */
const INDOOR_FLOORS: SurfaceId[] = ['planks', 'flagstones', 'cobblestone', 'worn-stone'];
const OUTDOOR_FLOORS: SurfaceId[] = ['forest-floor', 'grass', 'roots', 'mud', 'wet-grass', 'walkway', 'rock', 'cobblestone'];
/** Things that only stand in a house, and things that only grow or stand outside. */
const HOUSE_THINGS = ['table', 'bunk', 'bed', 'pillar', 'keg-rack', 'shelf', 'wine-rack'];
const OPEN_THINGS = ['tree', 'hut', 'bush'];
const BUILT_DIVIDERS = ['stone', 'brick', 'planks'];

describe('room kinds', () => {
  for (const s of SCENARIOS) {
    const def = withRoomEdges(environmentFor(s.id), s);
    const kinds: Record<string, RoomKind | undefined> = Object.fromEntries(s.rooms.map((r) => [r.id, r.kind]));
    describe(s.id, () => {
      for (const room of s.rooms) {
        it(`${room.id} is ${room.kind ?? '?'} through and through`, () => {
          expect(room.kind, 'every room says whether it is indoors or outdoors').toBeDefined();
          const edge = def.rooms?.[room.id]?.edge ?? def.edge;
          const floor = room.surface ?? def.surface;
          const water = (room.terrain ?? []).filter((t) => t.terrain === 'water').length;
          const models = (room.obstacles ?? []).map((o) => o.model ?? 'barrel');
          if (room.kind === 'indoor') {
            expect(BUILT_EDGES, `${room.id}: walls around an interior`).toContain(edge);
            const floors = edge === 'mine' ? [...INDOOR_FLOORS, 'rock'] : INDOOR_FLOORS;
            expect(floors, `${room.id}: a built floor`).toContain(floor);
            expect(water, `${room.id}: a leak puddle at most`).toBeLessThanOrEqual(1);
            expect(models.filter((m) => OPEN_THINGS.includes(m)), `${room.id}: nothing that grows outside`).toEqual([]);
          } else {
            expect(BUILT_EDGES, `${room.id}: no house walls around open ground`).not.toContain(edge);
            expect(OUTDOOR_FLOORS, `${room.id}: natural ground`).toContain(floor);
            // A pillar in a cave is a column of rock (obstacles.ts pillar@cave).
            const house = HOUSE_THINGS.filter((m) => !(m === 'pillar' && edge === 'cave'));
            expect(models.filter((m) => house.includes(m)), `${room.id}: no house furniture outside`).toEqual([]);
          }
        });
      }
      it('dividers: natural between open rooms, a building wall where an interior is', () => {
        for (const room of s.rooms) {
          for (const d of room.doors ?? []) {
            const style = dividerFor(def, [room.id, d.to], kinds);
            const indoor = kinds[room.id] === 'indoor' || kinds[d.to] === 'indoor';
            if (indoor) expect([...BUILT_DIVIDERS, 'rock-ridge'], `${room.id} | ${d.to}`).toContain(style);
            else expect(BUILT_DIVIDERS, `${room.id} | ${d.to}`).not.toContain(style);
          }
        }
      });
    });
  }
});
