// Dev-only page (dev/board.html) for the phase-2 board without the game UI: builds scenario 1 with
// the real engine and plays a scripted sequence of events over it (moves, jumps, pushes, melee and
// ranged attacks with «промах» and ×2, conditions, heal, shield, loot, a door opening a room with
// monsters, orbs, a downed and revived hero, a trap, deaths that disperse the fog). «Рушій» instead
// lets a random bot play legal engine actions, so real event streams can be checked too.
//   ?heroes=warden,wind-archer,herbalist,rogue  hero classes (2–4)
//   &fork=1                                     all fork variants (orbs, revive)
//   &quality=low|medium|high                    graphics quality (default: device)
//   &speed=2                                    animation speed
//   &play=1                                     start the script at once
//   ?board=s1…s10                               any scenario map with its environment, every room
//                                               revealed (&reveal=0 keeps the start room only)
//   &props=fixture                              prop models from tests/fixtures/props (a test barrel)
//                                               where assets/models has none yet

import { createGame, apply } from '../rules/engine';
import type { ConditionId, ElementId, OrbId } from '../rules/content';
import type { Ctx } from '../rules/effects/context';
import { hexKey, hexesInRadius, distance, parseHexKey, type Hex } from '../rules/hex';
import { loadContent } from '../rules/load';
import { legalActionResults } from '../rules/queries';
import { revealRoom } from '../rules/setup';
import type { FigureId, GameEvent, GameState } from '../rules/state';
import { BASE_RULES, FULL_FORK } from '../rules/variants';
import { createBoardView } from './boardView';
import { listModels, registerModelUrl } from './models';
import { GRAPHICS_QUALITIES, getGraphicsQuality, type GraphicsQuality } from './quality';
import type { BoardHighlights } from './view';
import type { IconName } from '../ui/icons/names';
import { iconSvg } from '../ui/icons/svg';

const params = new URLSearchParams(location.search);
if (params.get('props') === 'fixture') {
  const fixtures = import.meta.glob<string>('/tests/fixtures/props/*.glb', { query: '?url', import: 'default', eager: true });
  for (const [path, url] of Object.entries(fixtures)) registerModelUrl(path.replace(/^.*\/|\.glb$/g, ''), url);
}

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const info = document.getElementById('info')!;

const content = loadContent();
// Act II (s6–s10) is not in loadContent() yet: ?board=s6…s10 adds its maps and monsters here.
if (/^s([6-9]|10)$/.test(params.get('board') ?? '')) {
  const act2 = import.meta.glob<Record<string, unknown>>(['/data/scenarios/s{6,7,8,9,10}.json', '/data/monsters/{mountain-ram,night-moth}.json', '/data/bosses/hammerfist.json', '/data/decks/boss.hammerfist.json'], { eager: true, import: 'default' });
  for (const [path, data] of Object.entries(act2)) {
    const [, dir, id] = /\/data\/(\w+)\/(.+)\.json$/.exec(path)!;
    const table = (content as unknown as Record<string, Record<string, unknown>>)[dir!];
    if (table) table[id!] = data;
  }
}
const heroes = (params.get('heroes') ?? 'warden,wind-archer,herbalist,rogue').split(',').filter((id) => content.heroes[id]);
const fork = params.get('fork') === '1';
const setup = {
  scenarioId: content.scenarios[params.get('board') ?? ''] ? params.get('board')! : 's1',
  seed: Number(params.get('seed') ?? 7),
  heroes: heroes.map((classId, i) => ({ classId, playerId: `p${i + 1}`, level: 1 })),
  difficulty: 'normal' as const,
  variants: { ...(fork ? FULL_FORK : BASE_RULES) },
};
let quality: GraphicsQuality = GRAPHICS_QUALITIES.find((q) => q === params.get('quality')) ?? getGraphicsQuality();

const revealAll = params.has('board') && params.get('reveal') !== '0';

