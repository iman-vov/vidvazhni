// Turns raw Meshy downloads into light game-ready GLBs.
//
//   npm run models            every art/meshy-source/<id>/<id>.glb
//   npm run models warden     only the given ids
//
// Writes assets/models/<id>/<id>.glb: textures resized (1024 px, 512 for weapons and props) and
// re-encoded as WebP, mesh welded and meshopt-compressed, clips renamed to idle/walk/run/attack/
// hit/death with horizontal root motion removed (except walk/run). Never decimates: a model over
// its manifest triangle budget only gets a warning (reduce it in Blender or with Meshy Remesh).

import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, listTextureSlots, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_DIR = 'art/meshy-source';
const OUT_DIR = 'assets/models';
const MANIFEST = 'art/prompts/manifest.json';

const TEXTURE_MAX = { weapon: 512, prop: 512 };
const TEXTURE_MAX_DEFAULT = 1024;
const WEBP_QUALITY = { normalTexture: 90, default: 85 };

/** Clip names the game asks for, and the Meshy/Mixamo names that map to them. Order matters: first match wins. */
const CLIP_PATTERNS = [
  ['death', /dead|death|dying|die\b/i],
  ['hit', /hit|react|damage|hurt/i],
  ['cast', /cast|spell/i],
  ['attack', /attack|slash|punch|swing|stab|strike|shoot|throw|kick/i],
  ['run', /run|sprint/i],
  ['walk', /walk/i],
  ['idle', /idle|breath|stand/i],
];
/** Clips that may move the root on the horizontal plane; everything else plays in place. */
const ROOT_MOTION_CLIPS = new Set(['walk', 'run']);

const args = process.argv.slice(2);
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
  console.log('\n| Модель | Трикутники | Текстури | Кліпи | Було | Стало |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| \`${r.id}\` | ${r.triangles} | ${r.textures || '—'} | ${r.clips || '—'} | ${mb(r.before)} | ${mb(r.after)} |`);
  }
  const before = rows.reduce((s, r) => s + r.before, 0);
  const after = rows.reduce((s, r) => s + r.after, 0);
  console.log(`| **Разом (${rows.length})** | | | | ${mb(before)} | ${mb(after)} |`);
}
process.exit(failed ? 1 : 0);

async function optimize(id) {
  const src = join(SOURCE_DIR, id, `${id}.glb`);
  if (!existsSync(src)) throw new Error(`raw file ${src} not found`);
  const entry = entries.get(id);
  if (!entry) console.warn(`! ${id}: not in ${MANIFEST}, using hero defaults without a triangle budget`);
  const kind = entry?.kind ?? 'hero';
  const warnings = [];

  const doc = await io.read(src);
  const root = doc.getRoot();

  const clips = normaliseClips(doc, warnings);
  lockRootMotion(doc);

  await doc.transform(dedup(), prune(), weld(), resample());
  const textures = await compressTextures(doc, TEXTURE_MAX[kind] ?? TEXTURE_MAX_DEFAULT, warnings);
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  // Metadata for the loader: GLTFLoader copies scene extras into scene.userData.
  const attachTo = entry?.attachTo ? { hand: entry.attachTo.hand, bones: entry.attachTo.bones } : null;
  root.getDefaultScene()?.setExtras({ vidvazhni: { id, kind, clips, attachTo } });

  const triangles = countTriangles(doc);
  const budget = entry?.triangleBudget;
  if (budget?.max && triangles > budget.max) {
    warnings.push(`${triangles} triangles is over the ${kind} budget of ${budget.max}; reduce it in Blender or Meshy Remesh`);
  }
  if (entry?.rig && entry.rig !== 'none') {
    const missing = (entry.animations ?? []).filter((name) => !clips.includes(name));
    if (missing.length) warnings.push(`missing clips: ${missing.join(', ')}`);
  }

  const outDir = join(OUT_DIR, id);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${id}.glb`);
  writeFileSync(out, await io.writeBinary(doc));

  const before = statSync(src).size;
  const after = statSync(out).size;
  console.log(`✓ ${id}: ${mb(before)} → ${mb(after)}, ${triangles} tris, textures ${textures || 'none'}, clips ${clips.join(' ') || 'none'}`);
  for (const w of warnings) console.warn(`  ! ${w}`);
  return { id, triangles, textures, clips: clips.join(', '), before, after };
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
