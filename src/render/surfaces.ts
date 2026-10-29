// How hexes look underfoot, by surface (planks in the tavern cellar, forest floor and roots on the
// thorn path, mud, wet grass and walkways in the swamp, worn stone in the tower, rock in the cave).
// Painted textures from assets/textures where they exist, the others painted here on a canvas
// (seamless, so world-space UVs run across hexes). Terrain does not swap the texture: difficult,
// hazardous and water hexes keep their surface and get a tint plus a painted overlay on top
// (scree and tufts, glowing cracks, shallow water), so they read the same in every location.

import * as THREE from 'three';
import type { SurfaceId, Terrain } from '../rules/content';
import { hexKey } from '../rules/hex';
import type { GraphicsQuality } from './quality';

export const SURFACE_IDS: readonly SurfaceId[] = ['planks', 'flagstones', 'cobblestone', 'worn-stone', 'forest-floor', 'grass', 'roots', 'mud', 'wet-grass', 'walkway', 'rock', 'glass-tiles'];

type Painter = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;

interface SurfaceDef {
  /** Texture in assets/textures painted first (the canvas paints over it). */
  base?: string;
  /** Painted on a canvas (over the base, if any). */
  paint?: Painter;
  /** Flat colour until the base loads (and of the noise fallback). */
  fallback: string;
  /** World units per repeat when larger than the usual TEXTURE_SCALE_WORLD: the canvas doubles
   *  and the texture's repeat scales the world UVs down to match. */
  world?: number;
  /** Colour of the plate's sides. */
  side: string;
  roughness: number;
}

/** Colour multiplied over the surface per terrain; difficult and hazardous also get an overlay. */
export const TERRAIN_TINT: Record<Terrain, string> = { normal: '#ffffff', difficult: '#d9cdb6', hazardous: '#ffc4ae', water: '#8fa6a8', deep: '#4f6c78', fog: '#c8ccd2' };
/** Water hexes sit lower than the others, under their water. */
export const WATER_DROP = 0.05;
/** World units per repeat of a surface texture by default (boardTiles TEXTURE_WORLD_SIZE). */
const TEXTURE_SCALE_WORLD = 2.6;

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Calls `draw` at every offset where a shape near (x, y) of reach `r` shows on a tiling canvas. */
function tiled(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
      draw(px, py);
    }
  }
}

/** How a stone floor is laid (sizes in world units). */
interface StoneStyle {
  /** Course heights (when laid in courses). */
  course: [number, number];
  /** Laid as random ashlar instead of in courses: a module (world units) and stone sizes in modules. */
  ashlar?: { module: number; w: [number, number]; h: [number, number] };
  /** Stone length as a multiple of its course height. */
  length: [number, number];
  /** Chance a stone is split into two smaller ones. */
  split: number;
  /** Joint half-width. */
  gap: number;
  /** Corner rounding, share of each side (0.5 = pebble). */
  round: number;
  /** Chance per corner of a chipped-off corner. */
  chips: number;
  /** Share of stones broken by a crack. */
  cracks: number;
  /** Dirt and moss over the joints, as multipliers of the default amount. */
  dirt: number;
  moss: number;
  grout: [number, number, number];
  /** Colour of one stone. */
  tone: (rnd: () => number) => [number, number, number];
}

type Pt = [number, number];

const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

/** A closed outline with its corners rounded by `round` (share of each side). */
function roundedPath(ctx: CanvasRenderingContext2D, pts: Pt[], round: number, ox: number, oy: number): void {
  ctx.beginPath();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n]!;
    const v = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const a: Pt = [v[0] + (p[0] - v[0]) * round, v[1] + (p[1] - v[1]) * round];
    const b: Pt = [v[0] + (q[0] - v[0]) * round, v[1] + (q[1] - v[1]) * round];
    if (i) ctx.lineTo(a[0] + ox, a[1] + oy);
    else ctx.moveTo(a[0] + ox, a[1] + oy);
    ctx.quadraticCurveTo(v[0] + ox, v[1] + oy, b[0] + ox, b[1] + oy);
  }
  ctx.closePath();
}

const rgba = ([r, g, b]: readonly number[], d = 0, a = 1) => `rgba(${Math.round(r! + d)},${Math.round(g! + d)},${Math.round(b! + d)},${a})`;