/** A new game; with ?board= every room is revealed, so the whole location can be looked at. */
function freshGame(): GameState {
  const s = createGame(setup, content);
  if (!revealAll) return s;
  const scenario = content.scenarios[s.scenarioId]!;
  for (const room of scenario.rooms) {
    if (s.board.revealedRooms.includes(room.id)) continue;
    revealRoom({ s, c: content, ev: [], out: [] } as Ctx, scenario, room.id);
  }
  return s;
}

const board = createBoardView(view, { quality, speed: Number(params.get('speed') ?? 1), lang: 'uk' });
let state: GameState = freshGame();
board.sync(state, content);
// For automated checks (screenshots, emulated touch) from the browser's console.
Object.assign(window, { board, content, getState: () => state, setHighlights: (h: BoardHighlights) => board.highlight(h) });

// ─── Scripted events ─────────────────────────────────────────────────────

/** Mutates a copy of the state the way the engine would, and records the events. */
class Beat {
  readonly s: GameState;
  readonly ev: GameEvent[] = [];
  constructor(s: GameState) {
    this.s = structuredClone(s);
  }
  private f(id: FigureId) {
    const f = this.s.figures[id];
    if (!f) throw new Error(`no figure ${id}`);
    return f;
  }
  turn(id: FigureId): this {
    this.ev.push({ type: 'turnStarted', figureId: id });
    return this;
  }
  move(id: FigureId, path: Hex[], opts: { jump?: boolean; fly?: boolean } = {}): this {
    this.f(id).hex = path[path.length - 1]!;
    this.ev.push({ type: 'moved', figureId: id, path, ...(opts.jump ? { jump: true } : {}), ...(opts.fly ? { fly: true } : {}) });
    const tile = this.s.board.tiles[hexKey(path[path.length - 1]!)];
    if (id.startsWith('hero:') && tile?.door && !tile.door.open) this.reveal(tile.door.to);
    return this;
  }
  push(id: FigureId, path: Hex[], pull = false): this {
    this.f(id).hex = path[path.length - 1]!;
    this.ev.push({ type: 'pushed', figureId: id, path, ...(pull ? { pull: true } : {}) });
    return this;
  }
  attack(a: FigureId, t: FigureId, base: number, chosen: string, damage: number): this {
    const target = this.f(t);
    const shield = target.shields.reduce((sum, x) => sum + x.value, 0);
    this.ev.push({ type: 'attacked', attackerId: a, targetId: t, base, modifiers: [chosen], chosen, shield, damage });
    return this.damage(t, damage, a);
  }
  damage(id: FigureId, amount: number, source: string): this {
    if (amount <= 0) return this;
    const f = this.f(id);
    const dealt = Math.min(amount, f.hp);
    f.hp -= dealt;
    this.ev.push({ type: 'damaged', figureId: id, amount: dealt, source });
    if (f.hp > 0) return this;
    if (f.kind === 'hero') {
      if (this.s.variants.reviveAlly && !f.downed) {
        f.downed = true;
        for (const c of Object.keys(f.conditions) as ConditionId[]) this.uncond(id, c);
        this.ev.push({ type: 'heroDowned', heroId: id });
      } else {
        f.exhausted = true;
        this.ev.push({ type: 'heroExhausted', heroId: id, reason: 'damage' });
      }
    } else {
      delete this.s.figures[id];
      this.ev.push({ type: 'figureDied', figureId: id });
    }
    return this;
  }
  cond(id: FigureId, c: ConditionId): this {
    this.f(id).conditions[c] = {};
    this.ev.push({ type: 'conditionAdded', figureId: id, condition: c });
    return this;
  }
  uncond(id: FigureId, c: ConditionId): this {
    delete this.f(id).conditions[c];
    this.ev.push({ type: 'conditionRemoved', figureId: id, condition: c });
    return this;
  }
  heal(id: FigureId, amount: number, removed: ConditionId[] = []): this {
    const f = this.f(id);
    const healed = Math.min(amount, f.maxHp - f.hp);
    f.hp += healed;
    for (const c of removed) delete f.conditions[c];
    this.ev.push({ type: 'healed', figureId: id, amount: healed, removed });
    return this;
  }
  shield(id: FigureId, value: number): this {
    this.f(id).shields.push({ value, source: 'card:dev', until: 'round' });
    this.ev.push({ type: 'shieldAdded', figureId: id, value });
    return this;
  }
  loot(id: FigureId, hex: Hex): this {
    const tile = this.s.board.tiles[hexKey(hex)];
    const coins = tile?.coins ?? 0;
    const chest = tile?.chest;
    if (tile) {
      delete tile.coins;
      delete tile.chest;
    }
    this.ev.push(chest ? { type: 'looted', heroId: id, coins, chest } : { type: 'looted', heroId: id, coins });
    return this;
  }
  reveal(roomId: string): this {
    const scenario = content.scenarios[this.s.scenarioId]!;
    const ctx: Ctx = { s: this.s, c: content, ev: [], out: [] };
    revealRoom(ctx, scenario, roomId);
    this.ev.push(...ctx.ev);
    return this;
  }
  element(e: ElementId): this {
    this.s.elements[e] = 'strong';
    this.ev.push({ type: 'elementChanged', element: e, level: 'strong' });
    return this;
  }
  orbIn(orb: OrbId, ownerId: FigureId): this {
    this.s.orbs[orb] = { ownerId, age: 0 };
    this.ev.push({ type: 'orbInfused', orb, ownerId });
    return this;
  }
  orbUse(orb: OrbId, byId: FigureId): this {
    const fromId = this.s.orbs[orb]?.ownerId ?? 'scenario';
    delete this.s.orbs[orb];
    this.ev.push({ type: 'orbConsumed', orb, byId, fromId });
    return this;
  }
  orbDim(orb: OrbId): this {
    const o = this.s.orbs[orb];
    if (o) o.age = 1;
    this.ev.push({ type: 'orbDimmed', orb });
    return this;
  }
  revive(id: FigureId, byId: FigureId): this {
    const f = this.f(id);
    if (f.kind === 'hero') {
      f.downed = false;
      f.revived = true;
      f.hp = 3;
    }
    this.ev.push({ type: 'heroRevived', heroId: id, byId });
    return this;
  }
  trapPlace(hex: Hex): this {
    const tile = this.s.board.tiles[hexKey(hex)];
    if (tile) tile.trap = { damage: 2, conditions: [] };
    this.ev.push({ type: 'trapPlaced', hex });
    return this;
  }
  trapHit(id: FigureId): this {
    const f = this.f(id);
    const tile = this.s.board.tiles[hexKey(f.hex)];
    const damage = tile?.trap?.damage ?? 2;
    if (tile) delete tile.trap;
    this.ev.push({ type: 'trapTriggered', figureId: id, damage });
    return this.damage(id, damage, 'trap');
  }
}

