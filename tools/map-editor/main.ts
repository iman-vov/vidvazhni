// Map editor page (dev only): paint rooms, terrain, walls, doors, spawns and goals of a scenario,
// check it live and save it as data/scenarios/<id>.json. See docs/tools/map-editor.md.

import type { ConditionId, OrbId, ScenarioDef, ScenarioGoal, Terrain } from '../../src/rules/content';
import { hexToWorld, worldToHex } from '../../src/render/hexLayout';
import { DIRECTIONS, add, hexKey, type Hex } from '../../src/rules/hex';
import { loadContent, loadTranslations } from '../../src/rules/load';
import { checkAll, formatCounts, hexCount, sightLine, spawnSummary } from './checks';
import * as M from './model';
import { ROOM_COLOURS, ROOM_LETTERS, renderSvg, type View } from './render';

const content = loadContent();
const uk = loadTranslations().uk;
/** Scenario files, when served by the dev server. */
const files = import.meta.glob<ScenarioDef>('../../data/scenarios/*.json', { import: 'default' });

type Tool =
  | 'hex' | 'erase' | 'terrain' | 'wall' | 'obstacle' | 'trap' | 'door' | 'spawn'
  | 'start' | 'coin' | 'chest' | 'object' | 'goal' | 'los' | 'inspect';

const TOOLS: [Tool, string, string][] = [
  ['hex', 'Гекси', 'h'],
  ['erase', 'Стерти гекс', 'e'],
  ['terrain', 'Місцевість', 't'],
  ['wall', 'Стіна', 'w'],
  ['obstacle', 'Перешкода', 'o'],
  ['trap', 'Пастка', 'p'],
  ['door', 'Двері', 'd'],
  ['spawn', 'Монстр', 'm'],
  ['start', 'Старт', 's'],
  ['coin', 'Монета', 'c'],
  ['chest', 'Скриня', 'x'],
  ['object', "Об'єкт", 'j'],
  ['goal', 'Вихід/доставка', 'g'],
  ['los', 'Лінія зору', 'l'],
  ['inspect', 'Що тут?', 'i'],
];

const CONDITIONS: ConditionId[] = ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle'];
const ORBS: OrbId[] = ['fire', 'earth', 'air'];
const STORE = 'vidvazhni.map-editor';

// ─── State ───────────────────────────────────────────────────────────────

let scen: ScenarioDef = M.emptyScenario();
let fileName = '';
let saved = '';
const undoStack: string[] = [];
const redoStack: string[] = [];

let tool: Tool = 'hex';
let activeRoom = '';
const hidden = new Set<string>();
let heroesView: '2' | '3' | '4' | 'all' = 'all';
let coords = false;
let autoSeal = true;
let hover: Hex | undefined;
let los: { a: Hex; b?: Hex; clear?: boolean } | undefined;
let inspectHex: Hex | undefined;
let view: View = { size: 30, ox: 0, oy: 0, width: 0, height: 0 };

const opt = {
  terrain: 'hazardous' as Terrain,
  obstacle: 'tree',
  trapDamage: '',
  trapConds: new Set<ConditionId>(),
  doorTo: '',
  doorKey: '',
  monster: 'thornling',
  by: { '2': 'normal', '3': 'normal', '4': 'normal' } as Record<M.HeroKey, '' | 'normal' | 'elite'>,
  chestId: '',
  chestCoins: '',
  chestItem: '',
  chestQuest: '',
  objKind: 'lever',
  objId: '',
  objState: 'up',
  objBlocks: true,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = $('board');
const toolsEl = $('tools');
const side = $('side');
const statusEl = $('status');

// ─── Edits and history ───────────────────────────────────────────────────

function snapshot(): string {
  return JSON.stringify(scen);
}

/** Runs one edit as one undo step; an edit returning false changed nothing. */
function edit(fn: () => boolean | void): void {
  const before = snapshot();
  if (fn() === false) return;
  afterEdit(before);
}

function afterEdit(before: string): void {
  if (autoSeal) M.sealRooms(scen);
  if (snapshot() === before) return;
  undoStack.push(before);
  if (undoStack.length > 300) undoStack.shift();
  redoStack.length = 0;
  changed();
}

function changed(): void {
  if (!M.roomById(scen, activeRoom)) activeRoom = scen.rooms[0]?.id ?? '';
  persist();
  renderAll();
}

function undo(): void {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(snapshot());
  scen = JSON.parse(prev) as ScenarioDef;
  changed();
}

function redo(): void {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(snapshot());
  scen = JSON.parse(next) as ScenarioDef;
  changed();
}

function load(s: ScenarioDef, name: string): void {
  scen = M.clone(s);
  fileName = name;
  saved = M.formatScenario(scen);
  undoStack.length = 0;
  redoStack.length = 0;
  activeRoom = scen.rooms[0]?.id ?? '';
  hidden.clear();
  los = undefined;
  inspectHex = undefined;
  changed();
}

function dirty(): boolean {
  return M.formatScenario(scen) !== saved;
}

function persist(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ scen, fileName, saved }));
  } catch {
    // Storage may be unavailable (private window); the editor works without it.
  }
}

