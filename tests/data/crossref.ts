// Cross-reference checks that JSON Schema cannot express: ids that must exist, hexes that must lie
// inside their room, doors that must lead somewhere. Used by crossref.test.ts, which also feeds it
// deliberately broken content.

import type { Content, RoomDef, ScenarioDef, Step } from '../../src/rules/content';
import { areAdjacent, hexKey } from '../../src/rules/hex';
import type { Hex } from '../../src/rules/hex';

/** Calls `fn` for the step and every step nested in its consume bonus. */
export function walkStep(step: Step, fn: (s: Step) => void): void {
  fn(step);
  for (const inner of step.consume?.then ?? []) walkStep(inner, fn);
}

export function walkSteps(steps: readonly Step[], fn: (s: Step) => void): void {
  for (const step of steps) walkStep(step, fn);
}

/** Every step of every kind of content, for rules that apply to all of them. */
export function allSteps(content: Content): Step[] {
  const out: Step[] = [];
  const add = (steps: readonly Step[] | undefined) => walkSteps(steps ?? [], (s) => out.push(s));
  for (const hero of Object.values(content.heroes)) {
    add(hero.surge);
    for (const card of hero.cards) {
      add(card.top.steps);
      add(card.bottom.steps);
      add(card.fork?.top?.steps);
      add(card.fork?.bottom?.steps);
    }
  }
  for (const monster of Object.values(content.monsters))
    for (const card of monster.forkCards ?? []) {
      add(card.steps);
      add(card.otherwise);
    }
  for (const deck of Object.values(content.decks))
    for (const card of deck.cards) {
      add(card.steps);
      add(card.otherwise);
    }
  for (const item of Object.values(content.items ?? {})) {
    add(item.effect);
    add(item.forkEffect);
  }
  return out;
}

export function checkContent(content: Content): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  for (const [key, monster] of Object.entries(content.monsters)) {
    if (key !== monster.id) err(`monster key ${key} != id ${monster.id}`);
    if (!content.decks[monster.deck]) err(`monster ${monster.id}: deck ${monster.deck} missing`);
    const seen = new Set<string>();
    for (const card of monster.forkCards ?? []) {
      if (!card.id.startsWith(`${monster.id}.`)) err(`monster card ${card.id} must start with ${monster.id}.`);
      if (seen.has(card.id)) err(`duplicate monster card ${card.id}`);
      seen.add(card.id);
    }
  }
  for (const boss of Object.values(content.bosses))
    if (!content.decks[boss.deck]) err(`boss ${boss.id}: deck ${boss.deck} missing`);
  for (const deck of Object.values(content.decks)) {
    const seen = new Set<string>();
    for (const card of deck.cards) {
      if (!card.id.startsWith(`${deck.id}.`)) err(`deck card ${card.id} must start with ${deck.id}.`);
      if (seen.has(card.id)) err(`duplicate deck card ${card.id}`);
      seen.add(card.id);
    }
  }

  const summons = new Set<string>([
    ...Object.keys(content.monsters),
    ...Object.values(content.heroes).flatMap((h) => (h.summon ? [h.summon.id] : [])),
  ]);
  const allCardIds = new Set<string>();
  for (const [key, hero] of Object.entries(content.heroes)) {
    if (key !== hero.id) err(`hero key ${key} != id ${hero.id}`);
    for (const card of hero.cards) {
      if (!card.id.startsWith(`${hero.id}.`)) err(`card ${card.id} must start with ${hero.id}.`);
      if (allCardIds.has(card.id)) err(`duplicate card ${card.id}`);
      allCardIds.add(card.id);
    }
  }
  for (const step of allSteps(content))
    if (step.type === 'summon' && !summons.has(step.summon)) err(`summon of unknown ${step.summon}`);
  return errors;
}

