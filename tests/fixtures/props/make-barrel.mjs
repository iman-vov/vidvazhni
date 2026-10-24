// Builds tests/fixtures/props/barrel.glb: a temporary stand-in for the Meshy barrel, to test the
// board's prop-model path (src/render/propModels.ts) before real props exist. Not a game asset.
// Run: node tests/fixtures/props/make-barrel.mjs
// Frame like a Meshy export after `npm run models`: Y up, feet at 0, about 1 unit tall, a little
// off-centre (the board must centre and ground it), 16 staves with gaps, three iron hoops, a lid
// of planks and a tap, ~1.5k triangles, vertex colours for the stave tones.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';

const STAVES = 16;
const H = 1.0;
const profile = (y) => 0.33 + 0.06 * Math.sin((y / H) * Math.PI); // belly

function colour(g, rgb) {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

const wood = [];
const iron = [];
// Staves: lathe slices with a small gap, each its own tone.
for (let i = 0; i < STAVES; i++) {
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const y = (k / 8) * H;
    pts.push(new THREE.Vector2(profile(y), y));
  }
  const step = (Math.PI * 2) / STAVES;
  const g = new THREE.LatheGeometry(pts, 3, i * step, step * 0.93);
  const t = 0.82 + ((i * 7) % 5) * 0.05;
  wood.push(colour(g.toNonIndexed(), [0.62 * t, 0.4 * t, 0.24 * t]));
}
// Dark inside, visible through the gaps.
wood.push(colour(new THREE.CylinderGeometry(0.31, 0.31, H * 0.98, 16, 1, true).translate(0, H / 2, 0).toNonIndexed(), [0.16, 0.1, 0.06]));
// Lid planks, sunk a little under the rim.
for (let i = -2; i <= 2; i++) {
  const w = 0.12;
  const len = 2 * Math.sqrt(Math.max(0, 0.34 ** 2 - (i * w) ** 2));
  wood.push(colour(new THREE.BoxGeometry(w * 0.94, 0.03, len).translate(i * w, H - 0.03, 0).toNonIndexed(), [0.5, 0.33, 0.2]));
}
// Hoops.
for (const y of [0.12, 0.5, 0.88]) {
  const r = profile(y) + 0.012;
  iron.push(colour(new THREE.CylinderGeometry(r, r, 0.05, 24, 1, true).translate(0, y, 0).toNonIndexed(), [0.3, 0.3, 0.33]));
}
// Tap.
iron.push(colour(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).rotateX(Math.PI / 2).translate(0, 0.22, profile(0.22) + 0.05).toNonIndexed(), [0.55, 0.42, 0.2]));

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('barrel');
const node = doc.createNode('barrel').setTranslation([0.07, 0, -0.04]);
scene.addChild(node);
const mesh = doc.createMesh('barrel');
node.setMesh(mesh);
for (const [list, mat] of [
  [wood, doc.createMaterial('wood').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0)],
  [iron, doc.createMaterial('iron').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.45).setMetallicFactor(0.7)],
]) {
  const g = mergeGeometries(list, false);
  g.computeVertexNormals();
  const prim = doc.createPrimitive().setMaterial(mat);
  for (const [name, attr, type] of [
    ['POSITION', 'position', 'VEC3'],
    ['NORMAL', 'normal', 'VEC3'],
    ['COLOR_0', 'color', 'VEC3'],
  ]) {
    prim.setAttribute(name, doc.createAccessor().setType(type).setArray(new Float32Array(g.getAttribute(attr).array)).setBuffer(buffer));
  }
  mesh.addPrimitive(prim);
}
const out = fileURLToPath(new URL('./barrel.glb', import.meta.url));
writeFileSync(out, await new NodeIO().writeBinary(doc));
console.log('wrote', out);