function restore(): boolean {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;
    const data = JSON.parse(raw) as { scen: ScenarioDef; fileName: string; saved: string };
    scen = data.scen;
    fileName = data.fileName;
    saved = data.saved;
    activeRoom = scen.rooms[0]?.id ?? '';
    return true;
  } catch {
    return false;
  }
}

// ─── Board input ─────────────────────────────────────────────────────────

function pointerHex(e: PointerEvent | MouseEvent): { hex: Hex; dx: number; dz: number } | undefined {
  const svg = board.querySelector('svg');
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return undefined;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  const wx = (p.x - view.ox) / view.size;
  const wz = (p.y - view.oy) / view.size;
  const hex = worldToHex(wx, wz) as Hex;
  const c = hexToWorld(hex[0], hex[1]);
  return { hex, dx: wx - c.x, dz: wz - c.z };
}

let stroke: { before: string; seen: Set<string>; erase: boolean } | undefined;

board.addEventListener('contextmenu', (e) => e.preventDefault());
board.addEventListener('pointerdown', (e) => {
  const at = pointerHex(e);
  if (!at || (e.button !== 0 && e.button !== 2)) return;
  const erase = e.button === 2 || e.altKey;
  if (tool === 'hex' || tool === 'erase' || tool === 'terrain') {
    // Painting tools work as strokes: one undo step per drag.
    stroke = { before: snapshot(), seen: new Set(), erase };
    board.setPointerCapture(e.pointerId);
    paint(at.hex);
    renderBoard();
    return;
  }
  const before = snapshot();
  if (apply(at.hex, at.dx, at.dz, erase) !== false) afterEdit(before);
  else renderAll();
});
board.addEventListener('pointermove', (e) => {
  const at = pointerHex(e);
  const key = at ? hexKey(at.hex) : '';
  if (stroke && at && !stroke.seen.has(key)) paint(at.hex);
  if ((hover ? hexKey(hover) : '') !== key || stroke) {
    hover = at?.hex;
    renderBoard();
    renderStatus();
  }
});
board.addEventListener('pointerup', () => {
  if (!stroke) return;
  const before = stroke.before;
  stroke = undefined;
  afterEdit(before);
  renderAll();
});
board.addEventListener('pointerleave', () => {
  hover = undefined;
  if (!stroke) renderBoard();
});

function paint(hex: Hex): void {
  if (!stroke) return;
  stroke.seen.add(hexKey(hex));
  if (tool === 'erase' || (tool === 'hex' && stroke.erase)) M.eraseHex(scen, hex);
  else if (tool === 'hex') M.paintHex(scen, hex, activeRoom);
  else if (tool === 'terrain') {
    const room = M.roomOf(scen, hex);
    if (!room) return;
    if (stroke.erase || opt.terrain === 'normal') M.removeAt(room, 'terrain', hex);
    else M.putAt(room, 'terrain', { hex, terrain: opt.terrain });
  }
}

