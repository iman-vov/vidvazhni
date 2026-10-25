// Floor boxes of the prop models: reads each assets/models/<id>/<id>.glb's JSON chunk (POSITION
// accessor min/max under the node transforms, no textures loaded) and writes
// src/render/environment/modelBounds.json as id → [minX, maxX, minY, maxY, minZ, maxZ].
// footprint.ts turns them into the floor box a prop model really takes, so placing keeps every
// model clear of the others and of the walls. Run after adding or replacing a model:
//   node tools/model-bounds.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'assets/models';
const OUT = 'src/render/environment/modelBounds.json';

function mat(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  // Column-major like glTF.
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function apply(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

function bounds(file) {
  const buf = readFileSync(file);
  const len = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  const b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  const visit = (i, parent) => {
    const node = gltf.nodes[i];
    const m = mul(parent, mat(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        const acc = gltf.accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        // Quantized meshes (meshopt / KHR_mesh_quantization) store normalized integers.
        const k = acc.normalized ? ({ 5120: 1 / 127, 5121: 1 / 255, 5122: 1 / 32767, 5123: 1 / 65535 })[acc.componentType] ?? 1 : 1;
        const lo = acc.min.map((v) => v * k);
        const hi = acc.max.map((v) => v * k);
        for (const cx of [lo[0], hi[0]]) for (const cy of [lo[1], hi[1]]) for (const cz of [lo[2], hi[2]]) {
          const [x, y, z] = apply(m, [cx, cy, cz]);
          b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x);
          b[2] = Math.min(b[2], y); b[3] = Math.max(b[3], y);
          b[4] = Math.min(b[4], z); b[5] = Math.max(b[5], z);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, m);
  };
  const scene = gltf.scenes[gltf.scene ?? 0];
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of scene.nodes) visit(n, id);
  return b.every(Number.isFinite) ? b.map((v) => Math.round(v * 1e4) / 1e4) : null;
}

const out = {};
for (const id of readdirSync(ROOT).sort()) {
  const file = join(ROOT, id, `${id}.glb`);
  if (!existsSync(file)) continue;
  const b = bounds(file);
  if (b) out[id] = b;
}
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\],/g, '],\n') + '\n');
console.log(Object.keys(out).length, 'models →', OUT);
