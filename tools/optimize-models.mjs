// Turns raw Meshy downloads into light game-ready GLBs, in three graphics tiers.
//
//   npm run models                    every art/meshy-source/<id>/<id>.glb, all tiers
//   npm run models warden             only the given ids
//   npm run models warden --tiers=low only some tiers (low, medium, high)
//
// Writes assets/models/<id>/<id>.low.glb, <id>.glb (medium) and <id>.hq.glb (high). All three share
// the clip fixes (names normalised to idle/walk/run/attack/hit/death, horizontal root motion removed
// except in walk/run), WebP textures and meshopt compression; they differ in texture size, and the
// low tier also gets a simplified mesh. Never reduces medium/high below the source: a model over its
// manifest triangle budget only gets a warning (reduce it in Blender or with Meshy Remesh).

import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { cloneDocument, compactPrimitive, dedup, listTextureSlots, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_DIR = 'art/meshy-source';
const OUT_DIR = 'assets/models';
const MANIFEST = 'art/prompts/manifest.json';

/**
 * Graphics tiers (src/render/quality.ts picks one per device). textureMax is per manifest kind.
 * simplify: fraction of triangles the low tier aims to keep; the error cap may stop it earlier.
 */
const TIERS = [
  { name: 'low', suffix: '.low', textureMax: { weapon: 256, prop: 256, default: 512 }, simplify: 0.5 },
  { name: 'medium', suffix: '', textureMax: { weapon: 512, prop: 512, default: 1024 } },
  // 2048, not the source's 4096: Meshy's 4096² metallic-roughness maps cost 64 MB of GPU memory per
  // model (two dozen on a board) and look the same on screen; iOS Safari killed the tab on high.
  { name: 'high', suffix: '.hq', textureMax: { default: 2048 } },
];
const SIMPLIFY_ERROR = 0.01; // fraction of the mesh radius
const WEBP_QUALITY = { normalTexture: 90, default: 85 };

/** Clip names the game asks for, and the Meshy/Mixamo names that map to them. Order matters: first match wins. */
const CLIP_PATTERNS = [
  ['death', /dead|death|dying|die\b/i],
  ['hit', /hit|react|damage|hurt/i],
  ['cast', /cast|spell/i],
  ['attack', /attack|slash|punch|swing|stab|strike|shoot|shot|archery|throw|kick/i],
  ['run', /run|sprint/i],
  // Meshy's quadruped rig ships its only clip, Walking, as "Armature|Unreal Take|baselayer".
  ['walk', /walk|unreal take/i],
  ['idle', /idle|breath|stand/i],
];
/** Clips that may move the root on the horizontal plane; everything else plays in place. */
const ROOT_MOTION_CLIPS = new Set(['walk', 'run']);
/**
 * Wing beats keyed around the wrong axis. The moth stands upright facing +z, and its Blender clips
 * swung the wings around z (up and down, like wipers); a wing beat sweeps them from belly to back,
 * around the body's long axis (y). Every key of these bones turns its flap axis from `from` to `to`
 * (model space, measured in the parent bone's rest frame).
 */
const FLAP_AXIS_FIXES = {
  'night-moth': { bones: /^Bone_0(0[89]|1\d)$/, from: [0, 0, 1], to: [0, 1, 0] },
};

const argv = process.argv.slice(2);
const tierArg = argv.find((a) => a.startsWith('--tiers='));
const tiers = tierArg ? TIERS.filter((t) => tierArg.slice(8).split(',').includes(t.name)) : TIERS;
const args = argv.filter((a) => !a.startsWith('--'));
if (!tiers.length) {
  console.error(`--tiers takes a comma-separated list of ${TIERS.map((t) => t.name).join(', ')}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = new Map(manifest.models.map((m) => [m.id, m]));

const ids = args.length
  ? args
  : existsSync(SOURCE_DIR)
    ? readdirSync(SOURCE_DIR).filter((id) => existsSync(join(SOURCE_DIR, id, `${id}.glb`)))
    : [];
if (!ids.length) {
  console.error(`No raw models found in ${SOURCE_DIR}/<id>/<id>.glb`);
  process.exit(1);
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .setLogger(new Logger(Logger.Verbosity.WARN))
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
await MeshoptSimplifier.ready;

const rows = [];
let failed = 0;
for (const id of ids) {
  try {
    rows.push(await optimize(id));
  } catch (err) {
    failed++;
    console.error(`✗ ${id}: ${err instanceof Error ? err.message : err}`);
  }
}

if (rows.length) {
  const cols = tiers.map((t) => t.name);
  console.log(`
| Модель | Трикутники (${cols.join(' / ')}) | Сирий | ${cols.join(' | ')} |`);
  console.log(`|---|---|---|${cols.map(() => '---').join('|')}|`);
  for (const r of rows) {
    const tris = r.tiers.map((t) => t.triangles).join(' / ');
    console.log(`| \`${r.id}\` | ${tris} | ${mb(r.before)} | ${r.tiers.map((t) => mb(t.size)).join(' | ')} |`);
  }
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const totals = tiers.map((_, i) => mb(sum((r) => r.tiers[i].size)));
  console.log(`| **Разом (${rows.length})** | | ${mb(sum((r) => r.before))} | ${totals.join(' | ')} |`);
}
process.exit(failed ? 1 : 0);