/** Places (or with `erase` removes) the current tool's thing on a hex. False = nothing changed. */
function apply(hex: Hex, dx: number, dz: number, erase: boolean): boolean | void {
  const room = M.roomOf(scen, hex);
  const sid = scen.id;
  const toggle = (list: M.HexList, make: () => unknown): boolean => {
    if (!room) return false;
    if (M.findAt(room, list, hex) >= 0) return M.removeAt(room, list, hex);
    if (erase) return false;
    if (list !== 'coins') M.clearExclusive(room, hex);
    M.putAt(room, list, make());
    return true;
  };
  switch (tool) {
    case 'wall':
      return M.toggleWall(scen, hex, M.neighbourToward(hex, dx, dz));
    case 'obstacle':
      return toggle('obstacles', () => (opt.obstacle ? { hex, model: opt.obstacle } : { hex }));
    case 'trap':
      return toggle('traps', () => {
        const t: { hex: Hex; damage?: number; conditions?: ConditionId[] } = { hex };
        if (opt.trapDamage) t.damage = Number(opt.trapDamage);
        if (opt.trapConds.size) t.conditions = [...opt.trapConds];
        return t;
      });
    case 'door': {
      const to = opt.doorTo || neighbourRoom(hex, room?.id);
      if (!to && !(room && M.findAt(room, 'doors', hex) >= 0)) {
        flash('Двері: поруч немає іншої кімнати, оберіть «Куди»');
        return false;
      }
      return toggle('doors', () => (opt.doorKey ? { hex, to, key: opt.doorKey } : { hex, to }));
    }
    case 'spawn':
      return toggle('spawns', () => {
        const by: Partial<Record<M.HeroKey, 'normal' | 'elite'>> = {};
        for (const k of M.HERO_KEYS) if (opt.by[k]) by[k] = opt.by[k] as 'normal' | 'elite';
        return { monster: opt.monster, hex, by };
      });
    case 'coin':
      return toggle('coins', () => [hex[0], hex[1]]);
    case 'chest':
      return toggle('chests', () => {
        const id = opt.chestId || nextId(`${sid}.chest`, allIds('chests'));
        const loot: { coins?: number; item?: string; questItem?: string } = {};
        if (opt.chestCoins) loot.coins = Number(opt.chestCoins);
        if (opt.chestItem) loot.item = opt.chestItem;
        if (opt.chestQuest) loot.questItem = opt.chestQuest;
        return Object.keys(loot).length ? { hex, id, loot } : { hex, id };
      });
    case 'object':
      return toggle('objects', () => {
        const o: { hex: Hex; id: string; kind: string; state?: string; blocks?: boolean } = {
          hex,
          id: opt.objId || nextId(`${sid}.${opt.objKind}`, allIds('objects')),
          kind: opt.objKind,
        };
        if (opt.objState) o.state = opt.objState;
        if (opt.objBlocks) o.blocks = true;
        return o;
      });
    case 'start':
      if (erase && !scen.startHexes.some((h) => hexKey(h) === hexKey(hex))) return false;
      M.toggleStart(scen, hex);
      return true;
    case 'goal':
      return M.toggleGoalHex(scen, hex);
    case 'los':
      if (!room) return false;
      if (!los || los.b) los = { a: hex };
      else los = { a: los.a, b: hex, clear: sightLine(scen, los.a, hex) };
      return false;
    case 'inspect':
      inspectHex = hex;
      pick(hex);
      return false;
    default:
      return false;
  }
}

/** The other room next to a hex, for doors placed without a chosen target. */
function neighbourRoom(hex: Hex, own: string | undefined): string | undefined {
  const owners = M.hexOwners(scen);
  for (const d of DIRECTIONS) {
    const other = owners.get(hexKey(add(hex, d)));
    if (other && other !== own) return other;
  }
  return undefined;
}

function allIds(list: 'chests' | 'objects'): Set<string> {
  return new Set(scen.rooms.flatMap((r) => (r[list] ?? []).map((x) => x.id)));
}

function nextId(prefix: string, used: Set<string>): string {
  for (let i = 1; ; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

/** Eyedropper: the inspected hex's spawn, object or obstacle becomes the tool setting. */
function pick(hex: Hex): void {
  const room = M.roomOf(scen, hex);
  if (!room) return;
  const sp = M.entryAt<NonNullable<typeof room.spawns>[number]>(room, 'spawns', hex);
  if (sp) {
    opt.monster = sp.monster;
    for (const k of M.HERO_KEYS) opt.by[k] = sp.by[k] ?? '';
  }
  const ob = M.entryAt<{ model?: string }>(room, 'obstacles', hex);
  if (ob?.model) opt.obstacle = ob.model;
}

// ─── Rendering ───────────────────────────────────────────────────────────

function renderAll(): void {
  renderBoard();
  renderTools();
  renderSide();
  renderStatus();
}

function renderBoard(): void {
  const r = renderSvg(scen, {
    size: 30,
    heroes: heroesView,
    hidden,
    activeRoom,
    ghost: true,
    coords,
    hover,
    los,
  });
  view = r.view;
  board.innerHTML = r.svg;
}

let notice = '';
let noticeTimer = 0;

/** A short message in the status line. */
function flash(text: string): void {
  notice = text;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => ((notice = ''), renderStatus()), 3000);
  renderStatus();
}

function renderStatus(): void {
  const parts = [`${fileName || 'без файлу'}${dirty() ? ' •' : ''}`, `${hexCount(scen)} гексів`];
  if (hover) {
    const room = M.roomOf(scen, hover);
    parts.push(`q,r ${hover[0]},${hover[1]}${room ? ` · ${room.id}` : ''}`);
  }
  if (los?.b) parts.push(`лінія зору: ${los.clear ? 'є' : 'немає'}`);
  if (notice) parts.push(notice);
  statusEl.textContent = parts.join('   ');
  $('undo').toggleAttribute('disabled', undoStack.length === 0);
  $('redo').toggleAttribute('disabled', redoStack.length === 0);
}

function h(tag: string, attrs: Record<string, string | boolean | number> = {}, ...kids: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = String(v);
    else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
    } else el.setAttribute(k, String(v));
  }
  el.append(...kids);
  return el;
}

