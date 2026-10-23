// Map editor rendering: a scenario as an SVG string (flat-top hexes, axial q,r, the layout of
// src/render/hexLayout.ts). Pure, so the editor page and tools/map-editor/snapshot.mjs (PNG files
// for docs/screenshots/maps/) draw exactly the same picture.

import type { RoomDef, ScenarioDef } from '../../src/rules/content';
import { hexToWorld } from '../../src/render/hexLayout';
import { DIRECTIONS, add, hexKey, type Hex } from '../../src/rules/hex';
import { formatCounts, hexCount, spawnSummary } from './checks';
import { axialToOffset, goalHexes, hexOwners, offsetToAxial, type HeroKey, HERO_KEYS } from './model';

export interface RenderOptions {
  /** Hex corner radius in px. */
  size?: number;
  /** Show only the figures of this party size; `all` marks every spawn with its 2/3/4 ranks. */
  heroes?: HeroKey | 'all';
  /** Room ids not drawn (layers switched off). */
  hidden?: ReadonlySet<string>;
  activeRoom?: string;
  /** Faint empty hexes around the map, for painting new ones. */
  ghost?: boolean;
  coords?: boolean;
  hover?: Hex;
  los?: { a: Hex; b?: Hex; clear?: boolean };
  /** Title, rooms, spawn table and symbol key to the right of the map (for screenshots). */
  legend?: boolean;
  /** i18n table (uk) for room and monster names in the legend. */
  names?: Record<string, string>;
}

/** svg px = world * size + (ox, oy). */
export interface View {
  size: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
}

export const ROOM_COLOURS = ['#d9c79a', '#a9c7a0', '#a6bfd9', '#d6a9a0', '#c3acd6', '#d9d29a', '#9fd3c7', '#d6b38f'];
export const ROOM_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж'];

const MONSTER_GLYPH: Record<string, [string, string]> = {
  'cellar-rat': ['Пц', '#7a6a5a'],
  gremlin: ['Гр', '#5f8a3a'],
  thornling: ['Тр', '#3f7a3a'],
  'grey-wolf': ['Вв', '#6f7a86'],
  'bandit-brute': ['Гл', '#8a4a32'],
  'bandit-crossbow': ['Ар', '#a0622e'],
  'bog-slime': ['Сл', '#4f8a5a'],
  'stone-sentinel': ['Кв', '#7f7f7f'],
  'gloom-cultist': ['Кл', '#5a3f7a'],
  'shadow-wraith': ['Пр', '#3a3a5a'],
  'bog-miller': ['МБ', '#2f5a3a'],
  shadowhand: ['ТР', '#2a1a3a'],
};

export function monsterGlyph(id: string): [string, string] {
  return MONSTER_GLYPH[id] ?? [id.slice(0, 2), '#555'];
}

const OBSTACLE_COLOURS: Record<string, string> = {
  barrel: '#8a5a32',
  tree: '#2f5a2a',
  rock: '#6a6a6a',
  crate: '#9a7040',
  pillar: '#8a8a95',
  table: '#7a5030',
  bed: '#6a5a7a',
};

const OBJECT_GLYPH: Record<string, [string, string]> = {
  lever: ['Важ', '#c08a20'],
  brazier: ['Жар', '#b04a20'],
  rune: ['Руна', '#7a3ab0'],
  millstone: ['Жорна', '#7a7060'],
};

const SQ3 = Math.sqrt(3);
const FONT = "font-family=\"Segoe UI, Arial, sans-serif\"";

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

/** Ghost area: the map's offset bounding box plus a margin, at least 12 × 9. */
function gridBox(s: ScenarioDef, margin: number): { c0: number; c1: number; r0: number; r1: number } {
  const all = s.rooms.flatMap((r) => r.hexes).map(axialToOffset);
  if (all.length === 0) return { c0: 0, c1: 11, r0: 0, r1: 8 };
  const cs = all.map((o) => o[0]);
  const rs = all.map((o) => o[1]);
  let c0 = Math.min(...cs) - margin;
  // Keep column parity so the offset grid stays aligned with the axial one.
  if (c0 % 2 !== 0) c0--;
  return { c0, c1: Math.max(...cs) + margin, r0: Math.min(...rs) - margin, r1: Math.max(...rs) + margin };
}

