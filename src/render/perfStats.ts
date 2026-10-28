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
  /** Shader programs the renderer holds, and how many were compiled during this frame (a frame
   *  that keeps compiling is a material whose defines change every frame). */
  programs: number;
  compiled: number;
  memory?: PerfMemory;
}

/** What the board holds in memory. The GPU numbers are estimates from sizes (drivers pad and keep
 *  more), good for comparing qualities and boards, not for an exact count. */
export interface PerfMemory {
  /** renderer.info.memory: geometries and textures uploaded to the GPU. */
  geometries: number;
  textures: number;
  /** JS heap in MB (performance.memory, Chrome only; null elsewhere). */
  heapMB: number | null;
  /** Estimated GPU MB: the canvas's own buffers, render targets (post chain, shadow maps), textures
   *  and vertex data of what is in the scene. */
  gpuMB: { canvas: number; targets: number; textures: number; geometry: number; total: number };
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
  const out: PerfBreakdown = { total: { calls: 0, tris: 0 }, passes: {}, categories: {}, shadowMaps: [], programs: 0, compiled: 0 };
  const programsBefore = renderer.info.programs?.length ?? 0;
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
  out.programs = renderer.info.programs?.length ?? 0;
  out.compiled = Math.max(0, out.programs - programsBefore);
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isLight && light.castShadow && light.shadow) out.shadowMaps.push(`${light.type} ${light.shadow.mapSize.x}`);
  });
  return out;
}

const MB = 1024 * 1024;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Bytes per pixel of a colour target or texture of `type` (RGBA). */
function texelBytes(type: number | undefined): number {
  // three's HalfFloatType is 1016, FloatType 1015.
  return type === 1016 ? 8 : type === 1015 ? 16 : 4;
}

/** Estimated bytes of a render target: colour (a multisampled buffer plus the resolved texture when
 *  it has samples), depth buffer and depth texture; a cube target has six faces. */
export function targetBytes(t: THREE.RenderTarget): number {
  const px = t.width * t.height * ((t as { isWebGLCubeRenderTarget?: boolean }).isWebGLCubeRenderTarget ? 6 : 1);
  const samples = t.samples > 0 ? t.samples : 0;
  const colour = texelBytes(t.texture.type) * (samples ? samples + 1 : 1) * t.textures.length;
  const depth = t.depthBuffer ? 4 * Math.max(1, samples) : 0;
  return px * (colour + depth + (t.depthTexture ? 4 : 0));
}

/** Memory of the board: `targets` are the render targets the scene does not reach from its lights
 *  (post chain, lamp redraw target). */
export function readMemory(renderer: THREE.WebGLRenderer, scene: THREE.Scene, targets: THREE.RenderTarget[]): PerfMemory {
  const all = new Set(targets);
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isLight && light.shadow?.map) all.add(light.shadow.map);
  });
  const targetTextures = new Set<THREE.Texture>();
  let targetsB = 0;
  for (const t of all) {
    targetsB += targetBytes(t);
    for (const tex of t.textures) targetTextures.add(tex);
    if (t.depthTexture) targetTextures.add(t.depthTexture);
  }
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const addTex = (v: unknown) => {
    const tex = v as THREE.Texture | null;
    if (tex?.isTexture && !targetTextures.has(tex)) textures.add(tex);
  };
  addTex(scene.background);
  addTex(scene.environment);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.geometry || !mesh.material) return;
    geometries.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m)) addTex(v);
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) addTex(u?.value);
    }
  });
  let texB = 0;
  for (const tex of textures) {
    const img = (tex.image ?? {}) as { width?: number; height?: number; depth?: number };
    const faces = Array.isArray(tex.image) ? tex.image.length : 1;
    const first = (Array.isArray(tex.image) ? tex.image[0] : img) as { width?: number; height?: number } | undefined;
    const px = (first?.width ?? 0) * (first?.height ?? 0) * faces * (img.depth ?? 1);
    texB += px * texelBytes(tex.type) * (tex.generateMipmaps || tex.mipmaps?.length ? 4 / 3 : 1);
  }
  let geoB = 0;
  for (const g of geometries) {
    for (const a of Object.values(g.attributes)) geoB += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
    geoB += g.index?.array.byteLength ?? 0;
  }
  const gl = renderer.getContext();
  const attrs = gl.getContextAttributes();
  const px = gl.drawingBufferWidth * gl.drawingBufferHeight;
  // Back buffer (multisampled when antialiased) with depth-stencil, its resolve, and the display copy.
  const canvasB = px * (8 * (attrs?.antialias ? 4 : 1) + (attrs?.antialias ? 4 : 0) + 4);
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const gpu = { canvas: round1(canvasB / MB), targets: round1(targetsB / MB), textures: round1(texB / MB), geometry: round1(geoB / MB), total: 0 };
  gpu.total = round1(gpu.canvas + gpu.targets + gpu.textures + gpu.geometry);
  return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, heapMB: heap ? round1(heap / MB) : null, gpuMB: gpu };
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
  const m = p.memory;
  const mem = m
    ? `\nmemory: gpu ~${m.gpuMB.total} MB (canvas ${m.gpuMB.canvas}, targets ${m.gpuMB.targets}, textures ${m.gpuMB.textures}, geometry ${m.gpuMB.geometry})  |  ${m.geometries} geometries, ${m.textures} textures${m.heapMB !== null ? `  |  heap ${m.heapMB} MB` : ''}`
    : '';
  return `perf calls/tris: total ${p.total.calls}/${Math.round(p.total.tris / 1000)}k  |  ${passes}  |  maps ${p.shadowMaps.join(', ') || '—'}\n${lines.join('\n')}${mem}`;
}