function row(label: string, ...kids: (Node | string)[]): HTMLElement {
  return h('div', { class: 'row' }, h('label', {}, label), ...kids);
}

function select(options: [string, string][], value: string, on: (v: string) => void): HTMLSelectElement {
  const el = h('select') as HTMLSelectElement;
  for (const [v, label] of options) el.append(h('option', { value: v, selected: v === value }, label));
  el.addEventListener('change', () => on(el.value));
  return el;
}

function input(value: string, on: (v: string) => void, attrs: Record<string, string> = {}): HTMLInputElement {
  const el = h('input', { type: 'text', value, ...attrs }) as HTMLInputElement;
  el.addEventListener('change', () => on(el.value.trim()));
  return el;
}

function check(value: boolean, on: (v: boolean) => void): HTMLInputElement {
  const el = h('input', { type: 'checkbox', checked: value }) as HTMLInputElement;
  el.addEventListener('change', () => on(el.checked));
  return el;
}

function button(label: string, on: () => void, attrs: Record<string, string | boolean> = {}): HTMLButtonElement {
  const el = h('button', attrs, label) as HTMLButtonElement;
  el.addEventListener('click', on);
  return el;
}

const monsterOptions = (): [string, string][] => [
  ...Object.keys(content.monsters).map((id): [string, string] => [id, uk[`monster.${id}`] ?? id]),
  ...Object.keys(content.bosses).map((id): [string, string] => [id, `${uk[`boss.${id}`] ?? id} (бос)`]),
];
const roomOptions = (): [string, string][] => scen.rooms.map((r, i) => [r.id, `${ROOM_LETTERS[i] ?? i}. ${r.id}`]);