export function checkScenario(s: ScenarioDef, content: Content): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`${s.id}: ${msg}`);

  const rooms = new Map<string, RoomDef>();
  for (const room of s.rooms) {
    if (rooms.has(room.id)) err(`duplicate room ${room.id}`);
    if (!room.id.startsWith(`${s.id}.`)) err(`room ${room.id} must start with ${s.id}.`);
    rooms.set(room.id, room);
  }

  // hex → owning room
  const owner = new Map<string, string>();
  for (const room of s.rooms)
    for (const hex of room.hexes) {
      const key = hexKey(hex);
      if (owner.has(key)) err(`hex ${key} belongs to both ${owner.get(key)} and ${room.id}`);
      owner.set(key, room.id);
    }

  for (const room of s.rooms) {
    const inside = (hex: Hex, what: string) => {
      if (owner.get(hexKey(hex)) !== room.id) err(`${what} at ${hexKey(hex)} is outside room ${room.id}`);
    };
    const taken = new Map<string, string>();
    const claim = (hex: Hex, what: string) => {
      inside(hex, what);
      const key = hexKey(hex);
      if (taken.has(key)) err(`${what} and ${taken.get(key)} share hex ${key} in ${room.id}`);
      taken.set(key, what);
    };
    for (const o of room.obstacles ?? []) claim(o.hex, 'obstacle');
    for (const d of room.doors ?? []) claim(d.hex, 'door');
    for (const sp of room.spawns ?? []) {
      claim(sp.hex, `spawn ${sp.monster}`);
      if (!content.monsters[sp.monster] && !content.bosses[sp.monster]) err(`spawn of unknown ${sp.monster}`);
    }
    for (const c of room.chests ?? []) claim(c.hex, `chest ${c.id}`);
    for (const o of room.objects ?? []) claim(o.hex, `object ${o.id}`);
    for (const t of room.traps ?? []) claim(t.hex, 'trap');
    for (const c of room.coins ?? []) inside(c, 'coins');
    for (const t of room.terrain ?? []) inside(t.hex, 'terrain');

    for (const d of room.doors ?? []) {
      const target = rooms.get(d.to);
      if (!target) {
        err(`door at ${hexKey(d.hex)} leads to missing room ${d.to}`);
        continue;
      }
      if (!target.hexes.some((h) => areAdjacent(h, d.hex))) err(`door at ${hexKey(d.hex)} touches no hex of ${d.to}`);
    }
  }

  for (const room of s.rooms)
    for (const [a, b] of room.walls ?? []) {
      if (!areAdjacent(a, b)) err(`wall ${hexKey(a)}|${hexKey(b)} joins hexes that are not adjacent`);
      if (!owner.has(hexKey(a)) || !owner.has(hexKey(b)))
        err(`wall ${hexKey(a)}|${hexKey(b)} touches a hex outside every room`);
    }

  // Rooms must be sealed from each other except through their doors.
  const walls = new Set<string>();
  for (const room of s.rooms)
    for (const [a, b] of room.walls ?? []) {
      walls.add(`${hexKey(a)}|${hexKey(b)}`);
      walls.add(`${hexKey(b)}|${hexKey(a)}`);
    }
  const doorHexes = new Set(s.rooms.flatMap((r) => (r.doors ?? []).map((d) => hexKey(d.hex))));
  for (const a of owner.keys())
    for (const b of owner.keys()) {
      const ha = a.split(',').map(Number) as Hex;
      const hb = b.split(',').map(Number) as Hex;
      if (owner.get(a) === owner.get(b) || !areAdjacent(ha, hb)) continue;
      if (!walls.has(`${a}|${b}`) && !doorHexes.has(a) && !doorHexes.has(b))
        err(`rooms ${owner.get(a)} and ${owner.get(b)} are open to each other between ${a} and ${b}`);
    }

  const start = rooms.get(s.startRoom);
  if (!start) err(`start room ${s.startRoom} missing`);
  else {
    const blocked = new Set<string>();
    for (const o of start.obstacles ?? []) blocked.add(hexKey(o.hex));
    for (const d of start.doors ?? []) blocked.add(hexKey(d.hex));
    for (const sp of start.spawns ?? []) blocked.add(hexKey(sp.hex));
    for (const c of start.chests ?? []) blocked.add(hexKey(c.hex));
    const seen = new Set<string>();
    for (const hex of s.startHexes) {
      const key = hexKey(hex);
      if (owner.get(key) !== start.id) err(`start hex ${key} is outside the start room`);
      if (blocked.has(key)) err(`start hex ${key} is occupied`);
      if (seen.has(key)) err(`start hex ${key} listed twice`);
      seen.add(key);
    }
  }

  // Every room must be reachable through doors.
  const reached = new Set<string>();
  const queue = [s.startRoom];
  while (queue.length) {
    const id = queue.pop() as string;
    if (reached.has(id) || !rooms.has(id)) continue;
    reached.add(id);
    for (const d of rooms.get(id)?.doors ?? []) queue.push(d.to);
  }
  for (const id of rooms.keys()) if (!reached.has(id)) err(`room ${id} cannot be reached from the start`);

  const g = s.goal;
  if (g.type === 'killBoss' && !content.bosses[g.boss]) err(`goal boss ${g.boss} missing`);
  if (g.type === 'reachExit')
    for (const h of g.hexes) if (!owner.has(hexKey(h))) err(`exit hex ${hexKey(h)} is outside every room`);
  if (g.type === 'carryItem')
    for (const h of g.to) if (!owner.has(hexKey(h))) err(`delivery hex ${hexKey(h)} is outside every room`);
  for (const item of s.reward.items ?? []) if (!content.items?.[item]) err(`reward item ${item} missing`);
  return errors;
}