export function viewOf(s: ScenarioDef, opts: RenderOptions = {}): View & { ghosts: Hex[] } {
  const size = opts.size ?? 30;
  const owners = hexOwners(s);
  const ghosts: Hex[] = [];
  let hexes: Hex[] = s.rooms.flatMap((r) => r.hexes);
  if (opts.ghost || hexes.length === 0) {
    const box = gridBox(s, 2);
    for (let c = box.c0; c <= box.c1; c++)
      for (let r = box.r0; r <= box.r1; r++) {
        const h = offsetToAxial(c, r);
        if (!owners.has(hexKey(h))) ghosts.push(h);
      }
    hexes = [...hexes, ...ghosts];
  }
  const pts = hexes.map(([q, r]) => hexToWorld(q, r, size));
  const minX = Math.min(...pts.map((p) => p.x)) - size - 8;
  const maxX = Math.max(...pts.map((p) => p.x)) + size + 8;
  const minY = Math.min(...pts.map((p) => p.z)) - (size * SQ3) / 2 - 8;
  const maxY = Math.max(...pts.map((p) => p.z)) + (size * SQ3) / 2 + 8;
  const top = opts.legend ? 56 : 0;
  return { size, ox: -minX, oy: -minY + top, width: maxX - minX, height: maxY - minY + top, ghosts };
}