/** Figure id standing on a hex (spawn numbers depend on the seed). */
function at(s: GameState, hex: Hex): FigureId {
  const f = Object.values(s.figures).find((x) => x.hex[0] === hex[0] && x.hex[1] === hex[1]);
  if (!f) throw new Error(`nobody on ${hexKey(hex)}`);
  return f.id;
}

const H = (cls: string) => `hero:${cls}`;
const has = (cls: string) => heroes.includes(cls);

/** The scripted sequence; each beat is one play() call (like one engine action). */
const BEATS: { name: string; run: (s: GameState) => Beat }[] = [
  {
    name: 'Вартовий: рух, монета, удар',
    run: (s) => {
      const b = new Beat(s).turn(H('warden'));
      b.move(H('warden'), [[1, 0]]).loot(H('warden'), [1, 0]).move(H('warden'), [[2, -1]]);
      const rat = at(b.s, [3, -1]);
      return b.attack(H('warden'), rat, 2, '+1', b.s.figures[rat]!.hp);
    },
  },
  {
    name: 'Лучниця: постріл ×2, Вітер',
    run: (s) => {
      const b = new Beat(s).turn(H('wind-archer'));
      if (!has('wind-archer')) return b;
      const rat = at(b.s, [3, 0]);
      return b.attack(H('wind-archer'), rat, 2, 'x2', b.s.figures[rat]!.hp).element('air');
    },
  },
  {
    name: 'Елітний пацюк: промах, щит',
    run: (s) => {
      const b = new Beat(s);
      const rat = Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.rank === 'elite') ?? Object.values(b.s.figures).find((f) => f.kind === 'monster');
      if (!rat) return b;
      b.shield(H('warden'), 1).turn(rat.id).move(rat.id, [[3, -1]]);
      b.attack(rat.id, H('warden'), 2, 'miss', 0);
      return b.attack(rat.id, H('warden'), 2, '+0', 1).cond(H('warden'), 'wound');
    },
  },
  {
    name: 'Пройда: стрибок на двері, далі льох',
    run: (s) => {
      const id = has('rogue') ? H('rogue') : H('warden');
      const b = new Beat(s).turn(id);
      return b.move(id, [[2, 1]], { jump: true });
    },
  },
  {
    name: 'Відштовхування й стани',
    run: (s) => {
      const id = has('rogue') ? H('rogue') : H('warden');
      const b = new Beat(s).turn(id);
      const rat = Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.typeId === 'cellar-rat' && distance(f.hex, b.s.figures[id]!.hex) === 1);
      if (!rat) return b;
      b.attack(id, rat.id, 1, '+1', 1).push(rat.id, [[4, 1]]).cond(rat.id, 'stun').cond(rat.id, 'immobilize');
      return b;
    },
  },
  {
    name: 'Гремлін: камінь із рогатки, сум’яття',
    run: (s) => {
      const b = new Beat(s);
      const gremlin = Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.typeId === 'gremlin' && f.rank === 'elite') ?? Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.typeId === 'gremlin');
      const target = has('rogue') ? H('rogue') : H('warden');
      if (!gremlin) return b;
      return b.turn(gremlin.id).attack(gremlin.id, target, 1, '+1', 2).cond(target, 'muddle').cond(target, 'poison');
    },
  },
  {
    name: 'Травниця: лікування, отрута знята',
    run: (s) => {
      const healer = has('herbalist') ? H('herbalist') : H('warden');
      const target = has('rogue') ? H('rogue') : H('warden');
      const b = new Beat(s).turn(healer).move(healer, [[1, 0], [2, 0]].slice(0, 1) as Hex[]);
      return b.heal(target, 2, ['poison']).element('earth').cond(healer, 'strengthen').cond(healer, 'invisible');
    },
  },
  {
    name: 'Сфери: вогонь, вітер, поглинання',
    run: (s) => {
      const b = new Beat(s);
      b.orbIn('fire', H('warden'));
      if (has('wind-archer')) b.orbIn('air', H('wind-archer'));
      b.orbIn('earth', has('herbalist') ? H('herbalist') : H('warden'));
      b.orbUse('fire', has('rogue') ? H('rogue') : H('warden'));
      return b.orbDim('earth');
    },
  },
  {
    name: 'Пастка й пацюк',
    run: (s) => {
      const b = new Beat(s);
      const rat = Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.typeId === 'cellar-rat' && f.hex[1] >= 2);
      if (!rat) return b;
      const free = hexesInRadius(rat.hex, 1).find((h) => {
        const t = b.s.board.tiles[hexKey(h)];
        return t && !t.obstacle && !t.door && !Object.values(b.s.figures).some((f) => f.hex[0] === h[0] && f.hex[1] === h[1]);
      });
      if (!free) return b;
      b.trapPlace(free).turn(rat.id).move(rat.id, [free]);
      return b.trapHit(rat.id);
    },
  },
  {
    name: 'Лучниця падає і встає',
    run: (s) => {
      const id = has('wind-archer') ? H('wind-archer') : H('warden');
      const b = new Beat(s);
      const gremlin = Object.values(b.s.figures).find((f) => f.kind === 'monster' && f.typeId === 'gremlin');
      if (gremlin) b.turn(gremlin.id).attack(gremlin.id, id, 3, '+2', b.s.figures[id]!.hp);
      const helper = has('herbalist') ? H('herbalist') : H('warden');
      if (b.s.figures[id]?.kind === 'hero' && (b.s.figures[id] as { downed: boolean }).downed) b.turn(helper).revive(id, helper);
      return b;
    },
  },
  {
    name: 'Туман розвіюється',
    run: (s) => {
      const b = new Beat(s).turn(H('warden'));
      const monsters = Object.values(b.s.figures).filter((f) => f.kind === 'monster');
      for (const m of monsters.slice(0, 3)) b.attack(H('warden'), m.id, 3, '+1', m.hp);
      return b;
    },
  },
  {
    name: 'Скриня: тремтіння, сяйво, здобич до героя',
    run: (s) => {
      const chest = Object.entries(s.board.tiles).find(([, t]) => t.chest);
      if (!chest) return new Beat(s);
      const id = has('rogue') ? H('rogue') : H('warden');
      return new Beat(s).turn(id).loot(id, parseHexKey(chest[0]));
    },
  },
];

