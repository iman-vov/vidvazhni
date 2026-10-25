// Where a frame's draw calls and triangles go (?perf=1 on dev/board.html, and dev/bench.html):
// one frame is drawn with renderer.renderBufferDirect wrapped, and every draw is put down to its
// pass (shadow map, scene, post) and to what it draws (heroes, monsters, environment kits, tiles…).
// The budgets per quality level are in docs/tech/perf-budget.md.

import type * as THREE from 'three';
import type { GraphicsQuality } from './quality';

/** Per-frame budget at the default camera, all rooms revealed, 4 heroes (docs/tech/perf-budget.md). */
export const PERF_BUDGET: Record<GraphicsQuality, { tris: number; calls: number }> = {
  low: { tris: 300_000, calls: 100 },
  medium: { tris: 1_000_000, calls: 150 },
  high: { tris: 1_200_000, calls: 200 },
};

export interface PerfCount {
  calls: number;
  tris: number;
}

export interface PerfBreakdown {
  total: PerfCount;
  /** By pass: 'shadow' (sun and lamp maps), 'scene' (each scene render, numbered), 'post'. */
  passes: Record<string, PerfCount>;
  /** By what is drawn, over all passes; shadow draws also under `<category> (shadow)`. */
  categories: Record<string, PerfCount>;
  /** Lights that draw a shadow map, with the map size. */
  shadowMaps: string[];
}

/** The bucket a mesh belongs to, from the names of it and its ancestors. */
export function perfCategory(o: THREE.Object3D, scene: THREE.Object3D): string {
  let named = '';
  for (let p: THREE.Object3D | null = o; p && p !== scene; p = p.parent) {
    const n = p.name;
    if (n.startsWith('figure:')) return n.startsWith('figure:hero:') ? 'heroes' : 'monsters';
    if (n.startsWith('env:')) named = `env:${n.split(':')[1]}`;
    else if (!named && /^(room|plates|piece|obstacle|prop|cluster-item|scatter):/.test(n)) named = n.split(':')[0]!;
    else if (!named && n) named = n;
  }
  return named || (o.parent ? 'unnamed' : 'post');
}

function add(map: Record<string, PerfCount>, key: string, calls: number, tris: number): void {
  const c = (map[key] ??= { calls: 0, tris: 0 });
  c.calls += calls;
  c.tris += tris;
}

/** Draws one frame through `draw` and counts it. */
export function capturePerf(renderer: THREE.WebGLRenderer, scene: THREE.Scene, draw: () => void): PerfBreakdown {
  const out: PerfBreakdown = { total: { calls: 0, tris: 0 }, passes: {}, categories: {}, shadowMaps: [] };
  const info = renderer.info.render;
  const original = renderer.renderBufferDirect;
  const originalRender = renderer.render;
  let sceneRenders = 0;
  let pass = 'post';
  renderer.render = function (this: THREE.WebGLRenderer, s: THREE.Object3D, camera: THREE.Camera) {
    const outer = pass;
    pass = s === scene ? `scene ${++sceneRenders}` : 'post';
    try {
      return originalRender.call(this, s, camera);
    } finally {
      pass = outer;
    }
  };
  renderer.renderBufferDirect = function (this: THREE.WebGLRenderer, camera, s, geometry, material, object, group) {
    const calls = info.calls;
    const tris = info.triangles;
    original.call(this, camera, s, geometry, material, object, group);
    const dc = info.calls - calls;
    const dt = info.triangles - tris;
    // Shadow maps draw with no scene; post passes draw a full-screen quad outside the scene.
    const shadow = s === null;
    const where = shadow ? 'shadow' : pass;
    const cat = perfCategory(object, scene);
    add(out.passes, where, dc, dt);
    add(out.categories, shadow ? `${cat} (shadow)` : cat, dc, dt);
    out.total.calls += dc;
    out.total.tris += dt;
  } as typeof renderer.renderBufferDirect;
  try {
    draw();
  } finally {
    renderer.renderBufferDirect = original;
    renderer.render = originalRender;
  }
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isLight && light.castShadow && light.shadow) out.shadowMaps.push(`${light.type} ${light.shadow.mapSize.x}`);
  });
  return out;
}

/** A few lines for the dev page: passes, then the biggest categories. */
export function formatPerf(p: PerfBreakdown, top = 12): string {
  const fmt = (k: string, c: PerfCount) => `${k} ${c.calls}/${Math.round(c.tris / 1000)}k`;
  const passes = Object.entries(p.passes).map(([k, c]) => fmt(k, c)).join('  ');
  const cats = Object.entries(p.categories)
    .sort((a, b) => b[1].tris - a[1].tris)
    .slice(0, top)
    .map(([k, c]) => fmt(k, c));
  const lines: string[] = [];
  for (let i = 0; i < cats.length; i += 4) lines.push(cats.slice(i, i + 4).join('  '));
  return `perf calls/tris: total ${p.total.calls}/${Math.round(p.total.tris / 1000)}k  |  ${passes}  |  maps ${p.shadowMaps.join(', ') || '—'}\n${lines.join('\n')}`;
}
