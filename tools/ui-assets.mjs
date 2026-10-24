// UI art from ChatGPT → game files: `npm run ui-assets`.
// Cut-outs (logos, the button base) get a clean alpha: a black background is keyed out by brightness
// and the colour is un-premultiplied, so no dark fringe stays on the soft edges; nearly opaque and
// nearly empty pixels are snapped, the image is trimmed and resized. Opaque art (backgrounds) is only
// resized; round portraits are cropped from the concept art. Output: WebP in src/ui/game/assets/ plus manifest.json (sizes and the button's 9-slice
// insets for CSS border-image). Swap art by changing JOBS below and running the script again.
//
// `--preview <dir>` also writes each cut-out composited on a light and a dark background.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/ui/game/assets');

/** kind: 'cutout' (alpha) or 'opaque'; width: max output width in px. */
const JOBS = [
  { id: 'menu-bg', src: 'art/ui-mockups/main-menu/assets/background.png', kind: 'opaque', width: 1920, quality: 80 },
  { id: 'campaign-map', src: 'art/ui-mockups/campaign-map/v2.png', kind: 'opaque', width: 1448, quality: 80 },
  { id: 'campaign-map-lo', src: 'art/ui-mockups/campaign-map/v2.png', kind: 'opaque', width: 960, quality: 78 },
  { id: 'button', src: 'art/ui-mockups/main-menu/assets/button-base.png', kind: 'cutout', width: 760, slice: true },
  { id: 'logo-uk', src: 'art/ui-mockups/logos/uk/final.png', kind: 'cutout', width: 1200 },
  { id: 'logo-en', src: 'art/ui-mockups/logos/en/v2.png', kind: 'cutout', width: 1200 },
  { id: 'logo-de', src: 'art/ui-mockups/logos/de/v1.png', kind: 'cutout', width: 1200 },
  // Camp (art/ui-mockups/camp/assets/manifest.json): clean tavern, empty frames, Marta, and the
  // selected hero's waist-up illustration (the manifest keeps the camp 2D, no live GLB).
  { id: 'camp-bg', src: 'art/ui-mockups/camp/assets/background.png', kind: 'opaque', width: 1448, quality: 80 },
  { id: 'camp-marta', src: 'art/ui-mockups/camp/assets/marta.png', kind: 'cutout', width: 560 },
  { id: 'camp-panel', src: 'art/ui-mockups/camp/assets/panel.png', kind: 'cutout', width: 900 },
  { id: 'camp-tab', src: 'art/ui-mockups/camp/assets/tab.png', kind: 'cutout', width: 520 },
  { id: 'camp-slot', src: 'art/ui-mockups/camp/assets/slot-frame.png', kind: 'cutout', width: 220 },
  ...['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'].map((id) => ({ id: `camp-hero-${id}`, src: `art/ui-mockups/camp/assets/heroes/${id}.png`, kind: 'cutout', width: 720 })),
  // Dice (art/ui-mockups/dice/v1.png): the blank navy-and-copper d12 under a rolled number.
  { id: 'die-d12', src: 'art/ui-mockups/dice/assets/d12-blank.png', kind: 'cutout', width: 128 },
];

/** Round portraits (initiative ribbon, hero panel): heroes, summons and bosses from portrait.png,
 *  monsters cropped from front.png. Crop = [view, centre x, centre y, size] as fractions of the source. */
const PORTRAIT_PX = 160;
const PORTRAITS = {
  warden: ['portrait', 0.5, 0.4, 0.8],
  'wind-archer': ['portrait', 0.5, 0.4, 0.8],
  herbalist: ['portrait', 0.5, 0.4, 0.8],
  rogue: ['portrait', 0.5, 0.4, 0.8],
  elementalist: ['portrait', 0.5, 0.4, 0.8],
  tinker: ['portrait', 0.5, 0.4, 0.8],
  'tinker-button': ['portrait', 0.5, 0.45, 0.85],
  'bog-miller': ['portrait', 0.5, 0.4, 0.8],
  shadowhand: ['portrait', 0.5, 0.4, 0.8],
  'cellar-rat': ['front', 0.73, 0.36, 0.42],
  gremlin: ['front', 0.5, 0.21, 0.4],
  'grey-wolf': ['front', 0.42, 0.25, 0.42],
  'bandit-brute': ['front', 0.5, 0.17, 0.34],
  'bandit-crossbow': ['front', 0.5, 0.17, 0.34],
  'gloom-cultist': ['front', 0.5, 0.18, 0.36],
  'stone-sentinel': ['front', 0.5, 0.2, 0.4],
  'shadow-wraith': ['front', 0.55, 0.3, 0.5],
  'bog-slime': ['front', 0.5, 0.55, 0.7],
  thornling: ['front', 0.5, 0.3, 0.5],
};

/** Brightness (max channel) below LO is background, above HI fully opaque. */
const KEY_LO = 10;
const KEY_HI = 70;
const SNAP_LO = 4;
const SNAP_HI = 248;

