// The lived-in layer over a location (data in atmosphere.ts): grime, cracks, puddles, straw and
// leaves on the floor, dirt along the feet of the walls, stains, cobwebs, tapestries, ivy and banners
// on the walls, a few blocks, plinths and buttresses so wall runs are not one segment repeated, and
// warm pools of light under every flame. Decals come from two small atlases painted here in code
// (placeholders until painted textures arrive, see docs/art/atmosphere.md), all seeded by the
// scenario so they stay put between loads. A handful of draw calls in all.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseHexKey } from '../../rules/hex';
import { hexToWorld } from '../hexLayout';
import type { GraphicsQuality } from '../quality';
import { atmosphereFor, pick, type Atmosphere, type FloorDecal, type WallDecal, type WallVariant } from './atmosphere';
import { patchMaterial, type EnvUniforms } from './field';
import { onWoodFloor, seededRandom, valueNoise, type EnvLayout } from './layout';
import { STYLE_PIECES, type Placement } from './plan';
import { pieceMeta, type MaterialKey } from './pieces';
import type { EnvironmentDef } from './types';
import { straightRuns } from './walls';

// ─── Atlases ────────────────────────────────────────────────────────────────

const N = 512;
const CELLS = 4;
const C = N / CELLS;
type RGB = [number, number, number];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fbm = (u: number, v: number, s: number, seed: number): number =>
  0.5 * valueNoise(u * s + seed, v * s - seed) + 0.3 * valueNoise(u * s * 2 - seed, v * s * 2 + seed * 0.7) + 0.2 * valueNoise(u * s * 4 + seed * 1.3, v * s * 4);

/** Paints into one cell of an RGBA atlas; u, v in 0..1 within the cell, v up. */
class Painter {
  readonly data = new Uint8Array(N * N * 4);
  private ox = 0;
  private oy = 0;

  cell(i: number): this {
    this.ox = (i % CELLS) * C;
    this.oy = Math.floor(i / CELLS) * C;
    return this;
  }

  private put(px: number, py: number, c: RGB, a: number): void {
    // Keep 3 px clear around each cell so mipmaps do not bleed between cells.
    if (a <= 0.003 || px < 3 || py < 3 || px >= C - 3 || py >= C - 3) return;
    a = Math.min(1, a);
    const o = ((this.oy + py) * N + this.ox + px) * 4;
    const d = this.data;
    const da = d[o + 3]! / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) d[o + k] = Math.round((c[k]! * a + d[o + k]! * da * (1 - a)) / oa);
    d[o + 3] = Math.round(oa * 255);
  }

  fill(fn: (u: number, v: number) => [RGB, number] | null): void {
    for (let py = 0; py < C; py++)
      for (let px = 0; px < C; px++) {
        const r = fn((px + 0.5) / C, (py + 0.5) / C);
        if (r) this.put(px, py, r[0], r[1]);
      }
  }

  private area(u0: number, v0: number, u1: number, v1: number, fn: (u: number, v: number) => number, c: RGB, a: number): void {
    const x0 = Math.max(0, Math.floor(u0 * C));
    const x1 = Math.min(C - 1, Math.ceil(u1 * C));
    const y0 = Math.max(0, Math.floor(v0 * C));
    const y1 = Math.min(C - 1, Math.ceil(v1 * C));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const cov = fn((px + 0.5) / C, (py + 0.5) / C);
        if (cov > 0) this.put(px, py, c, a * cov);
      }
  }

  line(u0: number, v0: number, u1: number, v1: number, w: number, c: RGB, a: number): void {
    const dx = u1 - u0;
    const dy = v1 - v0;
    const l2 = dx * dx + dy * dy || 1e-9;
    const r = w / 2 + 1 / C;
    this.area(Math.min(u0, u1) - r, Math.min(v0, v1) - r, Math.max(u0, u1) + r, Math.max(v0, v1) + r, (u, v) => {
      const t = Math.min(1, Math.max(0, ((u - u0) * dx + (v - v0) * dy) / l2));
      const d = Math.hypot(u - u0 - dx * t, v - v0 - dy * t);
      return Math.min(1, Math.max(0, (w / 2 - d) * C + 0.5));
    }, c, a);
  }

  disc(u: number, v: number, r: number, c: RGB, a: number, soft = 0): void {
    this.area(u - r - 0.01, v - r - 0.01, u + r + 0.01, v + r + 0.01, (x, y) => {
      const d = Math.hypot(x - u, y - v);
      return soft > 0 ? smooth(r, r * (1 - soft), d) : Math.min(1, Math.max(0, (r - d) * C + 0.5));
    }, c, a);
  }

  ellipse(u: number, v: number, rx: number, ry: number, angle: number, c: RGB, a: number): void {
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const r = Math.max(rx, ry);
    this.area(u - r, v - r, u + r, v + r, (x, y) => {
      const lx = ((x - u) * cs + (y - v) * sn) / rx;
      const ly = (-(x - u) * sn + (y - v) * cs) / ry;
      return Math.min(1, Math.max(0, (1 - Math.hypot(lx, ly)) * Math.min(rx, ry) * C + 0.5));
    }, c, a);
  }

  rect(u0: number, v0: number, u1: number, v1: number, c: RGB, a: number): void {
    this.area(u0, v0, u1, v1, (x, y) => (x >= u0 && x <= u1 && y >= v0 && y <= v1 ? 1 : 0), c, a);
  }

  /** A crooked line from a point, branching now and then. */
  walk(rnd: () => number, u: number, v: number, angle: number, steps: number, step: number, w: number, c: RGB, a: number, wobble = 0.5, branch = 0.15): void {
    for (let i = 0; i < steps; i++) {
      angle += (rnd() - 0.5) * wobble;
      const nu = u + Math.cos(angle) * step;
      const nv = v + Math.sin(angle) * step;
      const k = 1 - (i / steps) * 0.6;
      this.line(u, v, nu, nv, w * k, c, a);
      if (rnd() < branch && steps - i > 2) this.walk(rnd, nu, nv, angle + (rnd() > 0.5 ? 0.9 : -0.9), Math.floor((steps - i) / 2), step * 0.8, w * k * 0.7, c, a, wobble, 0);
      u = nu;
      v = nv;
    }
  }
}