function renderTools(): void {
  toolsEl.replaceChildren();
  toolsEl.append(h('h3', {}, 'Інструмент'));
  const grid = h('div', { class: 'toolgrid' });
  for (const [id, label, key] of TOOLS)
    grid.append(button(`${label}`, () => setTool(id), { class: id === tool ? 'on' : '', title: `клавіша ${key}` }));
  toolsEl.append(grid);
  toolsEl.append(h('h3', {}, 'Налаштування'));
  const box = h('div');
  toolsEl.append(box);
  const rerender = () => renderTools();
  const hint = (t: string) => box.append(h('p', { class: 'hint' }, t));
  switch (tool) {
    case 'hex':
      box.append(row('Кімната', select(roomOptions(), activeRoom, (v) => ((activeRoom = v), renderAll()))));
      hint('Тягніть мишею, щоб малювати гекси активної кімнати; правою кнопкою — стирати. Гекс іншої кімнати переходить разом із вмістом.');
      break;
    case 'erase':
      hint('Стирає гекси разом з усім, що на них (стіни, спавни, старт…).');
      break;
    case 'terrain':
      box.append(
        row('Тип', select([['hazardous', 'небезпечна (терен)'], ['difficult', 'важка'], ['water', 'вода'], ['normal', 'звичайна (стерти)']], opt.terrain, (v) => (opt.terrain = v as Terrain))),
      );
      hint('Тягніть мишею; правою кнопкою — звичайна місцевість.');
      break;
    case 'wall':
      hint('Клікніть біля ребра гекса, щоб поставити або зняти стіну до сусіда. Межі кімнат з «авто-стінами» закриваються самі, крім гексів дверей.');
      break;
    case 'obstacle':
      box.append(row('Модель', input(opt.obstacle, (v) => (opt.obstacle = v), { list: 'models' })));
      box.append(h('datalist', { id: 'models' }, ...['tree', 'rock', 'barrel', 'crate', 'pillar', 'table', 'bed'].map((m) => h('option', { value: m }))));
      hint('Клік ставить або прибирає перешкоду.');
      break;
    case 'trap': {
      box.append(row('Шкода', input(opt.trapDamage, (v) => (opt.trapDamage = v), { placeholder: '2 + рівень' })));
      const conds = h('div', { class: 'row' });
      for (const c of CONDITIONS)
        conds.append(h('label', {}, check(opt.trapConds.has(c), (on) => (on ? opt.trapConds.add(c) : opt.trapConds.delete(c))), ` ${uk[`condition.${c}`] ?? c}`));
      box.append(conds);
      hint('Порожня шкода = за рівнем сценарію (2 + рівень).');
      break;
    }
    case 'door':
      box.append(row('Куди', select([['', '(сусідня кімната)'], ...roomOptions()], opt.doorTo, (v) => (opt.doorTo = v))));
      box.append(row('Ключ', input(opt.doorKey, (v) => (opt.doorKey = v), { placeholder: 'без ключа' })));
      hint('Гекс дверей належить кімнаті, з якої вони відчиняються; кімната «куди» має торкатися його.');
      break;
    case 'spawn': {
      box.append(row('Монстр', select(monsterOptions(), opt.monster, (v) => (opt.monster = v))));
      for (const k of M.HERO_KEYS)
        box.append(row(`${k} героїв`, select([['', '—'], ['normal', 'звичайний'], ['elite', 'елітний']], opt.by[k], (v) => (opt.by[k] = v as '' | 'normal' | 'elite'))));
      hint('Клік ставить або прибирає фігуру. «Що тут?» на фігурі копіює її налаштування сюди. Боса ставте зі «звичайний» для 2/3/4.');
      break;
    }
    case 'chest':
      box.append(row('Id', input(opt.chestId, (v) => (opt.chestId = v), { placeholder: `${scen.id}.chest-N` })));
      box.append(row('Монети', input(opt.chestCoins, (v) => (opt.chestCoins = v))));
      box.append(row('Предмет', input(opt.chestItem, (v) => (opt.chestItem = v), { placeholder: 'id з items.json' })));
      box.append(row('Сюжетний', input(opt.chestQuest, (v) => (opt.chestQuest = v), { placeholder: 'lantern-shard-2' })));
      break;
    case 'object': {
      box.append(
        row('Вид', input(opt.objKind, (v) => {
          opt.objKind = v;
          const known = M.OBJECT_KINDS.find((k) => k.kind === v);
          if (known) {
            opt.objBlocks = known.blocks;
            opt.objState = known.state ?? '';
          }
          rerender();
        }, { list: 'kinds' })),
      );
      box.append(h('datalist', { id: 'kinds' }, ...M.OBJECT_KINDS.map((k) => h('option', { value: k.kind }))));
      box.append(row('Id', input(opt.objId, (v) => (opt.objId = v), { placeholder: `${scen.id}.${opt.objKind}-N` })));
      box.append(row('Стан', input(opt.objState, (v) => (opt.objState = v), { placeholder: 'up / unlit' })));
      box.append(row('Блокує', check(opt.objBlocks, (v) => (opt.objBlocks = v))));
      hint("Важіль, жаровня, жорна — непрохідні (герой стає поруч); руна — прохідна. Дію об'єкта описує special сценарію.");
      break;
    }
    case 'start':
      hint('До 4 гексів у стартовій кімнаті; номер — порядок героїв.');
      break;
    case 'goal':
      hint(scen.goal.type === 'reachExit' ? 'Гекси виходу (мета «дійти до виходу»).' : scen.goal.type === 'carryItem' ? 'Гекси, куди треба принести предмет.' : 'У цієї мети немає гексів: оберіть «дійти до виходу» або «принести предмет».');
      break;
    case 'los':
      hint('Клікніть два гекси: зелена лінія — видно, червона — ні. Правило рушія (src/rules/los.ts), усі кімнати відкриті.');
      if (los?.b) box.append(h('p', {}, `${hexKey(los.a)} → ${hexKey(los.b)}: ${los.clear ? 'видно' : 'не видно'}`));
      break;
    case 'inspect':
      hint('Клік показує все на гексі (праворуч) і копіює налаштування фігури чи перешкоди в інструменти.');
      break;
  }
}

function setTool(t: Tool): void {
  tool = t;
  if (t !== 'los') los = undefined;
  renderAll();
}

function renderSide(): void {
  side.replaceChildren(metaPanel(), roomsPanel(), issuesPanel(), spawnsPanel(), inspectPanel(), jsonPanel());
}

function setMeta(fn: () => void): void {
  edit(() => {
    fn();
  });
}