export function renderSvg(s: ScenarioDef, opts: RenderOptions = {}): { svg: string; view: View } {
  const view = viewOf(s, opts);
  const { size, ox, oy } = view;
  const hidden = opts.hidden ?? new Set<string>();
  const heroes = opts.heroes ?? 'all';
  const center = ([q, r]: Hex): [number, number] => {
    const w = hexToWorld(q, r, size);
    return [w.x + ox, w.z + oy];
  };
  const poly = (h: Hex, scale = 1): string => {
    const [cx, cy] = center(h);
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push(`${n(cx + size * scale * Math.cos(a))},${n(cy + size * scale * Math.sin(a))}`);
    }
    return pts.join(' ');
  };
  const edge = (a: Hex, b: Hex): [number, number, number, number] => {
    const [ax, ay] = center(a);
    const [bx, by] = center(b);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const len = Math.hypot(bx - ax, by - ay);
    const px = (-(by - ay) / len) * (size / 2);
    const py = ((bx - ax) / len) * (size / 2);
    return [mx - px, my - py, mx + px, my + py];
  };
  const text = (x: number, y: number, t: string, sizePx: number, fill: string, extra = ''): string =>
    `<text x="${n(x)}" y="${n(y)}" font-size="${n(sizePx)}" fill="${fill}" text-anchor="middle" dominant-baseline="central" ${FONT} ${extra}>${esc(t)}</text>`;

  const owners = hexOwners(s);
  const roomIndex = new Map(s.rooms.map((r, i) => [r.id, i]));
  const visible = s.rooms.filter((r) => !hidden.has(r.id));
  const out: string[] = [];
  let legendWidth = 0;
  if (opts.legend) legendWidth = 360;
  const width = view.width + legendWidth;
  const height = Math.max(view.height, opts.legend ? legendHeight(s) : 0);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">`,
    `<rect width="100%" height="100%" fill="#1d2433"/>`,
  );

  for (const h of view.ghosts) out.push(`<polygon points="${poly(h, 0.96)}" fill="none" stroke="#3a4560" stroke-width="1"/>`);

  // Room hexes.
  for (const room of visible) {
    const colour = ROOM_COLOURS[(roomIndex.get(room.id) ?? 0) % ROOM_COLOURS.length]!;
    const active = room.id === opts.activeRoom;
    for (const h of room.hexes)
      out.push(`<polygon points="${poly(h, 0.97)}" fill="${colour}" stroke="${active ? '#fff7' : '#0003'}" stroke-width="1"/>`);
  }

  // Terrain.
  for (const room of visible)
    for (const t of room.terrain ?? []) {
      const [cx, cy] = center(t.hex);
      if (t.terrain === 'water') {
        out.push(`<polygon points="${poly(t.hex, 0.97)}" fill="#3f7fc4" fill-opacity="0.75"/>`);
        for (const dy of [-0.25, 0.05, 0.35])
          out.push(
            `<path d="M${n(cx - size * 0.45)},${n(cy + dy * size)} q${n(size * 0.15)},${n(-size * 0.15)} ${n(size * 0.3)},0 t${n(size * 0.3)},0 t${n(size * 0.3)},0" fill="none" stroke="#cfe6ff" stroke-width="1.5"/>`,
          );
      } else if (t.terrain === 'difficult') {
        out.push(`<polygon points="${poly(t.hex, 0.97)}" fill="#8a6a3a" fill-opacity="0.6"/>`);
        for (const dx of [-0.35, 0, 0.35])
          out.push(`<line x1="${n(cx + dx * size - 4)}" y1="${n(cy + 6)}" x2="${n(cx + dx * size + 4)}" y2="${n(cy - 6)}" stroke="#4a3a1a" stroke-width="2"/>`);
      } else if (t.terrain === 'hazardous') {
        out.push(`<polygon points="${poly(t.hex, 0.97)}" fill="#7a2a5a" fill-opacity="0.7"/>`);
        for (const [dx, dy] of [[-0.35, 0.2], [0, -0.25], [0.35, 0.2], [0, 0.45]] as const) {
          const x = cx + dx * size;
          const y = cy + dy * size;
          out.push(`<path d="M${n(x - 5)},${n(y + 4)} L${n(x)},${n(y - 7)} L${n(x + 5)},${n(y + 4)} Z" fill="#e8b0d0"/>`);
        }
      }
    }

  // Room borders (to another room or to nothing) and thin walls.
  for (const room of visible)
    for (const h of room.hexes)
      for (const d of DIRECTIONS) {
        const nb = add(h, d);
        const other = owners.get(hexKey(nb));
        if (other === room.id) continue;
        if (other && hexKey(h) > hexKey(nb) && !hidden.has(other)) continue; // draw shared borders once
        const [x1, y1, x2, y2] = edge(h, nb);
        out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${other ? '#00000055' : '#0c0f18'}" stroke-width="${other ? 2 : 3}"/>`);
      }
  for (const room of s.rooms)
    for (const [a, b] of room.walls ?? []) {
      if (hidden.has(owners.get(hexKey(a)) ?? '') && hidden.has(owners.get(hexKey(b)) ?? '')) continue;
      const [x1, y1, x2, y2] = edge(a, b);
      out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#2a1a10" stroke-width="5" stroke-linecap="round"/>`);
    }

  // Goal and start hexes.
  const goalLabel = s.goal.type === 'carryItem' ? 'вхід' : 'вихід';
  for (const h of goalHexes(s)) {
    out.push(`<polygon points="${poly(h, 0.8)}" fill="#3fbf6a33" stroke="#3fbf6a" stroke-width="2.5" stroke-dasharray="5 3"/>`);
    const [cx, cy] = center(h);
    out.push(text(cx, cy - size * 0.55, goalLabel, size * 0.3, '#145a2a', 'font-weight="700"'));
  }
  s.startHexes.forEach((h, i) => {
    const [cx, cy] = center(h);
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(size * 0.42)}" fill="#2a5fbf" stroke="#fff" stroke-width="2"/>`);
    out.push(text(cx, cy, `${i + 1}`, size * 0.45, '#fff', 'font-weight="700"'));
  });

  for (const room of visible) out.push(...roomThings(room));

  if (opts.coords)
    for (const room of visible)
      for (const h of room.hexes) {
        const [cx, cy] = center(h);
        out.push(text(cx, cy + size * 0.68, `${h[0]},${h[1]}`, size * 0.24, '#0008'));
      }

  if (opts.hover) out.push(`<polygon points="${poly(opts.hover, 0.97)}" fill="#ffffff22" stroke="#ffe066" stroke-width="2.5"/>`);

  if (opts.los) {
    const [ax, ay] = center(opts.los.a);
    out.push(`<circle cx="${n(ax)}" cy="${n(ay)}" r="${n(size * 0.2)}" fill="#ffe066"/>`);
    if (opts.los.b) {
      const [bx, by] = center(opts.los.b);
      const colour = opts.los.clear ? '#3fdf6a' : '#ff4a4a';
      out.push(
        `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${colour}" stroke-width="3" ${opts.los.clear ? '' : 'stroke-dasharray="8 5"'}/>`,
        `<circle cx="${n(bx)}" cy="${n(by)}" r="${n(size * 0.2)}" fill="${colour}"/>`,
      );
    }
  }

  if (opts.legend) out.push(...legend(s, view.width, opts));
  out.push('</svg>');
  return { svg: out.join('\n'), view: { size, ox, oy, width, height } };

  function roomThings(room: RoomDef): string[] {
    const o: string[] = [];
    for (const ob of room.obstacles ?? []) {
      const [cx, cy] = center(ob.hex);
      const colour = OBSTACLE_COLOURS[ob.model ?? ''] ?? '#555';
      if (ob.model === 'tree') {
        o.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(size * 0.62)}" fill="${colour}" stroke="#14300f" stroke-width="2"/>`);
        o.push(`<circle cx="${n(cx - size * 0.15)}" cy="${n(cy - size * 0.15)}" r="${n(size * 0.25)}" fill="#3f7a35"/>`);
      } else o.push(`<polygon points="${poly(ob.hex, 0.62)}" fill="${colour}" stroke="#111" stroke-width="2"/>`);
      if (ob.model && ob.model !== 'tree') o.push(text(cx, cy, ob.model.slice(0, 6), size * 0.24, '#fff'));
    }
    for (const t of room.traps ?? []) {
      const [cx, cy] = center(t.hex);
      const r = size * 0.38;
      o.push(`<rect x="${n(cx - r)}" y="${n(cy - r)}" width="${n(2 * r)}" height="${n(2 * r)}" rx="3" fill="#3a1010" stroke="#ff5a3a" stroke-width="2"/>`);
      o.push(`<path d="M${n(cx - r * 0.7)},${n(cy + r * 0.6)} l${n(r * 0.35)},${n(-r * 1.2)} l${n(r * 0.35)},${n(r * 1.2)} l${n(r * 0.35)},${n(-r * 1.2)} l${n(r * 0.35)},${n(r * 1.2)}" fill="none" stroke="#ffb09a" stroke-width="1.5"/>`);
      const label = `${t.damage ?? 'L'}${(t.conditions ?? []).length ? '+' : ''}`;
      o.push(text(cx + r, cy - r, label, size * 0.26, '#fff', 'font-weight="700"'));
    }
    for (const c of room.coins ?? []) {
      const [cx, cy] = center(c);
      const x = cx + size * 0.42;
      const y = cy + size * 0.38;
      o.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * 0.2)}" fill="#ffd23f" stroke="#7a5a00" stroke-width="1.5"/>`);
    }
    for (const c of room.chests ?? []) {
      const [cx, cy] = center(c.hex);
      const w = size * 0.8;
      const hgt = size * 0.52;
      o.push(`<rect x="${n(cx - w / 2)}" y="${n(cy - hgt / 2)}" width="${n(w)}" height="${n(hgt)}" rx="3" fill="#8a5a28" stroke="#3a2008" stroke-width="2"/>`);
      o.push(`<rect x="${n(cx - w / 2)}" y="${n(cy - 2)}" width="${n(w)}" height="4" fill="#ffd23f"/>`);
      if (c.loot?.questItem) o.push(`<circle cx="${n(cx + w / 2)}" cy="${n(cy - hgt / 2)}" r="${n(size * 0.16)}" fill="#ffe066" stroke="#7a5a00"/>`);
    }
    for (const ob of room.objects ?? []) {
      const [cx, cy] = center(ob.hex);
      const [label, colour] = OBJECT_GLYPH[ob.kind] ?? [ob.kind.slice(0, 4), '#888'];
      if (ob.blocks) {
        o.push(`<polygon points="${poly(ob.hex, 0.66)}" fill="${colour}" stroke="#111" stroke-width="2"/>`);
        if (ob.kind === 'brazier' && ob.state === 'lit') o.push(`<circle cx="${n(cx)}" cy="${n(cy - size * 0.2)}" r="${n(size * 0.2)}" fill="#ffb03a"/>`);
      } else
        o.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(size * 0.6)}" fill="none" stroke="${colour}" stroke-width="3" stroke-dasharray="4 3"/>`);
      o.push(text(cx, cy + (ob.blocks ? 0 : size * 0.45), label, size * 0.26, ob.blocks ? '#fff' : colour, 'font-weight="700"'));
    }
    for (const d of room.doors ?? []) {
      const [cx, cy] = center(d.hex);
      const w = size * 0.9;
      const hgt = size * 0.95;
      o.push(`<rect x="${n(cx - w / 2)}" y="${n(cy - hgt / 2)}" width="${n(w)}" height="${n(hgt)}" rx="${n(w / 2)}" ry="${n(w / 2)}" fill="#6a3a18" stroke="#ffd29a" stroke-width="2"/>`);
      const to = roomIndex.get(d.to);
      o.push(text(cx, cy, `→${to === undefined ? '?' : ROOM_LETTERS[to] ?? to}`, size * 0.36, '#ffe6c0', 'font-weight="700"'));
      if (d.key) o.push(`<circle cx="${n(cx + w / 2)}" cy="${n(cy + hgt / 2 - 4)}" r="${n(size * 0.17)}" fill="#ffd23f" stroke="#7a5a00" stroke-width="1.5"/>`, text(cx + w / 2, cy + hgt / 2 - 4, 'к', size * 0.22, '#3a2a00', 'font-weight="700"'));
    }
    for (const sp of room.spawns ?? []) {
      const [cx, cy] = center(sp.hex);
      const [abbr, colour] = monsterGlyph(sp.monster);
      const boss = abbr === 'МБ' || abbr === 'ТР';
      const rank = heroes === 'all' ? undefined : sp.by[heroes];
      const faded = heroes !== 'all' && !rank;
      const r = size * (boss ? 0.7 : 0.48);
      const ring = rank === 'elite' ? '#ffd23f' : boss ? '#ff5a5a' : '#fff';
      o.push(`<g opacity="${faded ? 0.22 : 1}">`);
      o.push(`<circle cx="${n(cx)}" cy="${n(cy - (heroes === 'all' ? size * 0.1 : 0))}" r="${n(r)}" fill="${colour}" stroke="${ring}" stroke-width="${rank === 'elite' || boss ? 3 : 2}"/>`);
      o.push(text(cx, cy - (heroes === 'all' ? size * 0.1 : 0), abbr, size * (boss ? 0.42 : 0.36), '#fff', 'font-weight="700"'));
      if (heroes === 'all' && !boss) {
        HERO_KEYS.forEach((k, i) => {
          const x = cx + (i - 1) * size * 0.3 - size * 0.12;
          const y = cy + size * 0.42;
          const rk = sp.by[k];
          const fill = rk === 'elite' ? '#ffd23f' : rk === 'normal' ? '#ffffff' : 'none';
          o.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(size * 0.24)}" height="${n(size * 0.22)}" fill="${fill}" stroke="#111" stroke-width="1"/>`);
        });
      }
      o.push('</g>');
    }
    return o;
  }
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + word;
  }
  return line ? [...lines, line] : lines;
}