async function optimize(id) {
  const src = join(SOURCE_DIR, id, `${id}.glb`);
  if (!existsSync(src)) throw new Error(`raw file ${src} not found`);
  const entry = entries.get(id);
  if (!entry) console.warn(`! ${id}: not in ${MANIFEST}, using hero defaults without a triangle budget`);
  const kind = entry?.kind ?? 'hero';
  const warnings = [];

  // Steps every tier shares.
  const base = await io.read(src);
  const clips = normaliseClips(base, warnings);
  lockRootMotion(base);
  if (FLAP_AXIS_FIXES[id]) fixFlapAxis(base, FLAP_AXIS_FIXES[id]);
  await base.transform(dedup(), prune(), weld(), resample());
  // Metadata for the loader: GLTFLoader copies scene extras into scene.userData.
  const attachTo = entry?.attachTo ? { hand: entry.attachTo.hand, bones: entry.attachTo.bones } : null;
  base.getRoot().getDefaultScene()?.setExtras({ vidvazhni: { id, kind, clips, attachTo } });

  const sourceTriangles = countTriangles(base);
  const budget = entry?.triangleBudget;
  if (budget?.max && sourceTriangles > budget.max) {
    warnings.push(`${sourceTriangles} triangles is over the ${kind} budget of ${budget.max}; reduce it in Blender or Meshy Remesh`);
  }
  if (entry?.rig && entry.rig !== 'none') {
    const missing = (entry.animations ?? []).filter((name) => !clips.includes(name));
    if (missing.length) warnings.push(`missing clips: ${missing.join(', ')}`);
  }

  const outDir = join(OUT_DIR, id);
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const tier of tiers) {
    const doc = cloneDocument(base);
    if (tier.simplify) {
      simplifyMeshes(doc, tier.simplify);
    }
    const textures = await compressTextures(doc, tier.textureMax[kind] ?? tier.textureMax.default, warnings);
    await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const out = join(outDir, `${id}${tier.suffix}.glb`);
    writeFileSync(out, await io.writeBinary(doc));
    results.push({ tier: tier.name, triangles: countTriangles(doc), textures, size: statSync(out).size });
  }

  const before = statSync(src).size;
  console.log(`✓ ${id}: raw ${mb(before)}, clips ${clips.join(' ') || 'none'}`);
  for (const r of results) console.log(`    ${r.tier.padEnd(6)} ${mb(r.size).padStart(9)}  ${r.triangles} tris, textures ${r.textures || 'none'}`);
  for (const w of new Set(warnings)) console.warn(`  ! ${w}`);
  return { id, before, tiers: results };
}

/**
 * Reduces every triangle mesh towards `ratio` of its triangles. Unlike glTF-Transform's simplify,
 * which only sees positions, this passes normals and UVs to meshoptimizer and allows collapses
 * across UV seams ('Permissive'); Meshy's fragmented UV islands otherwise lock most edges. Skin
 * weights are vertex attributes, so surviving vertices keep their joints and weights.
 */