// ─── Movement demo (any board): jump over something, a flight, a push ──────

function freeHex(s: GameState, h: Hex): boolean {
  const t = s.board.tiles[hexKey(h)];
  return !!t && !t.obstacle && !Object.values(s.figures).some((f) => f.hex[0] === h[0] && f.hex[1] === h[1]);
}

function blocked(s: GameState, h: Hex): boolean {
  const t = s.board.tiles[hexKey(h)];
  return !!t && (!!t.obstacle || Object.values(s.figures).some((f) => f.hex[0] === h[0] && f.hex[1] === h[1]));
}

/** Beats that show a jump (over an obstacle or a figure when there is one), a flight and a push. */
function moveBeats(s0: GameState): Beat[] {
  const beats: Beat[] = [];
  let s = s0;
  const hero = Object.values(s.figures).find((f) => f.kind === 'hero');
  if (hero) {
    const options = hexesInRadius(hero.hex, 3).filter((h) => distance(h, hero.hex) >= 2 && freeHex(s, h) && !s.board.tiles[hexKey(h)]!.door && s.board.revealedRooms.includes(s.board.tiles[hexKey(h)]!.room));
    const over = options.find((h) => lineTo(hero.hex, h).slice(0, -1).some((m) => blocked(s, m))) ?? options[0];
    if (over) {
      const b = new Beat(s).turn(hero.id).move(hero.id, lineTo(hero.hex, over), { jump: true });
      beats.push(b);
      s = b.s;
    }
  }
  const flyer = Object.values(s.figures).find((f) => f.kind === 'monster' && content.monsters[f.typeId]?.normal.flying) ?? Object.values(s.figures).filter((f) => f.kind === 'hero')[1];
  if (flyer) {
    const to = hexesInRadius(flyer.hex, 3).find((h) => distance(h, flyer.hex) === 3 && freeHex(s, h));
    if (to) {
      const b = new Beat(s).turn(flyer.id).move(flyer.id, lineTo(flyer.hex, to), { fly: true });
      beats.push(b);
      s = b.s;
    }
  }
  const actor = Object.values(s.figures).find((f) => f.kind === 'hero');
  const victim = actor && Object.values(s.figures).filter((f) => f.kind === 'monster').sort((a, b) => distance(a.hex, actor.hex) - distance(b.hex, actor.hex))[0];
  if (actor && victim) {
    // Away from the hero, two hexes if free.
    const dq = Math.sign(victim.hex[0] - actor.hex[0]);
    const dr = Math.sign(victim.hex[1] - actor.hex[1]);
    const path: Hex[] = [];
    let at: Hex = victim.hex;
    for (let i = 0; i < 2; i++) {
      const next: Hex = [at[0] + dq, at[1] + (dq && dr && dq === dr ? 0 : dr)];
      if (!freeHex(s, next)) break;
      path.push(next);
      at = next;
    }
    if (path.length) {
      const b = new Beat(s).turn(actor.id).attack(actor.id, victim.id, 1, '+0', 0).push(victim.id, path);
      beats.push(b);
    }
  }
  return beats;
}