const TMP = new THREE.Vector3();
const WHITE: RGB = [235, 232, 226];

/** Floor cells: which atlas cell each kind uses, whether the location's grime colour tints it
 *  (painted near-white then multiplied) and whether it is wet (glossy material). */
export const FLOOR_CELLS: Record<FloorDecal | 'edge', { cell: number; tinted: boolean; wet?: boolean }> = {
  stain: { cell: 0, tinted: true },
  crack: { cell: 1, tinted: true },
  puddle: { cell: 2, tinted: false, wet: true },
  straw: { cell: 3, tinted: false },
  leaves: { cell: 4, tinted: false },
  debris: { cell: 5, tinted: false },
  slab: { cell: 6, tinted: false },
  planks: { cell: 7, tinted: false },
  moss: { cell: 8, tinted: false },
  slime: { cell: 9, tinted: false, wet: true },
  soot: { cell: 10, tinted: false },
  dust: { cell: 11, tinted: false },
  roots: { cell: 12, tinted: false },
  rubble: { cell: 13, tinted: false },
  edge: { cell: 14, tinted: true },
  snow: { cell: 15, tinted: false },
};

export const WALL_CELLS: Record<WallDecal, { cell: number; tinted: boolean; wet?: boolean; big?: boolean }> = {
  damp: { cell: 0, tinted: true },
  drips: { cell: 1, tinted: true },
  cobweb: { cell: 2, tinted: false },
  tapestry: { cell: 3, tinted: false, big: true },
  window: { cell: 4, tinted: false, big: true },
  ivy: { cell: 5, tinted: false },
  crack: { cell: 6, tinted: true },
  banner: { cell: 7, tinted: false, big: true },
  slit: { cell: 8, tinted: false, big: true },
  moss: { cell: 9, tinted: false },
  watermark: { cell: 10, tinted: true },
  slime: { cell: 11, tinted: false, wet: true },
  soot: { cell: 12, tinted: false },
  plaster: { cell: 13, tinted: false },
  ore: { cell: 14, tinted: false },
  frost: { cell: 15, tinted: false },
};

function paintFloor(): Uint8Array {
  const p = new Painter();
  const rnd = seededRandom('floor-atlas');
  const blob = (u: number, v: number, seed: number, rough = 0.6) => Math.hypot(u - 0.5, v - 0.5) * 2 + (fbm(u, v, 4, seed) - 0.5) * rough;

  p.cell(FLOOR_CELLS.stain.cell).fill((u, v) => [WHITE, smooth(0.95, 0.35, blob(u, v, 1)) * (0.35 + 0.45 * fbm(u, v, 9, 2))]);

  p.cell(FLOOR_CELLS.crack.cell);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd();
    p.walk(rnd, 0.5, 0.5, a, 6, 0.065, 0.05, WHITE, 0.18, 0.7, 0);
    p.walk(rnd, 0.5, 0.5, a, 6, 0.065, 0.016, WHITE, 0.95, 0.7, 0.3);
  }

  p.cell(FLOOR_CELLS.puddle.cell).fill((u, v) => {
    const d = blob(u, v, 3, 0.45);
    if (d > 0.95) return null;
    const rim = smooth(0.62, 0.8, d) * smooth(0.95, 0.82, d);
    const a = Math.max(smooth(0.82, 0.6, d) * 0.55, rim * 0.5);
    return [rim > 0.4 ? [52, 44, 36] : [78, 88, 96], a];
  });

  p.cell(FLOOR_CELLS.straw.cell);
  const straw: RGB[] = [[196, 164, 92], [160, 128, 64], [214, 186, 110], [178, 146, 78]];
  for (let i = 0; i < 70; i++) {
    const u = 0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.45;
    const v = 0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.45;
    const a = rnd() * Math.PI;
    const l = 0.06 + rnd() * 0.12;
    p.line(u, v, u + Math.cos(a) * l, v + Math.sin(a) * l, 0.009 + rnd() * 0.007, straw[i % 4]!, 0.92);
  }

  p.cell(FLOOR_CELLS.leaves.cell);
  const leaf: RGB[] = [[120, 74, 34], [150, 96, 40], [96, 90, 44], [140, 52, 30], [110, 100, 50]];
  for (let i = 0; i < 28; i++) {
    const u = 0.5 + (rnd() + rnd() - 1) * 0.42;
    const v = 0.5 + (rnd() + rnd() - 1) * 0.42;
    const a = rnd() * Math.PI;
    const rx = 0.035 + rnd() * 0.03;
    const c = leaf[i % leaf.length]!;
    p.ellipse(u, v, rx, rx * 0.5, a, c, 0.95);
    p.line(u - Math.cos(a) * rx, v - Math.sin(a) * rx, u + Math.cos(a) * rx, v + Math.sin(a) * rx, 0.005, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], 0.8);
  }

  const stones = (count: number, r0: number, r1: number, spread: number) => {
    for (let i = 0; i < count; i++) {
      const u = 0.5 + (rnd() + rnd() - 1) * spread;
      const v = 0.5 + (rnd() + rnd() - 1) * spread;
      const r = r0 + rnd() * (r1 - r0);
      const g = 96 + rnd() * 40;
      p.disc(u + r * 0.25, v - r * 0.25, r * 1.1, [10, 8, 6], 0.45, 0.6);
      p.ellipse(u, v, r, r * (0.7 + rnd() * 0.3), rnd() * Math.PI, [g, g * 0.93, g * 0.85], 1);
      p.disc(u - r * 0.3, v + r * 0.3, r * 0.35, [g + 40, g * 0.93 + 40, g * 0.85 + 40], 0.35, 0.8);
    }
  };
  p.cell(FLOOR_CELLS.debris.cell);
  stones(34, 0.01, 0.03, 0.42);

  p.cell(FLOOR_CELLS.slab.cell).fill((u, v) => {
    const e = Math.max(Math.abs(u - 0.5) / 0.38, Math.abs(v - 0.5) / 0.34) + (fbm(u, v, 6, 5) - 0.5) * 0.08;
    if (e > 1.06) return null;
    if (e > 0.95) return [[18, 14, 12], 0.75];
    return [WHITE, 0.16 + 0.12 * fbm(u, v, 10, 6)];
  });

  p.cell(FLOOR_CELLS.planks.cell);
  for (let i = 0; i < 3; i++) {
    const v0 = 0.16 + i * 0.23;
    const c: RGB = [112 + rnd() * 30, 74 + rnd() * 18, 42 + rnd() * 12];
    const u0 = 0.06 + rnd() * 0.08;
    const u1 = 0.86 + rnd() * 0.08;
    p.fill((u, v) => {
      if (v < v0 || v > v0 + 0.21 || u < u0 || u > u1) return null;
      const grain = 0.85 + 0.15 * Math.sin((v * 90 + fbm(u, v, 3, i) * 6) * 1.0);
      return [[c[0] * grain, c[1] * grain, c[2] * grain], 1];
    });
    p.rect(u0, v0, u1, v0 + 0.012, [30, 20, 14], 0.9);
    p.disc(u0 + 0.04, v0 + 0.105, 0.012, [50, 50, 54], 1);
    p.disc(u1 - 0.04, v0 + 0.105, 0.012, [50, 50, 54], 1);
  }

  p.cell(FLOOR_CELLS.moss.cell).fill((u, v) => {
    const m = smooth(0.95, 0.4, blob(u, v, 8, 0.9)) * smooth(0.42, 0.62, fbm(u, v, 7, 9));
    const g = fbm(u, v, 15, 10);
    return [[60 + g * 40, 88 + g * 40, 40 + g * 20], m * 0.95];
  });

  p.cell(FLOOR_CELLS.slime.cell).fill((u, v) => {
    const d = blob(u, v, 11, 0.8);
    const a = smooth(0.9, 0.6, d);
    const hi = smooth(0.5, 0.75, fbm(u, v, 9, 12)) * 0.5;
    return [[46 + hi * 90, 30 + hi * 60, 58 + hi * 100], a * 0.92];
  });

  p.cell(FLOOR_CELLS.soot.cell).fill((u, v) => [[16, 13, 11], smooth(1, 0.15, blob(u, v, 13, 0.7)) * (0.45 + 0.4 * fbm(u, v, 8, 14))]);

  p.cell(FLOOR_CELLS.dust.cell).fill((u, v) => [[176, 168, 156], smooth(1, 0.3, blob(u, v, 15, 0.9)) * 0.3 * fbm(u, v, 12, 16)]);

  p.cell(FLOOR_CELLS.roots.cell);
  for (let i = 0; i < 3; i++) p.walk(rnd, 0.1 + rnd() * 0.2, 0.2 + rnd() * 0.6, (rnd() - 0.5) * 0.8, 9, 0.085, 0.035, [88, 62, 40], 1, 0.6, 0.3);

  p.cell(FLOOR_CELLS.rubble.cell);
  stones(9, 0.04, 0.07, 0.3);
  stones(14, 0.012, 0.025, 0.4);

  p.cell(FLOOR_CELLS.edge.cell).fill((u, v) => [WHITE, Math.pow(1 - v, 1.6) * (0.5 + 0.5 * fbm(u, v, 5, 17)) * smooth(0, 0.12, u) * smooth(1, 0.88, u)]);

  // Blown snow: a soft drift with a streaky edge along the wind.
  p.cell(FLOOR_CELLS.snow.cell).fill((u, v) => {
    const d = blob(u, v * 1.4 - 0.2, 19, 0.85);
    const streak = 0.75 + 0.25 * Math.sin(u * 30 + fbm(u, v, 4, 20) * 8);
    const g = 214 + 30 * fbm(u, v, 10, 21);
    return [[g * 0.96, g * 0.98, g], smooth(0.95, 0.45, d) * streak * 0.9];
  });
  return p.data;
}

