// Cross-reference checks that JSON Schema cannot express: ids that must exist, hexes that must lie
// inside their room, doors that must lead somewhere. Used by crossref.test.ts, which also feeds it
// deliberately broken content.

import type { Content, DropDef, RoomDef, ScenarioDef, Step } from '../../src/rules/content';
import { BOOKSHELF, SHELF_ASLEEP } from '../../src/rules/books';
import { areAdjacent, hexKey } from '../../src/rules/hex';
import type { Hex } from '../../src/rules/hex';
import { eventHexes } from '../../src/rules/events';
import { goalZone } from '../../src/rules/objectives';

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
    add(item.upgrade?.effect);
    add(item.upgrade?.forkEffect);
  }
  return out;
}

/** Items a drop table names that are not in `content.items`. */
function missingDropItems(content: Content, drop: DropDef | undefined): string[] {
  return (drop?.items ?? []).filter((id) => !content.items?.[id]);
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
  for (const monster of Object.values(content.monsters))
    for (const rank of ['normal', 'elite'] as const)
      for (const id of missingDropItems(content, monster.drops?.[rank])) err(`monster ${monster.id}: ${rank} drop item ${id} missing`);
  for (const boss of Object.values(content.bosses)) {
    if (!content.decks[boss.deck]) err(`boss ${boss.id}: deck ${boss.deck} missing`);
    for (const id of missingDropItems(content, boss.drops)) err(`boss ${boss.id}: drop item ${id} missing`);
  }
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
      for (const id of missingDropItems(content, sp.drops)) err(`spawn ${sp.monster} in ${room.id}: drop item ${id} missing`);
    }
    for (const c of room.chests ?? []) {
      claim(c.hex, `chest ${c.id}`);
      if (c.loot?.item && !content.items?.[c.loot.item]) err(`chest ${c.id}: item ${c.loot.item} missing`);
    }
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

  const zones = new Set<string>();
  for (const z of s.zones ?? []) {
    if (zones.has(z.id)) err(`zone ${z.id} twice`);
    zones.add(z.id);
    for (const h of z.hexes) if (!owner.has(hexKey(h))) err(`zone ${z.id} hex ${hexKey(h)} is outside every room`);
  }
  for (const item of s.reward.items ?? []) if (!content.items?.[item]) err(`reward item ${item} missing`);
  for (const n of s.npcs ?? []) if (!owner.has(hexKey(n.hex))) err(`npc ${n.id} hex ${hexKey(n.hex)} is outside every room`);
  const objects = s.rooms.flatMap((r) => r.objects ?? []);
  for (const o of objects) if (o.spawn && !content.monsters[o.spawn.monster]) err(`object ${o.id} calls missing monster ${o.spawn.monster}`);
  // The scenario's goal and the ones its events switch to (`setGoal`).
  const switched = (s.events ?? []).flatMap((ev) => [...ev.actions, ...(ev.prevented ?? [])]).flatMap((a) => (a.type === 'setGoal' ? [a.goal] : []));
  for (const g of [s.goal, ...switched]) {
    if (g.type === 'killBoss' && !content.bosses[g.boss]) err(`goal boss ${g.boss} missing`);
    if ('zone' in g && g.zone && !zones.has(g.zone)) err(`goal zone ${g.zone} missing`);
    const zoned = ['reachExit', 'carryItem', 'escape', 'collect', 'escort', 'race'];
    if (zoned.includes(g.type) && goalZone(s, g).length === 0) err(`goal ${g.type} has no hexes`);
    for (const h of goalZone(s, g)) if (!owner.has(hexKey(h))) err(`goal hex ${hexKey(h)} is outside every room`);
    if (g.type === 'escort' && !s.npcs?.some((n) => n.id === g.npc)) err(`goal npc ${g.npc} missing`);
    if (g.type === 'race' && !s.npcs?.some((n) => n.id === g.rival)) err(`goal rival ${g.rival} missing`);
    if (g.type === 'destroy' && !objects.some((o) => o.kind === g.kind && o.hp)) err(`goal destroys ${g.kind}, the map has none with hp`);
    if (g.type === 'protect' && !objects.some((o) => o.id === g.object && o.hp)) err(`goal protects ${g.object}, the map has no such object with hp`);
    if (g.type === 'objectStates') {
      for (const want of g.objects) {
        const o = objects.find((x) => x.id === want.id);
        if (!o) err(`goal object ${want.id} missing`);
        else if (o.interact && o.state !== want.state && o.interact.to !== want.state) err(`goal object ${want.id} never gets to state ${want.state}`);
        else if (o.turns && !o.turns.some((x) => x.state === want.state)) err(`goal object ${want.id} never turns to state ${want.state}`);
      }
    }
    if (g.type === 'collect') {
      const n = objects.filter((o) => o.kind === g.kind).length;
      if (n < g.count) err(`goal collects ${g.count} ${g.kind}, the map has ${n}`);
    }
  }
  for (const ev of s.events ?? []) {
    if (ev.trigger.type === 'bossHalfHp' && ev.trigger.boss && !content.bosses[ev.trigger.boss]) err(`event ${ev.id} waits for missing boss ${ev.trigger.boss}`);
  }
  for (const o of s.rooms.flatMap((r) => r.objects ?? [])) {
    for (const h of o.interact?.opens ?? []) if (!doorHexes.has(hexKey(h))) err(`object ${o.id} opens ${hexKey(h)}, which is no door`);
    for (const turn of o.turns ?? []) {
      if (turn.aim && turn.aim !== 'target' && !objects.some((x) => x.id === turn.aim)) err(`mirror ${o.id} aims at missing object ${turn.aim}`);
    }
    if (o.turns && o.state !== undefined && !o.turns.some((x) => x.state === o.state)) err(`mirror ${o.id} starts in state ${o.state}, not among its turns`);
  }
  if (s.beam) {
    if (!s.specials?.includes('beamMirrors')) err('beam without the beamMirrors special');
    if (!objects.some((o) => o.id === s.beam!.aim)) err(`beam aims at missing object ${s.beam.aim}`);
    for (const h of [s.beam.from, s.beam.to]) if (!owner.has(hexKey(h))) err(`beam hex ${hexKey(h)} is outside every room`);
    for (const h of s.beam.opens ?? []) if (!doorHexes.has(hexKey(h))) err(`beam opens ${hexKey(h)}, which is no door`);
  }

  for (const e of s.flagEffects ?? []) {
    if (e.bossShield && !content.bosses[e.bossShield.boss]) err(`flag ${e.flag} shields unknown boss ${e.bossShield.boss}`);
    for (const id of e.brokenObjects ?? []) if (!objects.some((o) => o.id === id)) err(`flag ${e.flag} breaks missing object ${id}`);
  }

  const tags = new Set(s.rooms.flatMap((r) => (r.spawns ?? []).flatMap((sp) => (sp.tag ? [sp.tag] : []))));
  for (const ev of s.events ?? []) for (const a of ev.actions) if (a.type === 'spawn' && a.tag) tags.add(a.tag);
  const eventIds = new Set<string>();
  for (const ev of s.events ?? []) {
    if (eventIds.has(ev.id)) err(`event ${ev.id} twice`);
    eventIds.add(ev.id);
    const t = ev.trigger;
    if (t.type === 'doorOpened' && !rooms.has(t.room)) err(`event ${ev.id} waits for missing room ${t.room}`);
    if (t.type === 'heroEnters' && !t.hexes?.length && !t.adjacent) err(`event ${ev.id} has no hexes to enter`);
    if (t.type === 'goalRound' && !(s.events ?? []).some((e) => e.actions.some((x) => x.type === 'setGoal'))) err(`event ${ev.id} counts goal rounds, but no event switches the goal`);
    if (t.type === 'alarm') {
      if (!s.specials?.includes('livingBooks')) err(`event ${ev.id} waits for an alarm without the livingBooks special`);
      if (t.object && !objects.some((o) => o.id === t.object && o.kind === BOOKSHELF && o.state === SHELF_ASLEEP)) err(`event ${ev.id} waits for ${t.object}, which is no sleeping bookshelf`);
    }
    if ((t.type === 'monsterTurnsAlive' || t.type === 'objectReached') && !tags.has(t.tag)) err(`event ${ev.id} waits for untagged ${t.tag}`);
    for (const key of eventHexes(ev)) if (!owner.has(key)) err(`event ${ev.id} hex ${key} is outside every room`);
    for (const a of [...ev.actions, ...(ev.prevented ?? [])]) {
      if (a.type === 'spawn' && !content.monsters[a.monster]) err(`event ${ev.id} spawns unknown ${a.monster}`);
      if (a.type === 'openDoor' && !doorHexes.has(hexKey(a.hex))) err(`event ${ev.id} opens no door at ${hexKey(a.hex)}`);
      if (a.type === 'wake' && a.room && !rooms.has(a.room)) err(`event ${ev.id} wakes missing room ${a.room}`);
    }
  }
  return errors;
}