const previewDir = (() => {
  const i = process.argv.indexOf('--preview');
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** True when the picture has no real transparency (opaque everywhere, dark corners). */
function needsKey(data, w, h) {
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 250) opaque++;
  return opaque > 0.98 * w * h;
}

export function cutout(data, w, h) {
  const key = needsKey(data, w, h);
  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3] / 255;
    if (key) {
      const m = Math.max(data[i], data[i + 1], data[i + 2]);
      a = Math.min(1, Math.max(0, (m - KEY_LO) / (KEY_HI - KEY_LO)));
      // The pixel was the colour composited over black: divide by alpha to get the colour back.
      if (a > 0) for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(data[i + c] / a));
    }
    let a8 = Math.round(a * 255);
    if (a8 <= SNAP_LO) a8 = 0;
    else if (a8 >= SNAP_HI) a8 = 255;
    data[i + 3] = a8;
    if (a8 === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  }
  return key;
}

/** 9-slice insets of the button: the rounded ends (with the side diamonds) and half the height. */
function buttonSlices(data, w, h) {
  const alpha = (x, y) => data[(y * w + x) * 4 + 3];
  const cx = Math.floor(w / 2);
  let top = 0;
  while (top < h && alpha(cx, top) < 128) top++;
  // Where the straight top edge begins: the first column whose top rim is at the rim row.
  let left = 0;
  while (left < cx && alpha(left, top + 2) < 128) left++;
  let right = w - 1;
  while (right > cx && alpha(right, top + 2) < 128) right--;
  const pad = Math.round(h * 0.06);
  return { top: Math.floor(h / 2), bottom: h - Math.floor(h / 2), left: Math.min(cx - 1, left + pad), right: Math.min(cx - 1, w - 1 - right + pad) };
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  if (previewDir) mkdirSync(previewDir, { recursive: true });
  const manifest = {};
  for (const job of JOBS) {
    let img = sharp(join(ROOT, job.src)).ensureAlpha();
    let entry;
    if (job.kind === 'opaque') {
      const out = await img.removeAlpha().resize({ width: job.width, withoutEnlargement: true }).webp({ quality: job.quality ?? 82 }).toBuffer({ resolveWithObject: true });
      writeFileSync(join(OUT, `${job.id}.webp`), out.data);
      entry = { width: out.info.width, height: out.info.height, bytes: out.data.length };
    } else {
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      const keyed = cutout(data, info.width, info.height);
      const trimmed = await sharp(data, { raw: info }).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
      const raw = await sharp(trimmed.data, { raw: { width: trimmed.info.width, height: trimmed.info.height, channels: 4 } })
        .resize({ width: job.width, withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const webp = await sharp(raw.data, { raw: raw.info }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
      writeFileSync(join(OUT, `${job.id}.webp`), webp);
      entry = { width: raw.info.width, height: raw.info.height, bytes: webp.length, keyed };
      if (job.slice) entry.slice = buttonSlices(raw.data, raw.info.width, raw.info.height);
      if (previewDir) {
        for (const [name, bg] of [['light', '#f2efe6'], ['dark', '#1d2433']]) {
          await sharp({ create: { width: raw.info.width + 40, height: raw.info.height + 40, channels: 4, background: bg } })
            .composite([{ input: webp, left: 20, top: 20 }])
            .png()
            .toFile(join(previewDir, `${job.id}-${name}.png`));
        }
      }
    }
    manifest[job.id] = { src: job.src, ...entry };
    console.log(`${job.id}: ${entry.width}×${entry.height}, ${(entry.bytes / 1024).toFixed(0)} KB${entry.keyed ? ', keyed' : ''}${entry.slice ? `, slice ${JSON.stringify(entry.slice)}` : ''}`);
  }
  manifest.portraits = await portraits();
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

async function portraits() {
  const dir = join(OUT, 'portraits');
  mkdirSync(dir, { recursive: true });
  const done = [];
  const sheet = [];
  for (const [id, [view, cx, cy, size]] of Object.entries(PORTRAITS)) {
    const src = join(ROOT, 'art/concepts', id, `${view}.png`);
    if (!existsSync(src)) continue;
    const meta = await sharp(src).metadata();
    const side = Math.round(size * Math.min(meta.width, meta.height));
    const left = Math.max(0, Math.min(meta.width - side, Math.round(cx * meta.width - side / 2)));
    const top = Math.max(0, Math.min(meta.height - side, Math.round(cy * meta.height - side / 2)));
    const webp = await sharp(src).extract({ left, top, width: side, height: side }).resize(PORTRAIT_PX, PORTRAIT_PX).webp({ quality: 82 }).toBuffer();
    writeFileSync(join(dir, `${id}.webp`), webp);
    done.push(id);
    sheet.push(webp);
  }
  if (previewDir && sheet.length) {
    await sharp({ create: { width: PORTRAIT_PX * sheet.length, height: PORTRAIT_PX, channels: 3, background: '#1d2433' } })
      .composite(sheet.map((input, i) => ({ input, left: i * PORTRAIT_PX, top: 0 })))
      .png()
      .toFile(join(previewDir, 'portraits.png'));
  }
  console.log(`portraits: ${done.length} (${done.join(', ')})`);
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