async function playMoves(): Promise<void> {
  if (busy) return;
  busy = true;
  for (const b of moveBeats(state)) {
    current = b.ev.find((e) => e.type === 'moved' || e.type === 'pushed')?.type ?? 'рух';
    state = b.s;
    await board.play(b.ev, b.s, content);
  }
  busy = false;
}

let beatIndex = 0;
let busy = false;

async function playBeat(): Promise<boolean> {
  const beat = BEATS[beatIndex];
  if (!beat) return false;
  beatIndex++;
  let b: Beat;
  try {
    b = beat.run(state);
  } catch (err) {
    console.warn('beat skipped', beat.name, err);
    return true;
  }
  current = beat.name;
  state = b.s;
  await board.play(b.ev, b.s, content);
  return true;
}

async function playAll(): Promise<void> {
  if (busy) return;
  busy = true;
  while (await playBeat()) {
    // next beat
  }
  busy = false;
  current = 'кінець сценарію';
}

// ─── Engine bot ──────────────────────────────────────────────────────────

let botOn = false;
async function botLoop(): Promise<void> {
  while (botOn && state.phase !== 'won' && state.phase !== 'lost') {
    const options = legalActionResults(state, content).filter((o) => o.action.type !== 'undo');
    if (!options.length) break;
    // Prefer steps that do something over skipping them.
    const doing = options.filter((o) => o.action.type !== 'skipStep' && o.action.type !== 'endTurn');
    const pool = doing.length ? doing : options;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    const r = apply(state, pick.action, content);
    if (!r.ok) break;
    current = `рушій: ${pick.action.type}`;
    state = r.state;
    await board.play(r.events, r.state, content);
  }
  botOn = false;
  botButton.setAttribute('aria-pressed', 'false');
}