interface Stone {
  pts: Pt[];
  cx: number;
  cy: number;
  reach: number;
  tone: [number, number, number];
  /** Direction and amount of the light-to-dark tilt across the stone. */
  tilt: [number, number, number];
  specks: [number, number, number, number][];
  crack: Pt[] | null;
}

/**
 * Stones laid in courses of uneven height, each course offset, stones of uneven length (some split
 * in two), every one its own tone, tilt and outline: joints wander and change width, corners are
 * chipped, some stones cracked, and dirt and moss gather in the joints. `world` is the world size
 * of one repeat; it spans several hexes, so the pattern does not repeat across a room.
 * Everything is generated once and then drawn at each tiling offset, so the edges meet.
 */
function stones(st: StoneStyle, world: number): Painter {
  return (ctx, size, rnd) => {
    const u = size / world;
    const span = (r: [number, number]) => r[0] + rnd() * (r[1] - r[0]);
    const blob = (x: number, y: number, r: number, col: [number, number, number], a: number) => {
      tiled(size, x, y, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, rgba(col, 0, a));
        g.addColorStop(1, rgba(col, 0, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    };
    // Earthy joints, not one flat colour.
    ctx.fillStyle = rgba(st.grout);
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i++) {
      const d = (rnd() - 0.4) * 30;
      blob(rnd() * size, rnd() * size, u * (0.15 + rnd() * 0.4), [st.grout[0] + d, st.grout[1] + d, st.grout[2] + d], 0.5);
    }

    const all: Stone[] = [];
    const lay = (x: number, y: number, w: number, h: number) => {
      const g = () => st.gap * u * (0.5 + rnd() * 1.1);
      const [l, t, r, b] = [g(), g(), g(), g()];
      const corners: Pt[] = [
        [x + l, y + t],
        [x + w - r, y + t],
        [x + w - r, y + h - b],
        [x + l, y + h - b],
      ];
      const jitter = st.gap * u * 0.9;
      const pts: Pt[] = [];
      corners.forEach((c, i) => {
        const next = corners[(i + 1) % 4]!;
        const prev = corners[(i + 3) % 4]!;
        if (rnd() < st.chips) {
          // A chipped corner: cut off at an angle.
          const cut = Math.min(w, h) * (0.06 + rnd() * 0.16);
          const toward = (o: Pt, k: number): Pt => {
            const d = Math.hypot(o[0] - c[0], o[1] - c[1]) || 1;
            return [c[0] + ((o[0] - c[0]) / d) * cut * k, c[1] + ((o[1] - c[1]) / d) * cut * k];
          };
          pts.push(toward(prev, 0.6 + rnd() * 0.8), toward(next, 0.6 + rnd() * 0.8));
        } else {
          pts.push([c[0] + (rnd() - 0.5) * jitter, c[1] + (rnd() - 0.5) * jitter]);
        }
        // A bump or dent part way along the side.
        const k = 0.3 + rnd() * 0.4;
        const nx = -(next[1] - c[1]);
        const ny = next[0] - c[0];
        const nl = Math.hypot(nx, ny) || 1;
        const off = (rnd() - 0.5) * jitter * 1.6;
        pts.push([c[0] + (next[0] - c[0]) * k + (nx / nl) * off, c[1] + (next[1] - c[1]) * k + (ny / nl) * off]);
      });
      const ang = rnd() * Math.PI * 2;
      const specks: Stone['specks'] = [];
      const count = Math.round(((w * h) / (u * u)) * 40);
      for (let i = 0; i < count; i++) specks.push([x + rnd() * w, y + rnd() * h, u * (0.008 + rnd() * 0.022), (rnd() - 0.5) * 70]);
      let crack: Pt[] | null = null;
      if (rnd() < st.cracks) {
        const along = w > h;
        let px = along ? x + w * (0.25 + rnd() * 0.5) : x;
        let py = along ? y : y + h * (0.25 + rnd() * 0.5);
        crack = [[px, py]];
        for (let i = 1; i <= 5; i++) {
          if (along) {
            py = y + (h * i) / 5;
            px += (rnd() - 0.5) * h * 0.35;
          } else {
            px = x + (w * i) / 5;
            py += (rnd() - 0.5) * w * 0.2;
          }
          crack.push([px, py]);
        }
      }
      all.push({ pts, cx: x + w / 2, cy: y + h / 2, reach: Math.hypot(w, h), tone: st.tone(rnd), tilt: [Math.cos(ang), Math.sin(ang), 8 + rnd() * 16], specks, crack });
    };

    if (st.ashlar) {
      // Random ashlar: stones of a few module sizes packed on a wrapping grid, so no joint runs on
      // across the floor (as course joints do). Big stones first, anywhere (also across the
      // canvas edges), then the gaps filled in reading order with whatever fits.
      const a = st.ashlar;
      const n = Math.max(4, Math.round(world / a.module));
      const c = size / n;
      const used = new Uint8Array(n * n);
      const cell = (i: number, j: number) => wrapIndex(j, n) * n + wrapIndex(i, n);
      const pick = (r: [number, number]) => r[0] + Math.floor(rnd() * (r[1] - r[0] + 1));
      const place = (i: number, j: number, min: number) => {
        let [w, h] = [pick(a.w), pick(a.h)];
        if (rnd() < 0.3) [w, h] = [h, w];
        let ww = 1;
        while (ww < w && !used[cell(i + ww, j)]) ww++;
        let hh = 1;
        grow: while (hh < h) {
          for (let k = 0; k < ww; k++) if (used[cell(i + k, j + hh)]) break grow;
          hh++;
        }
        if (ww * hh < min) return;
        for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) used[cell(i + x, j + y)] = 1;
        lay(i * c, j * c, ww * c, hh * c);
      };
      for (let k = 0; k < n * n * 1.5; k++) {
        const i = Math.floor(rnd() * n);
        const j = Math.floor(rnd() * n);
        if (!used[cell(i, j)]) place(i, j, 4);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!used[cell(i, j)]) place(i, j, 1);
    } else {
      // Courses that add up to the canvas exactly (it tiles vertically too).
      const heights: number[] = [];
      let total = 0;
      while (total < size) {
        const h = span(st.course) * u;
        heights.push(h);
        total += h;
      }
      if (heights.length > 1 && total - size > heights[heights.length - 1]! * 0.5) total -= heights.pop()!;
      let y = 0;
      for (const h0 of heights) {
        const h = (h0 * size) / total;
        const start = rnd() * size;
        const xs = [start];
        for (let x = start; x < start + size; ) xs.push((x += h * span(st.length)));
        xs[xs.length - 1] = start + size;
        // No slivers at the seam: a short last stone merges into the one before.
        if (xs.length > 2 && xs[xs.length - 1]! - xs[xs.length - 2]! < h * 0.6) xs.splice(xs.length - 2, 1);
        for (let i = 0; i < xs.length - 1; i++) {
          const x = xs[i]!;
          const w = xs[i + 1]! - x;
          if (rnd() < st.split) {
            const f = 0.4 + rnd() * 0.2;
            if (rnd() < 0.5) {
              lay(x, y, w, h * f);
              lay(x, y + h * f, w, h * (1 - f));
            } else {
              lay(x, y, w * f, h);
              lay(x + w * f, y, w * (1 - f), h);
            }
          } else lay(x, y, w, h);
        }
        y += h;
      }
    }

    for (const s of all) {
      tiled(size, s.cx, s.cy, s.reach, (px, py) => {
        const ox = px - s.cx;
        const oy = py - s.cy;
        const [dx, dy, lift] = s.tilt;
        const half = s.reach / 2;
        const grad = ctx.createLinearGradient(px - dx * half, py - dy * half, px + dx * half, py + dy * half);
        grad.addColorStop(0, rgba(s.tone, lift));
        grad.addColorStop(1, rgba(s.tone, -lift));
        roundedPath(ctx, s.pts, st.round, ox, oy);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.save();
        ctx.clip();
        for (const [sx, sy, r, d] of s.specks) {
          ctx.fillStyle = rgba(s.tone, d, 0.35);
          ctx.beginPath();
          ctx.arc(sx + ox, sy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Worn, rounded edges: darker toward the outline.
        roundedPath(ctx, s.pts, st.round, ox, oy);
        ctx.lineWidth = u * 0.09;
        ctx.strokeStyle = rgba(s.tone, -40, 0.18);
        ctx.stroke();
        ctx.lineWidth = u * 0.025;
        ctx.strokeStyle = rgba(st.grout, 0, 0.3);
        ctx.stroke();
        if (s.crack) {
          const line = (d: number) => {
            ctx.beginPath();
            s.crack!.forEach(([cx, cy], j) => (j ? ctx.lineTo(cx + ox + d, cy + oy + d) : ctx.moveTo(cx + ox + d, cy + oy + d)));
            ctx.stroke();
          };
          ctx.strokeStyle = rgba(st.grout, 0, 0.9);
          ctx.lineWidth = u * 0.018;
          line(0);
          ctx.strokeStyle = rgba(s.tone, 30, 0.35);
          ctx.lineWidth = u * 0.008;
          line(u * 0.012);
        }
        ctx.restore();
      });
    }

    // A point somewhere on a joint (on a stone's outline).
    const onJoint = (): Pt => {
      const s = all[Math.floor(rnd() * all.length)]!;
      const i = Math.floor(rnd() * s.pts.length);
      const a = s.pts[i]!;
      const b = s.pts[(i + 1) % s.pts.length]!;
      const t = rnd();
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    // Broad stains and paler worn paths: tone that ignores the stones.
    for (let i = 0; i < 14 * st.dirt; i++) {
      const dark = rnd() < 0.6;
      blob(rnd() * size, rnd() * size, u * (0.5 + rnd() * 0.9), dark ? [46, 34, 22] : [235, 225, 205], dark ? 0.12 + rnd() * 0.12 : 0.05 + rnd() * 0.06);
    }
    // Dirt packed into the joints.
    for (let i = 0; i < 260 * st.dirt; i++) {
      const [x, y] = onJoint();
      blob(x, y, u * (0.04 + rnd() * 0.12), [40 + rnd() * 20, 30 + rnd() * 14, 20 + rnd() * 10], 0.3 + rnd() * 0.3);
    }
    // Moss: clumps of small dots along a joint.
    for (let i = 0; i < 45 * st.moss; i++) {
      const [x, y] = onJoint();
      const spread = u * (0.06 + rnd() * 0.12);
      const dots: [number, number, number, string][] = [];
      for (let k = 6 + Math.floor(rnd() * 14); k > 0; k--) {
        const shade = rnd();
        dots.push([(rnd() - 0.5) * spread * 2, (rnd() - 0.5) * spread * 2, u * (0.012 + rnd() * 0.03), rgba([58 + shade * 50, 78 + shade * 52, 36 + shade * 22], 0, 0.55 + rnd() * 0.35)]);
      }
      tiled(size, x, y, spread * 2, (cx, cy) => {
        for (const [dx, dy, r, col] of dots) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  };
}

/** World size of one repeat of the stone floors: several hexes, so a room shows no repeat. */
const STONE_WORLD = 7.2;

const FLAGSTONES: StoneStyle = {
  course: [0.55, 1.0],
  ashlar: { module: 0.34, w: [2, 4], h: [2, 3] },
  length: [0.9, 2.1],
  split: 0.14,
  gap: 0.022,
  round: 0.12,
  chips: 0.28,
  cracks: 0.16,
  dirt: 1,
  moss: 0.35,
  grout: [70, 58, 46],
  tone: (rnd) => {
    const v = 122 + rnd() * 48;
    const kind = rnd();
    if (kind < 0.15) return [v - 4, v - 4, v - 2]; // a grey stone among the sandstone
    if (kind < 0.25) return [v - 8, v - 22, v - 36]; // darker, rustier
    return [v + 14 + rnd() * 10, v + 3, v - 12 - rnd() * 10];
  },
};

const WORN_STONE: StoneStyle = {
  course: [0.45, 0.85],
  ashlar: { module: 0.36, w: [2, 4], h: [2, 3] },
  length: [0.8, 2.2],
  split: 0.18,
  gap: 0.02,
  round: 0.16,
  chips: 0.35,
  cracks: 0.22,
  dirt: 1,
  moss: 1,
  grout: [62, 60, 56],
  tone: (rnd) => {
    const v = 108 + rnd() * 46;
    const kind = rnd();
    if (kind < 0.18) return [v + 12, v + 4, v - 6]; // a warmer, browner stone
    if (kind < 0.28) return [v - 18, v - 16, v - 12]; // darker
    return [v - 2 + rnd() * 6, v + 2, v + 6 + rnd() * 6];
  },
};

/** Glass Town: big polished limestone slabs in running bond, cream with now and then a blue-grey
 *  slate, tight pale joints, hardly any dirt and no moss (swept every morning). */
const GLASS_TILES: StoneStyle = {
  course: [0.62, 0.62],
  length: [1.0, 1.0],
  split: 0,
  gap: 0.012,
  round: 0.04,
  chips: 0.05,
  cracks: 0.05,
  dirt: 0.25,
  moss: 0,
  grout: [126, 120, 110],
  tone: (rnd) => {
    const v = 146 + rnd() * 22;
    if (rnd() < 0.08) return [v - 34, v - 30, v - 24]; // a blue-grey slate
    return [v + 10, v + 2, v - 12];
  },
};

const COBBLES: StoneStyle = {
  course: [0.2, 0.34],
  ashlar: { module: 0.17, w: [2, 3], h: [2, 3] },
  length: [0.8, 1.6],
  split: 0,
  gap: 0.03,
  round: 0.5,
  chips: 0.15,
  cracks: 0.04,
  dirt: 0.8,
  moss: 0.3,
  grout: [112, 100, 84],
  tone: (rnd) => {
    const v = 136 + rnd() * 54;
    const kind = rnd();
    if (kind < 0.3) return [v + 12, v + 2, v - 10]; // warm
    if (kind < 0.45) return [v - 6, v - 2, v + 8]; // bluish
    return [v + 2, v, v - 2];
  },
};

/** Grass blades over whatever is below; `count` per canvas, `wet` darker and bluer. */
function grass(count: number, wet: boolean): Painter {
  return (ctx, size, rnd) => {
    // Clumps: patches where blades crowd.
    const clumps = Array.from({ length: wet ? 14 : 22 }, () => [rnd() * size, rnd() * size, size * (0.05 + rnd() * 0.08)] as const);
    for (const [x, y, r] of clumps) {
      tiled(size, x, y, r, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, wet ? 'rgba(52,70,40,0.55)' : 'rgba(78,104,44,0.55)');
        g.addColorStop(1, 'rgba(60,80,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const clump = clumps[i % clumps.length]!;
      const near = rnd() < 0.6;
      const x = near ? clump[0] + (rnd() - 0.5) * clump[2] * 2 : rnd() * size;
      const y = near ? clump[1] + (rnd() - 0.5) * clump[2] * 2 : rnd() * size;
      const len = size * (0.012 + rnd() * 0.022);
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.4;
      const shade = rnd();
      const col = wet ? `rgba(${70 + shade * 40},${92 + shade * 46},${50 + shade * 24},0.85)` : `rgba(${88 + shade * 70},${118 + shade * 60},${40 + shade * 30},0.9)`;
      tiled(size, x, y, len, (cx, cy) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = size * (0.0025 + rnd() * 0.002);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + Math.cos(a) * len * 0.5 + len * 0.15, cy + Math.sin(a) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
      });
    }
    if (wet) {
      // Puddle glints.
      for (let i = 0; i < 10; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        const r = size * (0.02 + rnd() * 0.035);
        tiled(size, x, y, r, (cx, cy) => {
          ctx.fillStyle = 'rgba(120,150,150,0.28)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  };
}

/** Thick tree roots winding over the forest floor. */
const roots: Painter = (ctx, size, rnd) => {
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    let a = rnd() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    for (let k = 0; k < 9; k++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * size * 0.05;
      y += Math.sin(a) * size * 0.05;
      pts.push([x, y]);
    }
    const width = size * (0.012 + rnd() * 0.016);
    tiled(size, pts[0]![0], pts[0]![1], size * 0.5, (cx, cy) => {
      const ox = cx - pts[0]![0];
      const oy = cy - pts[0]![1];
      for (const [w, col] of [[width * 1.5, 'rgba(25,16,10,0.35)'], [width, '#6a4a32'], [width * 0.35, 'rgba(190,150,105,0.5)']] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        pts.forEach(([px, py], j) => {
          const t = 1 - (j / pts.length) * 0.6;
          ctx.lineWidth = w * t;
          if (j) ctx.lineTo(px + ox, py + oy);
          else ctx.moveTo(px + ox, py + oy);
        });
        ctx.stroke();
      }
    });
  }
  grass(260, false)(ctx, size, rnd);
};

/** Planks of a walkway across dark water, with nails. */
const walkway: Painter = (ctx, size, rnd) => {
  ctx.fillStyle = '#1e2c2c';
  ctx.fillRect(0, 0, size, size);
  const planks = 6;
  const w = size / planks;
  for (let i = 0; i < planks; i++) {
    const shade = 120 + rnd() * 40;
    const x = i * w;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, `rgb(${shade - 10},${shade * 0.72},${shade * 0.48})`);
    grad.addColorStop(0.5, `rgb(${shade + 8},${shade * 0.78},${shade * 0.52})`);
    grad.addColorStop(1, `rgb(${shade - 22},${shade * 0.66},${shade * 0.44})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x + w * 0.06, 0, w * 0.88, size);
    // Grain and wet dark ends.
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = 'rgba(40,26,14,0.25)';
      ctx.lineWidth = size * 0.002;
      const gx = x + w * (0.15 + rnd() * 0.7);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + w * 0.1, size * 0.3, gx - w * 0.1, size * 0.7, gx, size);
      ctx.stroke();
    }
    for (const y of [size * 0.12, size * 0.62]) {
      ctx.fillStyle = 'rgba(30,30,30,0.7)';
      for (const nx of [x + w * 0.25, x + w * 0.75]) {
        ctx.beginPath();
        ctx.arc(nx, y + rnd() * 4, size * 0.005, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

const SURFACES: Record<SurfaceId, SurfaceDef> = {
  planks: { base: 'tavern-planks', fallback: '#8a6a4a', side: '#4e3a2a', roughness: 0.85 },
  flagstones: { paint: stones(FLAGSTONES, STONE_WORLD), world: STONE_WORLD, fallback: '#9a8a76', side: '#5a4c40', roughness: 0.92 },
  cobblestone: { paint: stones(COBBLES, STONE_WORLD), world: STONE_WORLD, fallback: '#9a948a', side: '#5c5048', roughness: 0.92 },
  'worn-stone': { paint: stones(WORN_STONE, STONE_WORLD), world: STONE_WORLD, fallback: '#8e9094', side: '#55575c', roughness: 0.9 },
  'forest-floor': { base: 'forest-floor', fallback: '#6a5a3e', side: '#4a3c2a', roughness: 0.95 },
  grass: { base: 'forest-floor', paint: grass(1400, false), fallback: '#6a7a40', side: '#4a4430', roughness: 0.95 },
  roots: { base: 'forest-floor', paint: roots, fallback: '#6a5a3e', side: '#4a3c2a', roughness: 0.95 },
  mud: { base: 'swamp-mud', fallback: '#6a5a40', side: '#40382a', roughness: 0.75 },
  'wet-grass': { base: 'swamp-mud', paint: grass(1000, true), fallback: '#5a6440', side: '#40382a', roughness: 0.8 },
  walkway: { paint: walkway, fallback: '#7a5a3c', side: '#3e2e20', roughness: 0.8 },
  rock: { base: 'cave-rock', fallback: '#6a6460', side: '#45403c', roughness: 0.95 },
  'glass-tiles': { paint: stones(GLASS_TILES, STONE_WORLD), world: STONE_WORLD, fallback: '#c8bfae', side: '#7e786e', roughness: 0.55 },
};

export function surfaceSide(id: SurfaceId): string {
  return SURFACES[id].side;
}

export function surfaceRoughness(id: SurfaceId): number {
  return SURFACES[id].roughness;
}

/** Whether the surface is painted here (no texture file) or over a texture file. */
export function surfaceBase(id: SurfaceId): string | null {
  return SURFACES[id].base ?? null;
}

export type TextureUrl = (name: string, quality: GraphicsQuality) => string | undefined;

/**
 * The surface's texture: a canvas painted at once (flat fallback colour under a painter), redrawn
 * with the base texture under the painting when that loads; `onChange` fires then. `onDraw` sees
 * the canvas after each painting, before it is uploaded (the environment derives the floor's relief).
 */
export function surfaceTexture(id: SurfaceId, quality: GraphicsQuality, url: TextureUrl, onChange: () => void, onDraw?: (canvas: HTMLCanvasElement) => void): THREE.Texture {
  const def = SURFACES[id];
  const size = (quality === 'low' ? 256 : 512) * (def.world ? 2 : 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality === 'low' ? 1 : 4;
  // The floor shaders map world XZ / TEXTURE_SCALE_WORLD to UVs, then apply the texture's transform.
  if (def.world) tex.repeat.setScalar(TEXTURE_SCALE_WORLD / def.world);
  const seed = SURFACE_IDS.indexOf(id) * 7919 + 17;
  const draw = (base: HTMLImageElement | null) => {
    ctx.fillStyle = def.fallback;
    ctx.fillRect(0, 0, size, size);
    if (base) ctx.drawImage(base, 0, 0, size, size);
    def.paint?.(ctx, size, seeded(seed));
    onDraw?.(canvas);
    tex.needsUpdate = true;
  };
  draw(null);
  const baseUrl = def.base ? url(def.base, quality) : undefined;
  if (baseUrl) {
    const img = new Image();
    img.onload = () => {
      draw(img);
      onChange();
    };
    img.src = baseUrl;
  }
  return tex;
}

/** Overlay painted over difficult hexes (scree, tufts and twigs) and hazardous ones (glowing cracks
 *  and embers): transparent where the surface should show. */
export function terrainOverlayTexture(terrain: 'difficult' | 'hazardous', quality: GraphicsQuality): THREE.Texture {
  const size = quality === 'low' ? 256 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rnd = seeded(terrain === 'difficult' ? 4242 : 911);
  if (terrain === 'difficult') {
    // Loose stones and clods.
    for (let i = 0; i < 160; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = size * (0.006 + rnd() * 0.016);
      const shade = 60 + rnd() * 60;
      tiled(size, x, y, r * 1.5, (cx, cy) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.3, cy + r * 0.35, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${shade + 20},${shade + 8},${shade - 6})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.75, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // Twigs and dry tufts.
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = size * (0.02 + rnd() * 0.04);
      const a = rnd() * Math.PI * 2;
      tiled(size, x, y, len, (cx, cy) => {
        ctx.strokeStyle = rnd() > 0.5 ? 'rgba(92,66,38,0.9)' : 'rgba(150,130,70,0.85)';
        ctx.lineWidth = size * 0.004;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.stroke();
      });
    }
  } else {
    // Glowing cracks with a dark rim, and embers.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 14; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      let a = rnd() * Math.PI * 2;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 7; k++) {
        a += (rnd() - 0.5) * 1.4;
        x += Math.cos(a) * size * 0.04;
        y += Math.sin(a) * size * 0.04;
        pts.push([x, y]);
      }
      tiled(size, pts[0]![0], pts[0]![1], size * 0.35, (cx, cy) => {
        const ox = cx - pts[0]![0];
        const oy = cy - pts[0]![1];
        for (const [w, col] of [[0.022, 'rgba(30,8,4,0.7)'], [0.011, 'rgba(255,96,32,0.95)'], [0.004, 'rgba(255,220,140,1)']] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = size * w;
          ctx.beginPath();
          pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
          ctx.stroke();
        }
      });
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = size * (0.003 + rnd() * 0.006);
      tiled(size, x, y, r * 3, (cx, cy) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
        g.addColorStop(0, 'rgba(255,200,120,0.95)');
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The surface of a hex: its per-hex override, else its room's surface, else the location's. */
export function surfaceOf(key: string, room: { surface?: SurfaceId; surfaces?: { hex: [number, number]; surface: SurfaceId }[] } | undefined, fallback: SurfaceId): SurfaceId {
  const own = room?.surfaces?.find((s) => hexKey(s.hex) === key);
  return own?.surface ?? room?.surface ?? fallback;
}