function paintWalls(): Uint8Array {
  const p = new Painter();
  const rnd = seededRandom('wall-atlas');

  p.cell(WALL_CELLS.damp.cell).fill((u, v) => {
    const d = Math.hypot((u - 0.5) / 0.42, (v - 0.1) / 0.85) + (fbm(u, v, 4, 21) - 0.5) * 0.5;
    const tide = smooth(0.78, 0.9, d) * smooth(1.0, 0.9, d);
    return [WHITE, Math.max(smooth(0.95, 0.3, d) * 0.5, tide * 0.55) * (0.6 + 0.4 * fbm(u, v, 10, 22))];
  });

  p.cell(WALL_CELLS.drips.cell);
  for (let i = 0; i < 9; i++) {
    const u = 0.1 + rnd() * 0.8;
    const len = 0.3 + rnd() * 0.55;
    const w = 0.012 + rnd() * 0.022;
    for (let k = 0; k < 12; k++) {
      const v0 = 0.96 - (len * k) / 12;
      p.line(u, v0, u + (rnd() - 0.5) * 0.004, v0 - len / 12, w * (1 - k / 16), WHITE, 0.75 * (1 - k / 13));
    }
    p.disc(u, 0.96 - len, w * 0.7, WHITE, 0.5);
  }

  p.cell(WALL_CELLS.cobweb.cell);
  {
    // Anchored in the top-left corner; spokes fan down and right, threads sag between them.
    const web: RGB = [226, 226, 222];
    const spokes = 7;
    const ends: [number, number][] = [];
    for (let s = 0; s < spokes; s++) {
      const a = -((s + 0.5) / spokes) * (Math.PI / 2);
      const len = 0.8 + rnd() * 0.15;
      ends.push([Math.cos(a), Math.sin(a)]);
      p.line(0.04, 0.96, 0.04 + Math.cos(a) * len, 0.96 + Math.sin(a) * len, 0.007, web, 0.6);
    }
    for (let ring = 1; ring <= 6; ring++) {
      const r = ring * 0.12 + rnd() * 0.03;
      for (let s = 0; s + 1 < spokes; s++) {
        const [ax, ay] = ends[s]!;
        const [bx, by] = ends[s + 1]!;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const sag = 0.88;
        p.line(0.04 + ax * r, 0.96 + ay * r, 0.04 + mx * r * sag, 0.96 + my * r * sag, 0.005, web, 0.5);
        p.line(0.04 + mx * r * sag, 0.96 + my * r * sag, 0.04 + bx * r, 0.96 + by * r, 0.005, web, 0.5);
      }
    }
  }

  p.cell(WALL_CELLS.tapestry.cell).fill((u, v) => {
    if (u < 0.17 || u > 0.83 || v > 0.89) return null;
    const fringe = v < 0.11;
    if (fringe) return Math.sin(u * 160) > 0 && v > 0.05 + 0.02 * fbm(u, v, 20, 23) ? [[176, 138, 62], 1] : null;
    const fold = 0.82 + 0.18 * Math.sin(u * 38);
    const border = u < 0.21 || u > 0.79 || v < 0.15 || v > 0.85;
    const diamond = Math.abs(Math.abs(u - 0.5) * 1.6 + Math.abs(v - 0.5) - 0.22) < 0.018 || Math.abs(Math.abs(u - 0.5) * 1.6 + Math.abs(v - 0.5) - 0.1) < 0.015;
    const c: RGB = border || diamond ? [176, 138, 62] : [122, 30, 36];
    const wear = 0.9 + 0.1 * fbm(u, v, 14, 24);
    return [[c[0] * fold * wear, c[1] * fold * wear, c[2] * fold * wear], 1];
  });
  p.rect(0.12, 0.89, 0.88, 0.93, [70, 46, 28], 1);
  p.disc(0.12, 0.91, 0.025, [90, 60, 36], 1);
  p.disc(0.88, 0.91, 0.025, [90, 60, 36], 1);

  p.cell(WALL_CELLS.window.cell);
  p.rect(0.2, 0.22, 0.8, 0.86, [150, 140, 128], 1);
  p.fill((u, v) => {
    if (u < 0.27 || u > 0.73 || v < 0.3 || v > 0.79) return null;
    const t = smooth(0.3, 0.79, v);
    return [[16 + t * 50, 18 + t * 58, 26 + t * 76], 1];
  });
  for (const u of [0.38, 0.5, 0.62]) {
    p.rect(u - 0.016, 0.3, u + 0.016, 0.79, [38, 38, 42], 1);
    p.rect(u - 0.016, 0.3, u - 0.006, 0.79, [86, 86, 92], 1);
  }
  p.rect(0.27, 0.53, 0.73, 0.56, [38, 38, 42], 1);
  p.rect(0.17, 0.2, 0.83, 0.25, [176, 166, 152], 1);

  p.cell(WALL_CELLS.ivy.cell);
  {
    const greens: RGB[] = [[56, 94, 40], [74, 112, 46], [44, 76, 36], [88, 120, 52]];
    for (let i = 0; i < 4; i++) {
      let u = 0.2 + rnd() * 0.6;
      let v = 0.97;
      let a = -Math.PI / 2 + (rnd() - 0.5) * 0.5;
      const steps = 10 + Math.floor(rnd() * 8);
      for (let k = 0; k < steps; k++) {
        a += (rnd() - 0.5) * 0.7;
        a = Math.min(-0.6, Math.max(-Math.PI + 0.6, a));
        const nu = u + Math.cos(a) * 0.05;
        const nv = v + Math.sin(a) * 0.05;
        p.line(u, v, nu, nv, 0.012, [70, 56, 34], 1);
        for (let l = 0; l < 2; l++) {
          const s = 0.03 + rnd() * 0.025;
          p.ellipse(nu + (rnd() - 0.5) * 0.06, nv + (rnd() - 0.5) * 0.05, s, s * 0.75, rnd() * Math.PI, greens[(k + l) % 4]!, 1);
        }
        u = nu;
        v = nv;
        if (v < 0.06) break;
      }
    }
  }

  p.cell(WALL_CELLS.crack.cell);
  p.walk(rnd, 0.5, 0.95, -Math.PI / 2, 11, 0.08, 0.05, WHITE, 0.18, 0.9, 0);
  p.walk(rnd, 0.5, 0.95, -Math.PI / 2, 11, 0.08, 0.018, WHITE, 0.95, 0.9, 0.35);

  p.cell(WALL_CELLS.banner.cell).fill((u, v) => {
    if (u < 0.3 || u > 0.7 || v > 0.9) return null;
    const notch = 0.06 + 0.1 * (1 - Math.abs(u - 0.5) / 0.2);
    if (v < 0.16 - notch + 0.06) return null;
    const fold = 0.8 + 0.2 * Math.sin(u * 46);
    const border = u < 0.33 || u > 0.67;
    const emblem = Math.abs(Math.hypot(u - 0.5, v - 0.6) - 0.08) < 0.016 || (Math.abs(u - 0.5) < 0.012 && Math.abs(v - 0.6) < 0.07);
    const c: RGB = border || emblem ? [184, 146, 66] : [44, 62, 116];
    return [[c[0] * fold, c[1] * fold, c[2] * fold], 1];
  });
  p.rect(0.26, 0.9, 0.74, 0.93, [62, 42, 26], 1);

  p.cell(WALL_CELLS.slit.cell);
  p.rect(0.36, 0.18, 0.64, 0.86, [160, 150, 140], 0.95);
  p.rect(0.465, 0.25, 0.535, 0.8, [12, 12, 16], 1);
  p.rect(0.41, 0.53, 0.59, 0.565, [12, 12, 16], 1);

  p.cell(WALL_CELLS.moss.cell).fill((u, v) => {
    const m = smooth(0.8, 0.1, v + (fbm(u, v, 5, 31) - 0.5) * 0.5) * smooth(0.4, 0.6, fbm(u, v, 8, 32)) * smooth(0, 0.1, u) * smooth(1, 0.9, u);
    const g = fbm(u, v, 16, 33);
    return [[56 + g * 40, 84 + g * 40, 38 + g * 20], m];
  });

  p.cell(WALL_CELLS.watermark.cell).fill((u, v) => {
    const line = 0.4 + (fbm(u, v * 0.2, 6, 34) - 0.5) * 0.08;
    const below = v < line ? 0.32 + 0.15 * fbm(u, v, 9, 35) : 0;
    const tide = smooth(0.03, 0, Math.abs(v - line)) * 0.75 + smooth(0.02, 0, Math.abs(v - line - 0.16)) * 0.3;
    return [WHITE, Math.max(below, tide) * smooth(0, 0.06, u) * smooth(1, 0.94, u)];
  });

  p.cell(WALL_CELLS.slime.cell).fill((u, v) => {
    const top = v > 0.82 + (fbm(u, 0, 8, 36) - 0.5) * 0.1;
    const col = Math.floor(u * 7);
    const len = 0.25 + 0.5 * fbm(col, 0, 1, 37);
    const du = Math.abs(u - (col + 0.5) / 7);
    const drip = v > 0.82 - len && du < 0.02 + 0.015 * (v - (0.82 - len)) * 0 + (v < 0.86 - len ? 0.02 : 0);
    if (!top && !drip) return null;
    const hi = smooth(0.55, 0.8, fbm(u, v, 10, 38)) * 0.5;
    return [[46 + hi * 90, 30 + hi * 60, 58 + hi * 100], 0.92];
  });

  p.cell(WALL_CELLS.soot.cell).fill((u, v) => {
    const w = 0.1 + 0.32 * v;
    return [[14, 12, 10], smooth(w, 0, Math.abs(u - 0.5)) * Math.pow(1 - v, 0.6) * smooth(0, 0.1, v) * (0.55 + 0.45 * fbm(u, v, 6, 39)) * 0.85];
  });

  p.cell(WALL_CELLS.plaster.cell).fill((u, v) => {
    const d = Math.hypot(u - 0.5, (v - 0.5) * 1.2) * 2 + (fbm(u, v, 5, 40) - 0.5) * 0.6;
    if (d > 0.92) return null;
    if (d > 0.84) return [[60, 52, 44], 0.6];
    const g = 186 + 20 * fbm(u, v, 12, 41);
    return [[g, g * 0.95, g * 0.86], 0.8];
  });

  // A copper vein: a crooked bright seam with green-blue weathering around it.
  p.cell(WALL_CELLS.ore.cell);
  p.walk(rnd, 0.08, 0.3 + rnd() * 0.3, 0.5, 12, 0.075, 0.07, [52, 86, 78], 0.5, 0.7, 0.2);
  p.walk(rnd, 0.08, 0.35 + rnd() * 0.3, 0.45, 12, 0.075, 0.03, [196, 124, 62], 1, 0.7, 0.3);
  for (let i = 0; i < 6; i++) p.disc(0.2 + rnd() * 0.6, 0.25 + rnd() * 0.5, 0.02 + rnd() * 0.02, [226, 160, 84], 1);

  // Rime and snow caught on a cliff face, thickest on the top and on the ledges.
  p.cell(WALL_CELLS.frost.cell).fill((u, v) => {
    const top = smooth(0.55, 0.95, v + (fbm(u, v, 6, 42) - 0.5) * 0.3);
    const ledge = smooth(0.05, 0, Math.abs(v - 0.45 - (fbm(u, 0, 5, 43) - 0.5) * 0.1)) * 0.8;
    const g = 220 + 30 * fbm(u, v, 12, 44);
    return [[g * 0.95, g * 0.98, g], Math.max(top, ledge) * smooth(0, 0.08, u) * smooth(1, 0.92, u) * (0.6 + 0.4 * fbm(u, v, 9, 45))];
  });
  return p.data;
}