function simplifyMeshes(doc, ratio) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (prim.getMode() !== 4 || !indices || !position) continue;
      const count = position.getCount();
      const normal = prim.getAttribute('NORMAL');
      const uv = prim.getAttribute('TEXCOORD_0');
      const attributes = new Float32Array(count * 5);
      const n = [];
      const t = [];
      for (let i = 0; i < count; i++) {
        if (normal) normal.getElement(i, n);
        if (uv) uv.getElement(i, t);
        attributes.set([n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, t[0] ?? 0, t[1] ?? 0], i * 5);
      }
      const src = new Uint32Array(indices.getArray());
      const target = Math.floor((ratio * src.length) / 3) * 3;
      const [dst] = MeshoptSimplifier.simplifyWithAttributes(
        src, new Float32Array(position.getArray()), 3, attributes, 5, [0.5, 0.5, 0.5, 1, 1], null, target, SIMPLIFY_ERROR, ['Permissive'],
      );
      const out = doc.createAccessor().setType('SCALAR').setArray(count <= 65535 ? new Uint16Array(dst) : dst).setBuffer(indices.getBuffer());
      prim.setIndices(out);
      if (indices.listParents().length === 1) indices.dispose();
      compactPrimitive(prim);
    }
  }
}

/** Renames clips to the game's names (Idle_02 → idle, Hit_Reaction → hit, Dead → death). Returns the new names. */
function normaliseClips(doc, warnings) {
  const taken = new Set();
  const names = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const raw = anim.getName();
    const match = CLIP_PATTERNS.find(([, re]) => re.test(raw));
    let name = match ? match[0] : raw.toLowerCase();
    if (!match) warnings.push(`clip "${raw}" matches no game clip name; kept as "${name}"`);
    if (taken.has(name)) {
      let n = 2;
      while (taken.has(`${name}${n}`)) n++;
      warnings.push(`second "${name}" clip ("${raw}") renamed to "${name}${n}"`);
      name = `${name}${n}`;
    }
    taken.add(name);
    anim.setName(name);
    names.push(name);
  }
  return names;
}

/**
 * Keeps attacks, hits and deaths on their hex: the root bone's X and Z (glTF is Y-up) are held at
 * the clip's first key, so the body still rises and falls but no longer drifts sideways.
 */
function lockRootMotion(doc) {
  const root = doc.getRoot();
  const joints = new Set(root.listSkins().flatMap((s) => s.listJoints()));
  if (!joints.size) return;
  const parentOf = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) parentOf.set(child, node);
  const tops = [...joints].filter((j) => !joints.has(parentOf.get(j)));
  const rootBone = [...joints].find((j) => /hips|pelvis/i.test(j.getName())) ?? tops[0];
  if (!rootBone) return;

  for (const anim of root.listAnimations()) {
    if (ROOT_MOTION_CLIPS.has(anim.getName())) continue;
    for (const channel of anim.listChannels()) {
      if (channel.getTargetNode() !== rootBone || channel.getTargetPath() !== 'translation') continue;
      const sampler = channel.getSampler();
      const output = sampler.getOutput().clone(); // never edit an accessor another clip may share
      sampler.setOutput(output);
      const first = output.getElement(0, []);
      const v = [];
      for (let i = 0; i < output.getCount(); i++) {
        output.getElement(i, v);
        // CUBICSPLINE stores in-tangent, value, out-tangent per key; tangents get zero X/Z.
        const isValue = sampler.getInterpolation() !== 'CUBICSPLINE' || i % 3 === 1;
        output.setElement(i, [isValue ? first[0] : 0, v[1], isValue ? first[2] : 0]);
      }
    }
  }
}

/** Turns the rotation keys of the matching bones so they swing around `to` instead of `from`. */
function fixFlapAxis(doc, fix) {
  const root = doc.getRoot();
  const parentOf = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) parentOf.set(child, node);
  const worldRest = (node) => {
    let q = [0, 0, 0, 1];
    for (let n = node; n; n = parentOf.get(n)) q = qMul(n.getRotation(), q);
    return q;
  };
  // Rotation taking `from` onto `to`, seen from inside the parent's rest frame: C = P⁻¹·M·P.
  const m = qBetween(fix.from, fix.to);
  for (const anim of root.listAnimations()) {
    for (const channel of anim.listChannels()) {
      const node = channel.getTargetNode();
      if (!node || channel.getTargetPath() !== 'rotation' || !fix.bones.test(node.getName())) continue;
      const p = worldRest(parentOf.get(node));
      const c = qMul(qInv(p), qMul(m, p));
      const rest = node.getRotation();
      const sampler = channel.getSampler();
      const output = sampler.getOutput().clone(); // never edit an accessor another clip may share
      sampler.setOutput(output);
      const v = [];
      // Linear in the key, so CUBICSPLINE tangents take the same map: q' = C·(q·r⁻¹)·C⁻¹·r.
      for (let i = 0; i < output.getCount(); i++) {
        output.getElement(i, v);
        output.setElement(i, qMul(qMul(c, qMul(qMul(v, qInv(rest)), qInv(c))), rest));
      }
    }
  }
}