function metaPanel(): HTMLElement {
  const box = h('div');
  box.append(h('h3', {}, 'Сценарій'));
  box.append(
    row('Id', input(scen.id, (v) => setMeta(() => (scen.id = v)))),
    row('Номер', input(String(scen.number), (v) => setMeta(() => (scen.number = Number(v) || 1)))),
    row('Чернетка', check(scen.draft === true, (v) => setMeta(() => (v ? (scen.draft = true) : delete scen.draft)))),
  );
  const g = scen.goal;
  box.append(
    row(
      'Мета',
      select(
        [['killAll', 'перемогти всіх'], ['reachExit', 'дійти до виходу'], ['killBoss', 'перемогти боса'], ['carryItem', 'принести предмет']],
        g.type,
        (v) => setMeta(() => (scen.goal = newGoal(v as ScenarioGoal['type']))),
      ),
    ),
  );
  if (g.type === 'killBoss')
    box.append(row('Бос', select(Object.keys(content.bosses).map((id) => [id, uk[`boss.${id}`] ?? id]), g.boss, (v) => setMeta(() => (g.boss = v)))));
  if (g.type === 'carryItem') box.append(row('Предмет', input(g.item, (v) => setMeta(() => (g.item = v)))));
  box.append(row('Старт', select(roomOptions(), scen.startRoom, (v) => setMeta(() => (scen.startRoom = v)))));
  box.append(row('Нові правила', input(scen.introduces.join(', '), (v) => setMeta(() => (scen.introduces = list(v))))));
  box.append(row('Specials', input((scen.specials ?? []).join(', '), (v) => setMeta(() => (scen.specials = list(v))))));
  box.append(row('Золото', input(String(scen.reward.goldEach), (v) => setMeta(() => (scen.reward.goldEach = Number(v) || 0)))));
  box.append(row('Предмети', input((scen.reward.items ?? []).join(', '), (v) => setMeta(() => (scen.reward.items = list(v))))));
  box.append(row('Відкриває', input((scen.reward.unlock ?? []).join(', '), (v) => setMeta(() => (scen.reward.unlock = list(v))))));
  // Fork orbs.
  const atStart = new Set((scen.forkOrbs?.atStart ?? []).map((o) => o.orb));
  const startRow = h('div', { class: 'row' }, h('label', {}, 'Сфери: старт'));
  for (const orb of ORBS)
    startRow.append(
      h('label', {}, check(atStart.has(orb), (on) => setMeta(() => {
        const fo = (scen.forkOrbs ??= {});
        const list = (fo.atStart ??= []).filter((o) => o.orb !== orb);
        if (on) list.push({ orb });
        fo.atStart = list;
      })), ` ${uk[`orb.${orb}`] ?? orb}`),
    );
  box.append(startRow);
  for (const orb of ORBS) {
    const src = scen.forkOrbs?.eachRound?.find((o) => o.orb === orb)?.source ?? '';
    box.append(
      row(`щораунду ${uk[`orb.${orb}`] ?? orb}`, input(src, (v) => setMeta(() => {
        const fo = (scen.forkOrbs ??= {});
        const list = (fo.eachRound ?? []).filter((o) => o.orb !== orb);
        if (v) list.push({ orb, source: v });
        fo.eachRound = list;
      }), { placeholder: "джерело (id об'єкта)" })),
    );
  }
  return box;
}

