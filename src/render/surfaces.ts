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

export const SURFACE_IDS: readonly SurfaceId[] = ['planks', 'flagstones', 'cobblestone', 'worn-stone', 'forest-floor', 'grass', 'roots', 'mud', 'wet-grass', 'walkway', 'rock'];

type Painter = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;

interface SurfaceDef {
  /** Texture in assets/textures painted first (the canvas paints over it). */
  base?: string;
  /** Painted on a canvas (over the base, if any). */
  paint?: Painter;
  /** Flat colour until the base loads (and of the noise fallback). */
  fallback: string;
  /** Colour of the plate's sides. */
  side: string;
  roughness: number;
}

/** Colour multiplied over the surface per terrain; difficult and hazardous also get an overlay. */
export const TERRAIN_TINT: Record<Terrain, string> = { normal: '#ffffff', difficult: '#d9cdb6', hazardous: '#ffc4ae', water: '#8fa6a8' };
/** Water hexes sit lower than the others, under their water. */
export const WATER_DROP = 0.05;

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

/** Slabs in courses with dark joints; `cool` greys them (tower), else warm (cellar). */
function slabs(cool: boolean, rows: number): Painter {
  return (ctx, size, rnd) => {
    ctx.fillStyle = cool ? '#3d3f42' : '#46392e';
    ctx.fillRect(0, 0, size, size);
    const rowH = size / rows;
    for (let row = 0; row < rows; row++) {
      let x = rnd() * size * 0.3;
      const start = x;
      while (x < start + size) {
        const w = Math.min(start + size - x, rowH * (1 + rnd() * 0.9));
        const base = cool ? 128 + rnd() * 40 : 140 + rnd() * 40;
        const [r, g, b] = cool ? [base, base + 3, base + 6] : [base + 14, base + 4, base - 12];
        const gap = size * 0.008;
        tiled(size, x + w / 2, row * rowH + rowH / 2, Math.max(w, rowH), (cx, cy) => {
          const grad = ctx.createLinearGradient(cx, cy - rowH / 2, cx, cy + rowH / 2);
          grad.addColorStop(0, `rgb(${r + 14},${g + 14},${b + 14})`);
          grad.addColorStop(1, `rgb(${r - 18},${g - 18},${b - 18})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(cx - w / 2 + gap, cy - rowH / 2 + gap, w - gap * 2, rowH - gap * 2, size * (cool ? 0.02 : 0.012));
          ctx.fill();
        });
        x += w;
      }
    }
    // Wear: chips, stains and a few cracks.
    for (let i = 0; i < 60; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const rad = size * (0.004 + rnd() * 0.02);
      tiled(size, x, y, rad, (cx, cy) => {
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,250,235' : '30,24,18'},${0.06 + rnd() * 0.08})`;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.lineWidth = size * 0.003;
    for (let i = 0; i < (cool ? 10 : 6); i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 4; k++) pts.push([(x += (rnd() - 0.5) * size * 0.08), (y += (rnd() - 0.5) * size * 0.08)]);
      tiled(size, pts[0]![0], pts[0]![1], size * 0.2, (cx, cy) => {
        const ox = cx - pts[0]![0];
        const oy = cy - pts[0]![1];
        ctx.strokeStyle = 'rgba(20,16,12,0.35)';
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
        ctx.stroke();
      });
    }
    if (cool) {
      for (let i = 0; i < 40; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        tiled(size, x, y, 6, (cx, cy) => {
          ctx.fillStyle = `rgba(96,120,64,${0.12 + rnd() * 0.12})`;
          ctx.beginPath();
          ctx.arc(cx, cy, size * (0.004 + rnd() * 0.008), 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  };
}

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
  flagstones: { paint: slabs(false, 3), fallback: '#9a8a76', side: '#5a4c40', roughness: 0.92 },
  cobblestone: { base: 'cobblestone', fallback: '#9a948a', side: '#5c5048', roughness: 0.92 },
  'worn-stone': { paint: slabs(true, 4), fallback: '#8e9094', side: '#55575c', roughness: 0.9 },
  'forest-floor': { base: 'forest-floor', fallback: '#6a5a3e', side: '#4a3c2a', roughness: 0.95 },
  grass: { base: 'forest-floor', paint: grass(1400, false), fallback: '#6a7a40', side: '#4a4430', roughness: 0.95 },
  roots: { base: 'forest-floor', paint: roots, fallback: '#6a5a3e', side: '#4a3c2a', roughness: 0.95 },
  mud: { base: 'swamp-mud', fallback: '#6a5a40', side: '#40382a', roughness: 0.75 },
  'wet-grass': { base: 'swamp-mud', paint: grass(1000, true), fallback: '#5a6440', side: '#40382a', roughness: 0.8 },
  walkway: { paint: walkway, fallback: '#7a5a3c', side: '#3e2e20', roughness: 0.8 },
  rock: { base: 'cave-rock', fallback: '#6a6460', side: '#45403c', roughness: 0.95 },
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
  const size = quality === 'low' ? 256 : 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality === 'low' ? 1 : 4;
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