/** Quaternions as [x, y, z, w]. */
function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qInv(q) {
  const n = q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2;
  return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n];
}
/** Shortest rotation from unit vector a to unit vector b (not opposite). */
function qBetween(a, b) {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q = [...cross, 1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]];
  const n = Math.hypot(...q);
  return q.map((x) => x / n);
}

/**
 * Resizes every texture to fit maxSize, drops alpha nobody reads, folds single-colour textures into
 * material factors, and re-encodes as WebP. Returns a short "1024² color, ..." summary.
 */
async function compressTextures(doc, maxSize, warnings) {
  const root = doc.getRoot();
  const summary = [];
  let webp = false;
  for (const texture of root.listTextures()) {
    const slots = listTextureSlots(texture);
    const image = texture.getImage();
    if (!image) continue;
    const stats = await sharp(image).stats();
    const meta = await sharp(image).metadata();

    if (stats.channels.every((c) => c.max - c.min <= 2)) {
      const mean = stats.channels.map((c) => c.mean / 255);
      if (foldUniformTexture(doc, texture, slots, mean)) {
        warnings.push(`${slots.join('/')} texture is a single colour; replaced by material factors`);
        texture.dispose();
        continue;
      }
    }

    const readsAlpha = slots.includes('baseColorTexture') && root.listMaterials().some(
      (m) => m.getBaseColorTexture() === texture && m.getAlphaMode() !== 'OPAQUE',
    );
    let pipeline = sharp(image);
    if (meta.hasAlpha && (!readsAlpha || stats.channels[3]?.min === 255)) pipeline = pipeline.removeAlpha();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (scale < 1) pipeline = pipeline.resize(w, h, { kernel: 'lanczos3' });
    const quality = WEBP_QUALITY[slots[0]] ?? WEBP_QUALITY.default;
    const buffer = await pipeline.webp({ quality, effort: 6, smartSubsample: true }).toBuffer();

    texture.setImage(new Uint8Array(buffer)).setMimeType('image/webp').setURI('');
    webp = true;
    summary.push(`${w}² ${slotLabel(slots)}`);
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);
  return summary.join(', ');
}

/** Replaces a single-colour texture by the equivalent factor. Returns false if the slot has no factor. */
function foldUniformTexture(doc, texture, slots, [r, g, b]) {
  if (slots.length !== 1) return false;
  for (const material of doc.getRoot().listMaterials()) {
    switch (slots[0]) {
      case 'baseColorTexture': {
        if (material.getBaseColorTexture() !== texture) break;
        const f = material.getBaseColorFactor();
        material.setBaseColorFactor([f[0] * srgbToLinear(r), f[1] * srgbToLinear(g), f[2] * srgbToLinear(b), f[3]]);
        material.setBaseColorTexture(null);
        break;
      }
      case 'metallicRoughnessTexture': {
        if (material.getMetallicRoughnessTexture() !== texture) break;
        material.setRoughnessFactor(material.getRoughnessFactor() * g);
        material.setMetallicFactor(material.getMetallicFactor() * b);
        material.setMetallicRoughnessTexture(null);
        break;
      }
      case 'normalTexture': {
        if (material.getNormalTexture() !== texture) break;
        // A flat normal map is (0.5, 0.5, 1); anything else uniform tilts every normal, so keep it.
        if (Math.abs(r - 0.5) > 0.02 || Math.abs(g - 0.5) > 0.02) return false;
        material.setNormalTexture(null);
        break;
      }
      case 'occlusionTexture': {
        if (material.getOcclusionTexture() !== texture) break;
        if (r < 0.98) return false;
        material.setOcclusionTexture(null);
        break;
      }
      case 'emissiveTexture': {
        if (material.getEmissiveTexture() !== texture) break;
        const f = material.getEmissiveFactor();
        material.setEmissiveFactor([f[0] * srgbToLinear(r), f[1] * srgbToLinear(g), f[2] * srgbToLinear(b)]);
        material.setEmissiveTexture(null);
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

function slotLabel(slots) {
  const labels = { baseColorTexture: 'color', normalTexture: 'normal', metallicRoughnessTexture: 'metal-rough', occlusionTexture: 'ao', emissiveTexture: 'emissive' };
  return slots.map((s) => labels[s] ?? s).join('+');
}

function countTriangles(doc) {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      total += count / 3;
    }
  }
  return total;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}
