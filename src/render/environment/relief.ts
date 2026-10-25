// Relief for the location's floor, worked out from its own (tiling) colour texture: joints and
// cracks are darker than the stone or wood around them, so brightness gives a height. From it:
//   R, G  tangent-space normal (u, v) for real light to catch (medium, high),
//   B     height (parallax on high, worn high spots shinier),
//   A     cavity occlusion (dark, recessed joints).
// Slabs also tilt a little: a broad blur of the brightness lifts lighter slabs and sinks darker ones.
// On low the light is baked into the colour instead ("pseudo-light" from the upper left).

import * as THREE from 'three';

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Separable box blur on a wrapping square grid, `passes` times (≈ gaussian). */
function blur(src: Float32Array<ArrayBuffer>, n: number, r: number, passes = 2): Float32Array<ArrayBuffer> {
  // Never writes into src: the passes ping-pong between two fresh arrays.
  let a = Float32Array.from(src);
  let b = new Float32Array(n * n);
  for (let p = 0; p < passes; p++) {
    for (const horizontal of [true, false]) {
      const w = 2 * r + 1;
      for (let line = 0; line < n; line++) {
        let sum = 0;
        const at = (k: number) => (horizontal ? a[line * n + wrap(k, n)]! : a[wrap(k, n) * n + line]!);
        for (let k = -r; k <= r; k++) sum += at(k);
        for (let k = 0; k < n; k++) {
          if (horizontal) b[line * n + k] = sum / w;
          else b[k * n + line] = sum / w;
          sum += at(k + r + 1) - at(k - r);
        }
      }
      [a, b] = [b, a];
    }
  }
  return a;
}

/** Value noise that tiles over the unit square with `f` cells a side. */
function tiledNoise(u: number, v: number, f: number, seed: number): number {
  const x = u * f;
  const y = v * f;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const h = (i: number, j: number) => {
    const s = Math.sin(wrap(i, f) * 127.1 + wrap(j, f) * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

export interface Relief {
  /** RGBA per texel in texture space (row 0 = v 0): normal u, normal v, height, cavity. */
  data: Uint8Array;
  size: number;
}

/** Relief from a tiling canvas (canvas row 0 is the texture's top, v = 1). `depth` scales the slopes. */
export function reliefFromCanvas(canvas: HTMLCanvasElement, depth = 1): Relief {
  const n = canvas.width;
  const img = canvas.getContext('2d')!.getImageData(0, 0, n, n).data;
  // Brightness in texture space (flip rows so index row = v).
  const lum = new Float32Array(n * n);
  let mean = 0;
  for (let row = 0; row < n; row++)
    for (let x = 0; x < n; x++) {
      const o = (row * n + x) * 4;
      const l = (0.299 * img[o]! + 0.587 * img[o + 1]! + 0.114 * img[o + 2]!) / 255;
      lum[(n - 1 - row) * n + x] = l;
      mean += l;
    }
  mean /= n * n;
  let variance = 0;
  for (let i = 0; i < lum.length; i++) variance += (lum[i]! - mean) ** 2;
  const std = Math.sqrt(variance / lum.length) || 0.1;
  const px = n / 512;
  const fine = blur(lum, n, Math.max(1, Math.round(1.5 * px)), 1);
  const broad = blur(lum, n, Math.max(2, Math.round(14 * px)), 2);
  const height = new Float32Array(n * n);
  for (let i = 0; i < height.length; i++) {
    const local = (fine[i]! - broad[i]!) / (2.2 * std);
    const slab = (broad[i]! - mean) / (3 * std);
    // Uneven stone: a broad swell that tilts slabs, and pitting on their faces.
    const u = (i % n) / n;
    const v = Math.floor(i / n) / n;
    const swell = (tiledNoise(u, v, 4, 1) - 0.5) * 0.22 + (tiledNoise(u, v, 16, 2) - 0.5) * 0.08 + (tiledNoise(u, v, 48, 3) - 0.5) * 0.04;
    height[i] = Math.min(1, Math.max(0, 0.5 + 0.34 * Math.tanh(local * 1.8) + 0.2 * slab + swell));
  }
  const around = blur(height, n, Math.max(2, Math.round(5 * px)), 2);
  const data = new Uint8Array(n * n * 4);
  const k = 3 * depth * (512 / n);
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const i = v * n + u;
      const du = (height[v * n + wrap(u + 1, n)]! - height[v * n + wrap(u - 1, n)]!) * k * n * 0.01;
      const dv = (height[wrap(v + 1, n) * n + u]! - height[wrap(v - 1, n) * n + u]!) * k * n * 0.01;
      const len = Math.hypot(du, dv, 1);
      const cavity = Math.min(1, Math.max(0, 1 - Math.max(0, around[i]! - height[i]!) * 3));
      data[i * 4] = Math.round((-du / len * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = Math.round((-dv / len * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = Math.round(height[i]! * 255);
      data[i * 4 + 3] = Math.round(cavity * 255);
    }
  return { data, size: n };
}

export function reliefTexture(r: Relief): THREE.DataTexture {
  const t = new THREE.DataTexture(r.data, r.size, r.size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Low quality: bakes light from the upper left and the cavity shadow into the canvas itself. */
export function bakeReliefLight(canvas: HTMLCanvasElement, r: Relief): void {
  const n = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.getImageData(0, 0, n, n);
  const d = image.data;
  // Light in texture space (u right, v up, n out of the floor).
  const lx = -0.45;
  const ly = 0.45;
  const lz = 0.77;
  for (let row = 0; row < n; row++)
    for (let x = 0; x < n; x++) {
      const i = ((n - 1 - row) * n + x) * 4;
      const nx = r.data[i]! / 127.5 - 1;
      const ny = r.data[i + 1]! / 127.5 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lambert = Math.max(0, nx * lx + ny * ly + nz * lz) / lz;
      const shade = (0.55 + 0.45 * lambert) * (0.5 + 0.5 * (r.data[i + 3]! / 255)) * (0.9 + 0.2 * (r.data[i + 2]! / 255));
      const o = (row * n + x) * 4;
      d[o] = Math.min(255, d[o]! * shade);
      d[o + 1] = Math.min(255, d[o + 1]! * shade);
      d[o + 2] = Math.min(255, d[o + 2]! * shade);
    }
  ctx.putImageData(image, 0, 0);
}