// ─── Highlights demo ─────────────────────────────────────────────────────

let highlightOn = false;
function demoHighlights(): BoardHighlights {
  const hero = state.figures[H('warden')] ?? Object.values(state.figures).find((f) => f.kind === 'hero');
  if (!hero) return {};
  const occupied = new Set(Object.values(state.figures).map((f) => hexKey(f.hex)));
  const reachable = hexesInRadius(hero.hex, 3)
    .filter((h) => {
      const t = state.board.tiles[hexKey(h)];
      return t && !t.obstacle && !occupied.has(hexKey(h));
    })
    .map((hex) => ({ hex, cost: distance(hex, hero.hex) }));
  const monsters = Object.values(state.figures).filter((f) => f.kind === 'monster');
  const targets = monsters.filter((m) => distance(m.hex, hero.hex) <= 3).map((m) => m.id);
  const expectedDamage = Object.fromEntries(targets.map((id) => [id, 2]));
  const far = [...reachable].sort((a, b) => b.cost - a.cost)[0];
  const path = far ? lineTo(hero.hex, far.hex) : [];
  const area = monsters[0] ? hexesInRadius(monsters[0].hex, 1).filter((h) => state.board.tiles[hexKey(h)]) : [];
  return { reachable, targets, expectedDamage, path, area };
}

function lineTo(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  const out: Hex[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q = a[0] + (b[0] - a[0]) * t;
    const r = a[1] + (b[1] - a[1]) * t;
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    if (dq > dr && dq > Math.abs(rs - s)) rq = -rr - rs;
    else if (dr > Math.abs(rs - s)) rr = -rq - rs;
    out.push([rq, rr]);
  }
  return out;
}

// ─── Panel ───────────────────────────────────────────────────────────────

let current = 'готово';
let lastTap = '';

function button(label: string, onClick: () => void, icon?: IconName): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (icon) b.insertAdjacentHTML('afterbegin', `${iconSvg(icon)} `);
  b.addEventListener('click', onClick);
  panel.appendChild(b);
  return b;
}