let floorAtlas: THREE.DataTexture | null = null;
let wallAtlas: THREE.DataTexture | null = null;

function atlasTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Quads with atlas UVs and RGBA vertex colours, merged into one geometry. */
class Quads {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  /** Centre c, half-extent vectors u (texture right) and v (texture up), normal n. */
  add(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3, cell: number, color: THREE.Color, alpha: number, flipU = false): void {
    // Wind the quad to face along n (mirroring u mirrors the texture back).
    if (TMP.crossVectors(u, v).dot(n) < 0) {
      u = u.clone().negate();
      flipU = !flipU;
    }
    const cu = (cell % CELLS) / CELLS;
    const cv = Math.floor(cell / CELLS) / CELLS;
    const s = 1 / CELLS;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const base = this.pos.length / 3;
    for (const [a, b] of corners) {
      this.pos.push(c.x + u.x * a + v.x * b, c.y + u.y * a + v.y * b, c.z + u.z * a + v.z * b);
      this.nrm.push(n.x, n.y, n.z);
      const tu = (flipU ? -a : a) * 0.5 + 0.5;
      this.uv.push(cu + tu * s, cv + (b * 0.5 + 0.5) * s);
      this.col.push(color.r, color.g, color.b, alpha);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface AtmosphereInput {
  layout: EnvLayout;
  def: EnvironmentDef;
  quality: GraphicsQuality;
  placements: readonly Placement[];
  partitions: readonly { x: number; z: number }[][];
  uniforms: EnvUniforms;
  /** The environment's own material for a palette key (wall variants share its draw calls). */
  material: (key: MaterialKey) => THREE.Material;
}

export interface AtmosphereBuild {
  root: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

const FLOOR_SIZE: Record<FloorDecal, [number, number]> = {
  stain: [0.9, 1.6], crack: [0.7, 1.2], puddle: [0.8, 1.4], straw: [0.6, 1.0], leaves: [0.7, 1.1], debris: [0.5, 0.8], slab: [0.55, 0.7],
  planks: [0.8, 1.0], moss: [0.8, 1.4], slime: [0.9, 1.5], soot: [0.8, 1.2], dust: [1.2, 1.8], roots: [0.8, 1.2], rubble: [0.5, 0.8], snow: [1.0, 1.8],
};

const POOL_RADIUS = { flame: 1.7, lantern: 2.1, crystal: 1.5, window: 1.3 } as const;
const POOL_QUALITY: Record<GraphicsQuality, number> = { low: 1.2, medium: 0.6, high: 0.5 };

export function buildAtmosphere(input: AtmosphereInput): AtmosphereBuild {
  const { layout, def, quality, uniforms } = input;
  const atm = atmosphereFor(def.id);
  const root = new THREE.Group();
  root.name = 'env:atmosphere';
  const disposables: { dispose(): void }[] = [];
  const low = quality === 'low';
  floorAtlas ??= atlasTexture(paintFloor());
  wallAtlas ??= atlasTexture(paintWalls());

  const decalMaterial = (map: THREE.Texture, wet: boolean, side: THREE.Side = THREE.FrontSide): THREE.Material => {
    const o = { map, transparent: true, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side };
    const m = low ? new THREE.MeshLambertMaterial(o) : new THREE.MeshStandardMaterial({ ...o, roughness: wet ? 0.12 : 1, metalness: 0, envMapIntensity: wet ? 1.4 : 0.6 });
    patchMaterial(m, uniforms, 'prop');
    disposables.push(m);
    return m;
  };
  const addMesh = (q: Quads, m: THREE.Material, name: string, order: number) => {
    if (q.empty) return;
    const g = q.build();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.renderOrder = order;
    mesh.receiveShadow = !low;
    root.add(mesh);
    disposables.push(g);
  };

  const floor = new Quads();
  const floorWet = new Quads();
  buildFloor(input, atm, floor, floorWet);
  addMesh(floor, decalMaterial(floorAtlas, false), 'env:decals:floor', -0.6);
  addMesh(floorWet, decalMaterial(floorAtlas, true), 'env:decals:wet', -0.55);

  const walls = new Quads();
  const wallsWet = new Quads();
  const extras = new Map<MaterialKey, THREE.BufferGeometry[]>();
  buildWalls(input, atm, walls, wallsWet, extras);
  addMesh(walls, decalMaterial(wallAtlas, false), 'env:decals:walls', 0);
  addMesh(wallsWet, decalMaterial(wallAtlas, true), 'env:decals:walls-wet', 0);
  for (const [key, list] of extras) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, input.material(key));
    mesh.name = `env:wall-variants:${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = quality === 'high';
    root.add(mesh);
    disposables.push(merged);
  }

  const pools = buildPools(input, atm);
  if (pools) {
    root.add(pools.mesh);
    disposables.push(pools.mesh.geometry, pools.mesh.material as THREE.Material, { dispose: () => pools.mesh.dispose() });
  }

  return {
    root,
    update: (time) => {
      if (pools) pools.time.value = time;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** What a stone-looking floor decal becomes on planks. */
const WOOD_DECAL: Partial<Record<FloorDecal, FloorDecal>> = { slab: 'planks', crack: 'stain', rubble: 'debris' };

function buildFloor(input: AtmosphereInput, atm: Atmosphere, dry: Quads, wet: Quads): void {
  const { layout, quality } = input;
  const rnd = seededRandom(`grime:${layout.scenarioId}`);
  const grime = new THREE.Color(atm.grime);
  const white = new THREE.Color(1, 1, 1);
  const density = atm.floor.density * (quality === 'low' ? 0.7 : 1);
  const c = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  let layer = 0;
  const hexes: [string, boolean][] = [...[...layout.footprint.keys()].map((k): [string, boolean] => [k, true]), ...[...layout.ring.keys()].map((k): [string, boolean] => [k, false])];
  for (const [key, playable] of hexes) {
    const centre = hexToWorld(...parseHexKey(key));
    const wood = onWoodFloor(layout, key);
    const count = Math.floor(density + rnd());
    for (let i = 0; i < count; i++) {
      let kind = pick(atm.floor.kinds, rnd());
      if (playable && kind === 'rubble') kind = 'debris';
      // A wooden floor gets no stone on it: its slabs, cracks and rubble turn to wood and dirt
      // (the same draws from the seed, so the rest of the floor keeps its decals).
      const look = wood ? (WOOD_DECAL[kind] ?? kind) : kind;
      const info = FLOOR_CELLS[look];
      const [s0, s1] = FLOOR_SIZE[kind];
      const size = (s0 + rnd() * (s1 - s0)) * (playable ? 0.85 : 1);
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.6;
      c.set(centre.x + Math.cos(a) * r, 0.003 + (layer++ % 50) * 0.00004, centre.z + Math.sin(a) * r);
      const rot = rnd() * Math.PI * 2;
      u.set(Math.cos(rot), 0, -Math.sin(rot)).multiplyScalar(size / 2);
      v.set(Math.sin(rot), 0, Math.cos(rot)).multiplyScalar(-size / 2);
      let color = info.tinted ? grime : white;
      // Some slabs are darker than the floor, some lighter.
      if (kind === 'slab' && rnd() < 0.5) color = look === 'slab' ? new THREE.Color(0.25, 0.22, 0.2) : white.clone().multiplyScalar(0.9);
      else if (!info.tinted) color = white.clone().multiplyScalar(0.8 + rnd() * 0.25);
      (info.wet ? wet : dry).add(c, u, v, UP, info.cell, color, playable ? 0.8 : 1, rnd() < 0.5);
    }
  }

  // Dirt along the feet of the walls (and both sides of the walls between rooms): the texture's
  // v = 0 lies on the wall line.
  if (atm.edge <= 0) return;
  const edge = FLOOR_CELLS.edge;
  const strip = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, width: number, alpha: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.round(len / 1.2));
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const piece = len / count;
    for (let k = 0; k < count; k++) {
      const t = piece * (k + 0.5);
      c.set(ax + dx * t + nx * width * 0.5, 0.0025, az + dz * t + nz * width * 0.5);
      u.set(dx, 0, dz).multiplyScalar(piece * 0.62);
      v.set(nx, 0, nz).multiplyScalar(width * 0.5);
      // Texture v = 0 sits on the wall line.
      dry.add(c, u, v, UP, edge.cell, grime, alpha * (0.8 + rnd() * 0.4), rnd() < 0.5);
    }
  };
  for (const r of straightRuns(layout)) {
    if (r.door) continue;
    // The run's normal points out of the map; the dirt lies on the inner side.
    strip(r.ax, r.az, r.bx, r.bz, -r.nx, -r.nz, 0.9, atm.edge);
  }
  for (const line of input.partitions)
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l;
      const nz = (b.x - a.x) / l;
      strip(a.x, a.z, b.x, b.z, nx, nz, 0.6, atm.edge * 0.75);
      strip(a.x, a.z, b.x, b.z, -nx, -nz, 0.6, atm.edge * 0.75);
    }
}

interface DecalSpot {
  w: number;
  h: number;
  x: number;
  y: number;
  flip?: boolean;
}

/** Where a decal of this kind goes on a wall of length `len` and height `h` (local frame: X along
 *  the wall, Y up from the floor). */
function wallSpot(kind: WallDecal, len: number, h: number, rnd: () => number): DecalSpot {
  const r = (a: number, b: number) => a + rnd() * (b - a);
  switch (kind) {
    case 'damp': {
      const hh = Math.min(h, r(0.6, 1.1));
      return { w: r(0.5, 0.9), h: hh, x: r(-0.25, 0.25), y: hh / 2 };
    }
    case 'drips': {
      const hh = r(0.6, 0.9);
      return { w: r(0.6, 0.9), h: hh, x: r(-0.2, 0.2), y: h - 0.05 - hh / 2 };
    }
    case 'cobweb': {
      const s = r(0.45, 0.6);
      const right = rnd() < 0.5;
      return { w: s, h: s, x: (right ? 1 : -1) * (len / 2 - s / 2 - 0.02), y: h - 0.03 - s / 2, flip: right };
    }
    case 'tapestry':
      return { w: 0.56, h: 0.82, x: 0, y: Math.min(h * 0.55, h - 0.5) };
    case 'window':
      return { w: 0.46, h: 0.46, x: r(-0.15, 0.15), y: h - 0.42 };
    case 'ivy': {
      const hh = Math.min(h, r(0.8, 1.3));
      return { w: r(0.7, 1.0), h: hh, x: r(-0.2, 0.2), y: h - hh / 2 };
    }
    case 'crack':
      return { w: r(0.4, 0.6), h: r(0.5, 0.8), x: r(-0.25, 0.25), y: r(0.5, h - 0.4) };
    case 'banner':
      return { w: 0.46, h: Math.min(1.05, h - 0.2), x: 0, y: h * 0.55 };
    case 'slit':
      return { w: 0.36, h: 0.76, x: 0, y: h * 0.58 };
    case 'moss': {
      const hh = r(0.5, 0.7);
      return { w: r(0.8, 1.0), h: hh, x: r(-0.1, 0.1), y: hh / 2 };
    }
    case 'watermark':
      return { w: len, h: 0.7, x: 0, y: 0.35 };
    case 'slime': {
      const hh = r(0.7, 1.0);
      return { w: r(0.7, 1.0), h: hh, x: r(-0.15, 0.15), y: h - hh / 2 };
    }
    case 'soot':
      return { w: 0.55, h: Math.max(0.3, h - 1.12), x: 0, y: 1.12 + Math.max(0.3, h - 1.12) / 2 };
    case 'plaster':
      return { w: r(0.4, 0.6), h: r(0.35, 0.5), x: r(-0.25, 0.25), y: r(0.5, h - 0.35) };
    case 'ore':
      return { w: r(0.6, 0.85), h: r(0.5, 0.7), x: r(-0.15, 0.15), y: r(0.55, h - 0.5) };
    case 'frost':
      return { w: len, h: Math.min(1.2, h), x: 0, y: h - Math.min(1.2, h) / 2 };
  }
}

function buildWalls(input: AtmosphereInput, atm: Atmosphere, dry: Quads, wet: Quads, extras: Map<MaterialKey, THREE.BufferGeometry[]>): void {
  const { def, placements, layout, quality } = input;
  const rnd = seededRandom(`walls:${layout.scenarioId}`);
  const wallH = def.walls?.height ?? 1.6;
  const sconce = def.walls?.sconce?.piece;
  const plainWalls = new Set(Object.values(STYLE_PIECES).map((s) => s.wall));
  const torches = placements.filter((p) => p.piece === sconce);
  const grime = new THREE.Color(atm.grime);
  const white = new THREE.Color(1, 1, 1);
  const smallKinds = atm.walls.kinds.filter(([k]) => !WALL_CELLS[k].big);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const az = new THREE.Vector3();
  let sinceBig = 9;
  let layer = 0;

  const decal = (p: Placement, kind: WallDecal, spot: DecalSpot) => {
    const info = WALL_CELLS[kind];
    ax.set(Math.cos(p.rot), 0, -Math.sin(p.rot));
    az.set(Math.sin(p.rot), 0, Math.cos(p.rot));
    const off = 0.035 + (layer++ % 6) * 0.004;
    const c = new THREE.Vector3(p.x, 0, p.z).addScaledVector(ax, spot.x).addScaledVector(az, off).setY((p.y ?? 0) + spot.y);
    const u = ax.clone().multiplyScalar(spot.w / 2);
    const v = new THREE.Vector3(0, spot.h / 2, 0);
    const color = info.tinted ? grime : white.clone().multiplyScalar(0.85 + rnd() * 0.2);
    (info.wet ? wet : dry).add(c, u, v, az.clone(), info.cell, color, 1, !!spot.flip);
  };

  const box = (p: Placement, key: MaterialKey, size: [number, number, number], at: [number, number, number]) => {
    const g = new THREE.BoxGeometry(...size);
    g.translate(...at);
    q.setFromAxisAngle(UP, p.rot);
    m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const tint = 0.85 + rnd() * 0.2;
    for (let i = 0; i < pos.count; i++) colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = tint * (0.6 + 0.4 * Math.min(1, pos.getY(i) / 0.55));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    let list = extras.get(key);
    if (!list) extras.set(key, (list = []));
    list.push(g);
  };

  for (const p of placements) {
    const meta = pieceMeta(p.piece);
    if (meta?.kind !== 'wall' || p.band !== 'edge' || p.height < wallH * 0.8) continue;
    const len = 1.06 * (p.sx ?? 1) * p.scale;
    const h = p.height;
    const plain = plainWalls.has(p.piece);
    const timber = p.piece.startsWith('timber');
    const mine = p.piece.startsWith('mine');
    const torch = torches.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.05);
    sinceBig++;

    // A variant of the segment itself.
    let variant: WallVariant = plain ? pick(atm.variants, rnd()) : 'plain';
    if (quality === 'low' && variant === 'blocks') variant = 'plain';
    if (timber && (variant === 'blocks' || variant === 'buttress')) variant = 'beam';
    if (mine && (variant === 'blocks' || variant === 'plinth')) variant = 'plain';
    const dark: MaterialKey = timber ? 'woodDark' : 'stoneDark';
    if (variant === 'buttress') box(p, dark, [0.22, h * 0.97, 0.1], [0, (h * 0.97) / 2, 0.05]);
    else if (variant === 'plinth') box(p, dark, [len, 0.22, 0.07], [0, 0.11, 0.035]);
    else if (variant === 'beam') {
      box(p, 'woodDark', [0.12, h, 0.08], [(rnd() - 0.5) * 0.5, h / 2, 0.04]);
      box(p, 'wood', [len, 0.1, 0.06], [0, h * 0.62, 0.03]);
    } else if (variant === 'support') {
      // An extra timber set in the middle of a mine run: a post and a short cap on wedges.
      box(p, 'woodDark', [0.13, h - 0.1, 0.13], [0, (h - 0.1) / 2, 0.07]);
      box(p, 'wood', [0.5, 0.13, 0.16], [0, h - 0.17, 0.07]);
      box(p, 'wood', [0.16, 0.06, 0.14], [0.12, h - 0.08, 0.07]);
    } else if (variant === 'chains') {
      // Chains hanging from iron rings set into the forge wall, one ending in a hook.
      for (const x of [-0.25, 0.2]) {
        box(p, 'iron', [0.09, 0.06, 0.06], [x, h - 0.2, 0.03]);
        const n = 5 + Math.floor(rnd() * 5);
        for (let i = 0; i < n; i++) box(p, 'iron', i % 2 ? [0.02, 0.07, 0.05] : [0.05, 0.07, 0.02], [x, h - 0.27 - i * 0.065, 0.06]);
      }
    } else if (variant === 'blocks') {
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) box(p, rnd() < 0.5 ? 'stoneLight' : 'stoneDark', [0.18 + rnd() * 0.14, 0.1 + rnd() * 0.06, 0.05], [(rnd() - 0.5) * 0.8 * len, 0.25 + rnd() * (h - 0.5), 0.02]);
    }
    const awayFromCentre = variant === 'buttress' || variant === 'support';

    if (torch) {
      decal(p, 'soot', wallSpot('soot', len, h, rnd));
      continue;
    }
    if (rnd() >= atm.walls.share) continue;
    let kinds = plain && sinceBig >= 3 ? atm.walls.kinds : smallKinds;
    if (!kinds.length) continue;
    let kind = pick(kinds, rnd());
    const spot = wallSpot(kind, len, h, rnd);
    if (WALL_CELLS[kind].big) {
      if (awayFromCentre) spot.x = 0.32 * (rnd() < 0.5 ? -1 : 1);
      sinceBig = 0;
    } else if (awayFromCentre && Math.abs(spot.x) < 0.2) spot.x += spot.x < 0 ? -0.25 : 0.25;
    decal(p, kind, spot);
    // Now and then a second, small one (a cobweb over a damp patch).
    if (rnd() < atm.walls.share * 0.4 && smallKinds.length) {
      kinds = smallKinds.filter(([k]) => k !== kind);
      if (!kinds.length) continue;
      kind = pick(kinds, rnd());
      decal(p, kind, wallSpot(kind, len, h, rnd));
    }
  }
}

function buildPools(input: AtmosphereInput, atm: Atmosphere): { mesh: THREE.InstancedMesh; time: { value: number } } | null {
  const { def, placements, uniforms, quality } = input;
  const spots: { x: number; z: number; r: number; color: THREE.Color }[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const v = new THREE.Vector3();
  const strength = atm.pools * POOL_QUALITY[quality];
  const glassy = def.edge === 'glass';
  for (const p of placements) {
    const l = pieceMeta(p.piece)?.light;
    if (!l || p.band === 'far') continue;
    q.setFromEuler(euler.set(p.tilt?.[0] ?? 0, p.rot, p.tilt?.[1] ?? 0, 'YXZ'));
    m.compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q, new THREE.Vector3(p.scale * (p.sx ?? 1), p.scale, p.scale));
    v.set(l.x, l.y, l.z).applyMatrix4(m);
    const hex =
      l.kind === 'crystal' ? (def.palette?.crystal ?? '#a884ff') : l.kind === 'window' ? (glassy ? (def.palette?.glowCold ?? '#a8e0f0') : '#9fb4d8') : (def.light.point?.color ?? '#ffac58');
    // Glass Town's tall stained windows throw a stronger patch of daylight than a slit or a shutter.
    const k = strength * (l.kind === 'window' ? (glassy ? 1.6 : 0.55) : l.kind === 'crystal' ? 0.8 : 1) * (l.fire ? Math.min(1.3, 0.85 + l.fire * 0.2) : 1);
    // Output-space colour (the pool shader adds raw values, as the fire shaders do).
    const rgb = { r: 0, g: 0, b: 0 };
    new THREE.Color(hex).getRGB(rgb, THREE.SRGBColorSpace);
    const r = POOL_RADIUS[l.kind] * (0.9 + 0.25 * Math.min(1, v.y / 1.2));
    spots.push({ x: v.x, z: v.z, r, color: new THREE.Color().setRGB(rgb.r * k, rgb.g * k, rgb.b * k, THREE.LinearSRGBColorSpace) });
  }
  if (!spots.length) return null;
  const time = { value: 0 };
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uEnvField: uniforms.uEnvField, uEnvRect: uniforms.uEnvRect, uEnvVeil: uniforms.uEnvVeil, uTime: time },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vPhase;
      void main() {
        vUv = uv;
        vColor = instanceColor;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vPhase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uEnvField;
      uniform vec4 uEnvRect;
      uniform float uEnvVeil;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vPhase;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2);
        float flick = 1.0 + 0.07 * sin(uTime * 7.3 + vPhase) + 0.05 * sin(uTime * 12.9 + vPhase * 1.3);
        vec4 f = texture2D(uEnvField, (vWorld.xz - uEnvRect.xy) * uEnvRect.zw);
        a *= (1.0 - f.g * uEnvVeil) * (1.0 - f.r);
        gl_FragColor = vec4(vColor * a * flick, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  spots.forEach((s, i) => {
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, 0.006, s.z), q.identity(), new THREE.Vector3(s.r, 1, s.r)));
    mesh.setColorAt(i, s.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'env:light-pools';
  mesh.renderOrder = -0.4;
  mesh.frustumCulled = false;
  return { mesh, time };
}