function list(v: string): string[] {
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

function newGoal(type: ScenarioGoal['type']): ScenarioGoal {
  const old = M.goalHexes(scen);
  switch (type) {
    case 'killAll':
      return { type };
    case 'reachExit':
      return { type, hexes: old };
    case 'killBoss':
      return { type, boss: Object.keys(content.bosses)[0] ?? '' };
    case 'carryItem':
      return { type, item: '', to: old };
  }
}

function roomsPanel(): HTMLElement {
  const box = h('div', { class: 'rooms' });
  box.append(h('h3', {}, 'Кімнати (шари)'));
  scen.rooms.forEach((room, i) => {
    const el = h('div', { class: `room${room.id === activeRoom ? ' active' : ''}` });
    const sw = h('span', { class: 'swatch', title: 'зробити активною' });
    sw.style.background = ROOM_COLOURS[i % ROOM_COLOURS.length]!;
    sw.addEventListener('click', () => ((activeRoom = room.id), renderAll()));
    el.append(
      check(!hidden.has(room.id), (v) => ((v ? hidden.delete(room.id) : hidden.add(room.id)), renderBoard())),
      sw,
      h('b', {}, ROOM_LETTERS[i] ?? String(i)),
      input(room.id, (v) => edit(() => M.renameRoom(scen, room.id, v) && (activeRoom = v) !== undefined)),
      h('span', { class: 'count' }, String(room.hexes.length)),
      button('✕', () => {
        if (confirm(`Видалити кімнату ${room.id} з усім вмістом?`)) edit(() => M.deleteRoom(scen, room.id));
      }, { title: 'видалити кімнату' }),
    );
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'DIV') ((activeRoom = room.id), renderAll());
    });
    box.append(el);
  });
  box.append(
    h('div', { class: 'row' },
      button('+ кімната', () => edit(() => {
        const id = nextId(`${scen.id}.room`, new Set(scen.rooms.map((r) => r.id)));
        scen.rooms.push({ id, hexes: [] });
        activeRoom = id;
      })),
      button('Закрити межі стінами', () => edit(() => M.sealRooms(scen) > 0)),
    ),
  );
  // Drops of the active room (ключ з останнього культиста).
  const room = M.roomById(scen, activeRoom);
  if (room) {
    box.append(h('h3', {}, `Здобич з монстрів (${room.id})`));
    for (const d of room.drops ?? [])
      box.append(
        h('div', { class: 'row' }, `останній ${uk[`monster.${d.monster}`] ?? d.monster} → ${d.questItem}`,
          button('✕', () => edit(() => {
            room.drops = (room.drops ?? []).filter((x) => x !== d);
            if (room.drops.length === 0) delete room.drops;
          }))),
      );
    const monsters = [...new Set((room.spawns ?? []).map((s) => s.monster))];
    if (monsters.length) {
      let m = monsters[0]!;
      const item = input('', () => {}, { placeholder: 'tower-key' });
      box.append(
        h('div', { class: 'row' },
          select(monsters.map((x) => [x, uk[`monster.${x}`] ?? x]), m, (v) => (m = v)),
          item,
          button('+', () => item.value.trim() && edit(() => {
            (room.drops ??= []).push({ monster: m, questItem: item.value.trim() });
          })),
        ),
      );
    }
  }
  return box;
}

function issuesPanel(): HTMLElement {
  const box = h('div');
  const issues = checkAll(scen, content);
  const errors = issues.filter((i) => i.level === 'error').length;
  box.append(h('h3', {}, `Перевірка (${errors} помилок, ${issues.length - errors} попереджень)`));
  const ul = h('ul', { class: 'issues' });
  if (issues.length === 0) ul.append(h('li', { class: 'ok' }, 'Схема, перехресні перевірки й досяжність — гаразд'));
  for (const i of issues) ul.append(h('li', { class: i.level }, i.msg));
  box.append(ul);
  return box;
}

function spawnsPanel(): HTMLElement {
  const box = h('div');
  box.append(h('h3', {}, 'Монстри: зв.+ел. для 2 / 3 / 4'));
  const table = h('table');
  for (const [roomId, byMonster] of Object.entries(spawnSummary(scen))) {
    const letter = ROOM_LETTERS[scen.rooms.findIndex((r) => r.id === roomId)] ?? '?';
    for (const [monster, counts] of Object.entries(byMonster))
      table.append(h('tr', {}, h('td', {}, letter), h('td', {}, uk[`monster.${monster}`] ?? uk[`boss.${monster}`] ?? monster), h('td', {}, formatCounts(counts))));
  }
  box.append(table);
  box.append(h('p', { class: 'hint' }, scen.rooms.map((r, i) => `${ROOM_LETTERS[i]}: ${r.hexes.length}`).join(' · ') + ` · разом ${hexCount(scen)} гексів`));
  return box;
}

function inspectPanel(): HTMLElement {
  const box = h('div', { class: 'inspect' });
  if (!inspectHex) return box;
  const hex = inspectHex;
  const room = M.roomOf(scen, hex);
  box.append(h('h3', {}, `Гекс ${hexKey(hex)}${room ? ` · ${room.id}` : ''}`));
  if (!room) return box;
  for (const list of M.HEX_LISTS) {
    const e = M.entryAt(room, list, hex);
    if (e === undefined) continue;
    box.append(h('div', {}, h('code', {}, `${list}: ${JSON.stringify(e)}`), button('✕', () => edit(() => M.removeAt(room, list, hex)))));
  }
  const walls = DIRECTIONS.map((d) => add(hex, d)).filter((n) => M.wallIndexOf(scen, hex, n));
  if (walls.length) box.append(h('div', {}, `стіни до: ${walls.map(hexKey).join('  ')}`));
  if (scen.startHexes.some((s) => hexKey(s) === hexKey(hex))) box.append(h('div', {}, 'стартовий гекс'));
  if (M.goalHexes(scen).some((s) => hexKey(s) === hexKey(hex))) box.append(h('div', {}, 'гекс мети'));
  return box;
}