button('Сценарій', () => void playAll(), 'right');
button('Крок', () => {
  if (!busy) void playBeat();
});
button('Рухи', () => void playMoves());
button('Пропустити', () => board.skip(), 'skip');
const speedButton = button(`${board.speed}×`, () => {
  board.setSpeed(board.speed === 1 ? 2 : 1);
  speedButton.textContent = `${board.speed}×`;
});
const qualityPicker = document.createElement('select');
for (const q of GRAPHICS_QUALITIES) qualityPicker.add(new Option(q, q, false, q === quality));
qualityPicker.addEventListener('change', () => {
  quality = qualityPicker.value as GraphicsQuality;
  board.setQuality(quality);
});
panel.appendChild(qualityPicker);
const highlightButton = button('Підсвітка', () => {
  highlightOn = !highlightOn;
  highlightButton.setAttribute('aria-pressed', String(highlightOn));
  if (highlightOn) board.highlight(demoHighlights());
  else board.clearHighlights();
});
const botButton = button('Рушій', () => {
  botOn = !botOn;
  botButton.setAttribute('aria-pressed', String(botOn));
  if (botOn) void botLoop();
});
button('Скинути', () => {
  board.skip();
  botOn = false;
  beatIndex = 0;
  state = freshGame();
  board.sync(state, content);
  current = 'готово';
}, 'undo');

board.onHexTap((h) => (lastTap = `hex ${hexKey(h)}`));
board.onFigureTap((id) => (lastTap = `tap ${id}`));
board.onFigureHold((id) => (lastTap = `hold ${id}`));

let maxFps = 0;
setInterval(() => {
  const st = board.stats();
  if (st.fps > 0) maxFps = st.fps;
  info.textContent =
    `${current}  |  ${st.quality}, ${board.speed}×  |  fps ${st.fps || '—'} (last ${maxFps})  calls ${st.calls}  tris ${st.triangles}\n` +
    `раунд ${state.round}, фаза ${state.phase}  |  ${lastTap}  |  env ${envLine()}`;
}, 250);

function envLine(): string {
  const e = board.environment();
  return `${e.id}: ${e.pieces} pieces, ${e.meshes} meshes, ${e.lights} lights, ${e.wisps} wisps`;
}

/** For screenshots: jumps to the start of beat `n` without animation, then plays it for `t` seconds. */
async function seek(n: number, t: number, focusOn?: string): Promise<string> {
  board.skip();
  state = freshGame();
  board.sync(state, content);
  for (let i = 0; i < n && i < BEATS.length; i++) {
    state = BEATS[i]!.run(state).s;
    board.sync(state, content);
  }
  beatIndex = n;
  await modelsReady();
  const target = focusOn === 'monster' ? Object.values(state.figures).find((f) => f.kind === 'monster')?.id : focusOn;
  if (target) {
    board.focus(target);
    await board.advance(0.6);
  }
  void playBeat();
  await board.advance(t);
  return BEATS[n]?.name ?? '';
}

/** Waits until every figure whose model is in the build shows it. */
async function modelsReady(timeoutMs = 8000): Promise<void> {
  const start = performance.now();
  const available = new Set(listModels());
  while (performance.now() - start < timeoutMs) {
    const missing = board.figures().filter((f) => !f.model && available.has(f.id.startsWith('hero:') ? f.id.slice(5) : f.id.split(':')[1]!));
    if (!missing.length) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

Object.assign(window, { board, devBoard: { get state() { return state; }, content, playAll, playBeat, playMoves, moveBeats, seek, modelsReady, BEATS } });
if (params.get('play') === '1') void playAll();
// Screenshots of a moment: ?seek=<beat or "last">&t=<seconds into it> plays there and holds the frame.
if (params.has('seek')) {
  const n = params.get('seek') === 'last' ? BEATS.length - 1 : Number(params.get('seek'));
  void seek(n, Number(params.get('t') ?? 1)).then(() => board.freeze(true));
}