function legendHeight(s: ScenarioDef): number {
  const rows = Object.values(spawnSummary(s)).reduce((k, m) => k + Object.keys(m).length, 0);
  return 160 + s.rooms.length * 24 + rows * 22 + 260;
}

function legend(s: ScenarioDef, x0: number, opts: RenderOptions): string[] {
  const names = opts.names ?? {};
  const o: string[] = [];
  const t = (x: number, y: number, str: string, sizePx: number, fill = '#e8ecf4', extra = '') =>
    o.push(`<text x="${n(x)}" y="${n(y)}" font-size="${sizePx}" fill="${fill}" ${FONT} ${extra}>${esc(str)}</text>`);
  const title = names[`scenario.${s.id}`] ?? s.id;
  t(16, 34, `${s.number}. ${title}${s.draft ? ' (чернетка)' : ''}`, 24, '#fff', 'font-weight="700"');
  let y = 40;
  const x = x0 + 8;
  for (const line of wrap(`Мета: ${names[`scenario.${s.id}.goal`] ?? s.goal.type}`, 44)) {
    t(x, y, line, 14);
    y += 19;
  }
  y += 9;
  t(x, y, `Гексів: ${hexCount(s)}`, 14, '#aab4c8');
  y += 26;
  s.rooms.forEach((room, i) => {
    o.push(`<rect x="${x}" y="${y - 13}" width="16" height="16" fill="${ROOM_COLOURS[i % ROOM_COLOURS.length]}"/>`);
    t(x + 24, y, `${names[`room.${room.id}`] ?? `${ROOM_LETTERS[i]}. ${room.id}`} — ${room.hexes.length}`, 14);
    y += 24;
  });
  y += 10;
  t(x, y, 'Монстри (зв.+ел.) для 2 / 3 / 4 героїв', 14, '#fff', 'font-weight="700"');
  y += 24;
  for (const [roomId, byMonster] of Object.entries(spawnSummary(s))) {
    const letter = ROOM_LETTERS[s.rooms.findIndex((r) => r.id === roomId)] ?? '?';
    for (const [monster, counts] of Object.entries(byMonster)) {
      const name = names[`monster.${monster}`] ?? names[`boss.${monster}`] ?? monster;
      const boss = monster === 'bog-miller' || monster === 'shadowhand';
      t(x, y, `${letter}. ${name}: ${boss ? 'бос' : formatCounts(counts)}`, 13);
      y += 22;
    }
  }
  y += 12;
  const key: [string, string][] = [
    ['#2a5fbf', 'старт героїв (1–4)'],
    ['#6a3a18', 'двері → кімната (к = з ключем)'],
    ['#2a1a10', 'стіна'],
    ['#7a2a5a', 'небезпечна місцевість (терен)'],
    ['#8a6a3a', 'важка місцевість'],
    ['#3f7fc4', 'вода (важка)'],
    ['#ff5a3a', 'пастка (L = 2 + рівень)'],
    ['#ffd23f', 'монета · ■ еліт. у спавні'],
    ['#8a5a28', 'скриня (• = сюжетний предмет)'],
    ['#3fbf6a', 'вихід / доставка'],
  ];
  for (const [c, label] of key) {
    o.push(`<rect x="${x}" y="${y - 12}" width="14" height="14" fill="${c}" stroke="#fff4"/>`);
    t(x + 22, y, label, 13, '#c8d0e0');
    y += 20;
  }
  t(x, y + 6, 'Спавн: □□□ = ранг для 2/3/4 (білий — зв., жовтий — ел.)', 12, '#aab4c8');
  return o;
}