function jsonPanel(): HTMLElement {
  const details = h('details') as HTMLDetailsElement;
  details.append(h('summary', {}, 'JSON (можна правити вручну)'));
  const area = h('textarea', { spellcheck: 'false' }) as HTMLTextAreaElement;
  area.value = M.formatScenario(scen);
  details.append(
    area,
    button('Застосувати JSON', () => {
      try {
        const next = JSON.parse(area.value) as ScenarioDef;
        edit(() => {
          scen = next;
        });
      } catch (e) {
        alert(`JSON не розібрано: ${(e as Error).message}`);
      }
    }),
  );
  details.open = jsonOpen;
  details.addEventListener('toggle', () => (jsonOpen = details.open));
  return details;
}
let jsonOpen = false;

// ─── Files ───────────────────────────────────────────────────────────────

const filesEl = $<HTMLSelectElement>('files');
function renderFiles(): void {
  filesEl.replaceChildren(h('option', { value: '' }, 'data/scenarios/…'));
  for (const path of Object.keys(files).sort()) filesEl.append(h('option', { value: path }, path.split('/').pop() ?? path));
}
filesEl.addEventListener('change', async () => {
  const path = filesEl.value;
  filesEl.value = '';
  const loader = files[path];
  if (!loader || (dirty() && !confirm('Є незбережені зміни. Відкрити інший файл?'))) return;
  load(await loader(), path.split('/').pop() ?? path);
});

$('new').addEventListener('click', () => {
  if (dirty() && !confirm('Є незбережені зміни. Почати нову мапу?')) return;
  const ids = Object.keys(files).map((p) => Number(/s(\d+)\.json$/.exec(p)?.[1] ?? 0));
  const n = Math.max(0, ...ids) + 1;
  load(M.emptyScenario(`s${n}`, n), '');
});

const fileInput = $<HTMLInputElement>('file');
$('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    load(JSON.parse(await file.text()) as ScenarioDef, file.name);
  } catch (e) {
    alert(`Не вдалося прочитати ${file.name}: ${(e as Error).message}`);
  }
});

function download(): void {
  const blob = new Blob([M.formatScenario(scen)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${scen.id}.json` }) as HTMLAnchorElement;
  a.click();
  URL.revokeObjectURL(a.href);
  saved = M.formatScenario(scen);
  persist();
  renderStatus();
}

interface SavePicker {
  showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>;
}

async function save(): Promise<void> {
  const picker = (window as unknown as SavePicker).showSaveFilePicker;
  if (!picker) return download();
  try {
    const handle = await picker({ suggestedName: `${scen.id}.json`, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    const w = await handle.createWritable();
    await w.write(M.formatScenario(scen));
    await w.close();
    saved = M.formatScenario(scen);
    fileName = `${scen.id}.json`;
    persist();
    renderStatus();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') alert(`Не збережено: ${(e as Error).message}`);
  }
}

$('save').addEventListener('click', () => void save());
$('download').addEventListener('click', download);
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$<HTMLSelectElement>('heroes').addEventListener('change', (e) => {
  heroesView = (e.target as HTMLSelectElement).value as typeof heroesView;
  renderBoard();
});
$<HTMLInputElement>('coords').addEventListener('change', (e) => {
  coords = (e.target as HTMLInputElement).checked;
  renderBoard();
});
$<HTMLInputElement>('autoseal').addEventListener('change', (e) => {
  autoSeal = (e.target as HTMLInputElement).checked;
});

document.addEventListener('keydown', (e) => {
  const typing = (e.target as Element).matches?.('input, textarea, select') ?? false;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
  } else if (typing) return;
  else if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  } else if (!mod && !e.altKey) {
    const t = TOOLS.find(([, , key]) => key === e.key);
    if (t) setTool(t[0]);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty()) e.preventDefault();
});

/** For browser tests: the current scenario and where a hex is drawn (client px). */
Object.assign(window, {
  mapEditor: {
    get scenario() {
      return scen;
    },
    hexAt(q: number, r: number): { x: number; y: number } {
      const box = board.querySelector('svg')!.getBoundingClientRect();
      const w = hexToWorld(q, r, view.size);
      return { x: box.left + w.x + view.ox, y: box.top + w.z + view.oy };
    },
  },
});

// ─── Start ───────────────────────────────────────────────────────────────

renderFiles();
const fromUrl = new URLSearchParams(location.search).get('s');
const urlLoader = fromUrl ? Object.entries(files).find(([p]) => p.endsWith(`/${fromUrl}.json`)) : undefined;
if (urlLoader) load(await urlLoader[1](), `${fromUrl}.json`);
else if (restore()) changed();
else {
  const first = Object.entries(files).sort()[0];
  if (first) load(await first[1](), first[0].split('/').pop() ?? '');
  else changed();
}
