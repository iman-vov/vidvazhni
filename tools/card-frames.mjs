// Cuts the six hero card frames out of the ChatGPT sheet (art/ui-mockups/card-frames/v1.png, 3×2,
// order of palette.json) into public/ui/cards/frame-<heroId>.webp, keys the grey sheet out of the
// rounded corners, and measures the name plate, the two parchment blocks and the initiative circle
// (flood fills from known points). Also writes frame-<heroId>-compact.webp: the plate and the top
// block joined to the bottom rim, a short card for 9-slicing. Layout → src/ui/game/cardFrames.json
// (fractions of the frame size).
//
//   node tools/card-frames.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(ROOT, 'art/ui-mockups/card-frames/v1.png');
const PALETTE = JSON.parse(readFileSync(join(ROOT, 'art/ui-mockups/card-frames/palette.json'), 'utf8'));
const OUT = join(ROOT, 'public/ui/cards');
const JSON_OUT = join(ROOT, 'src/ui/game/cardFrames.json');

const { data: sheet, info } = await sharp(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (buf, w, x, y) => {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const BG = px(sheet, W, 4, 4);
const isCard = (x, y) => dist(px(sheet, W, x, y), BG) > 40;

/** Runs of indices where `hit(i)` holds for long enough (cards, not specks). */
function runs(n, hit, min = 100) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && hit(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= min) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

// Rows and columns that cross a card have plenty of frame pixels; the gaps between cards have none.
const rowsHit = (y) => {
  let n = 0;
  for (let x = 0; x < W; x += 2) if (isCard(x, y)) n++;
  return n > W / 40;
};
const bands = runs(H, rowsHit);
const boxes = [];
for (const [y0, y1] of bands) {
  const colHit = (x) => {
    let n = 0;
    for (let y = y0; y < y1; y += 2) if (isCard(x, y)) n++;
    return n > (y1 - y0) / 20;
  };
  for (const [x0, x1] of runs(W, colHit)) boxes.push({ x0, x1, y0, y1 });
}
if (boxes.length !== PALETTE.heroes.length) throw new Error(`found ${boxes.length} frames, expected ${PALETTE.heroes.length}`);

/** Flood fill from (sx, sy) over pixels within `tol` of the seed colour; returns the bounding box. */
function flood(buf, w, h, sx, sy, tol, mark) {
  const seed = px(buf, w, sx, sy);
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  let x0 = sx;
  let x1 = sx;
  let y0 = sy;
  let y1 = sy;
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k] || dist(px(buf, w, x, y), seed) > tol) continue;
    seen[k] = 1;
    mark?.(k);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

const frac = (v, n) => +(v / n).toFixed(4);
const rect = (r, w, h) => ({ x: frac(r.x0, w), y: frac(r.y0, h), w: frac(r.x1 - r.x0, w), h: frac(r.y1 - r.y0, h) });

mkdirSync(OUT, { recursive: true });
const layout = {};
for (let i = 0; i < boxes.length; i++) {
  const id = PALETTE.heroes[i].id;
  const b = boxes[i];
  const pad = 2;
  const left = Math.max(0, b.x0 - pad);
  const top = Math.max(0, b.y0 - pad);
  const w = Math.min(W, b.x1 + pad) - left;
  const h = Math.min(H, b.y1 + pad) - top;
  const { data } = await sharp(SHEET).ensureAlpha().extract({ left, top, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
  // The sheet's grey shows in the rounded corners: clear it from each corner.
  for (const [cx, cy] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ])
    flood(data, w, h, cx, cy, 40, (k) => (data[k * 4 + 3] = 0));
  const topBlock = flood(data, w, h, Math.floor(w / 2), Math.floor(h * 0.3), 34);
  const bottomBlock = flood(data, w, h, Math.floor(w / 2), Math.floor(h * 0.72), 34);
  const ring = flood(data, w, h, Math.floor(w / 2), Math.floor((topBlock.y1 + bottomBlock.y0) / 2), 34);
  const plate = flood(data, w, h, Math.floor(w / 2), Math.floor(topBlock.y0 / 2), 70);
  const img = sharp(data, { raw: { width: w, height: h, channels: 4 } });
  await img.clone().webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `frame-${id}.webp`));
  // Compact: the rows above the initiative ring (plate + most of the top block) joined to the last
  // parchment rows of the bottom block and the bottom rim: parchment meets parchment, no seam.
  const cut = ring.y0 - 18;
  const rim = h - (bottomBlock.y1 - 4);
  const upper = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract({ left: 0, top: 0, width: w, height: cut }).raw().toBuffer();
  const lower = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract({ left: 0, top: h - rim, width: w, height: rim }).raw().toBuffer();
  await sharp(Buffer.concat([upper, lower]), { raw: { width: w, height: cut + rim, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(join(OUT, `frame-${id}-compact.webp`));
  layout[id] = {
    size: [w, h],
    plate: rect(plate, w, h),
    top: rect(topBlock, w, h),
    bottom: rect(bottomBlock, w, h),
    initiative: rect(ring, w, h),
    // 9-slice of the compact image in its own pixels: plate, side rims, bottom rim.
    compact: { size: [w, cut + rim], slice: [plate.y1 + 2, w - topBlock.x1 + 2, rim + 4, topBlock.x0 + 2] },
  };
  console.log(id, w, h, JSON.stringify(layout[id]));
}
writeFileSync(JSON_OUT, `${JSON.stringify(layout, null, 2)}\n`);
console.log('→', JSON_OUT);
