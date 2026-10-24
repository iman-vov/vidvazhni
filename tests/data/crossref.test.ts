import { describe, expect, it } from 'vitest';
import type { Content, ScenarioDef } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { checkContent, checkScenario } from './crossref';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const content = loadContent();
const s1 = (): ScenarioDef => clone(content.scenarios['s1'] as ScenarioDef);

describe('content cross references', () => {
  it('heroes, monsters, bosses and decks reference only things that exist', () => {
    expect(checkContent(content)).toEqual([]);
  });

  it('flags a monster pointing at a missing deck', () => {
    const broken: Content = clone(content);
    (broken.monsters['grey-wolf'] as { deck: string }).deck = 'nope';
    expect(checkContent(broken).join('\n')).toMatch(/deck nope missing/);
  });

  it('flags a drop table naming a missing item', () => {
    const broken: Content = clone(content);
    broken.monsters['grey-wolf']!.drops = { elite: { items: ['sword-of-doom'] } };
    broken.bosses['bog-miller']!.drops = { items: ['crown'] };
    const errors = checkContent(broken).join('\n');
    expect(errors).toMatch(/grey-wolf: elite drop item sword-of-doom missing/);
    expect(errors).toMatch(/bog-miller: drop item crown missing/);
  });

  it('flags a summon of an unknown monster', () => {
    const broken: Content = clone(content);
    const step = broken.decks['caster']?.cards[1]?.steps[0];
    if (step?.type === 'summon') step.summon = 'dragon';
    expect(checkContent(broken).join('\n')).toMatch(/unknown dragon/);
  });
});

describe('scenario cross references', () => {
  it('every scenario is consistent', () => {
    for (const s of Object.values(content.scenarios)) expect(checkScenario(s, content)).toEqual([]);
  });

  it('flags a hex outside its room', () => {
    const s = s1();
    s.rooms[0]?.obstacles?.push({ hex: [40, 40] });
    expect(checkScenario(s, content).join('\n')).toMatch(/outside room s1\.pantry/);
  });

  it('flags a spawn hex that belongs to the other room', () => {
    const s = s1();
    const spawn = s.rooms[0]?.spawns?.[0];
    if (spawn) spawn.hex = s.rooms[1]?.hexes[0] as Hex;
    expect(checkScenario(s, content).join('\n')).toMatch(/outside room s1\.pantry/);
  });

  it('flags a door that points to a missing room', () => {
    const s = s1();
    const door = s.rooms[0]?.doors?.[0];
    if (door) door.to = 's1.attic';
    expect(checkScenario(s, content).join('\n')).toMatch(/missing room s1\.attic/);
  });

  it('flags a room that no door leads to', () => {
    const s = s1();
    if (s.rooms[0]) s.rooms[0].doors = [];
    expect(checkScenario(s, content).join('\n')).toMatch(/cannot be reached/);
  });

  it('flags rooms that are open to each other', () => {
    const s = s1();
    // Fill the left-out strip beside the door: the pantry now touches the cellar with no wall.
    if (s.rooms[0]) s.rooms[0].hexes.push([3, 0]);
    expect(checkScenario(s, content).join('\n')).toMatch(/open to each other/);
  });

  it('flags a named enemy or a chest with a missing item', () => {
    const s = s1();
    const room = s.rooms[0]!;
    room.spawns![0]!.drops = { items: ['crown'] };
    room.chests = [{ hex: room.hexes[0]!, id: 'c', loot: { item: 'sword-of-doom' } }];
    const errors = checkScenario(s, content).join('\n');
    expect(errors).toMatch(/drop item crown missing/);
    expect(errors).toMatch(/chest c: item sword-of-doom missing/);
  });

  it('flags a spawn of an unknown monster', () => {
    const s = s1();
    const spawn = s.rooms[0]?.spawns?.[0];
    if (spawn) spawn.monster = 'dragon';
    expect(checkScenario(s, content).join('\n')).toMatch(/unknown dragon/);
  });

  it('flags a start hex in the wrong room', () => {
    const s = s1();
    s.startHexes[0] = s.rooms[1]?.hexes[0] as Hex;
    expect(checkScenario(s, content).join('\n')).toMatch(/outside the start room/);
  });

  it('flags scenario events that point at nothing', () => {
    const s = s1();
    s.events = [
      { id: 'a', trigger: { type: 'doorOpened', room: 's1.attic' }, actions: [{ type: 'spawn', monster: 'dragon', by: { '2': 'normal' }, hexes: [[40, 40]] }] },
      { id: 'a', trigger: { type: 'monsterTurnsAlive', tag: 'horn', turns: 2 }, actions: [{ type: 'openDoor', hex: [0, 1] }] },
    ];
    const errors = checkScenario(s, content).join('\n');
    expect(errors).toMatch(/event a twice/);
    expect(errors).toMatch(/missing room s1\.attic/);
    expect(errors).toMatch(/spawns unknown dragon/);
    expect(errors).toMatch(/hex 40,40 is outside every room/);
    expect(errors).toMatch(/untagged horn/);
    expect(errors).toMatch(/opens no door at 0,1/);
  });
});
