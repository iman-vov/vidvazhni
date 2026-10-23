// Draws the app icon (a glowing lantern hex on a dark field) into PNG files without extra dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [29, 36, 51];
const HEX = [52, 64, 88];
const GLOW = [255, 196, 87];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function insideHex(x, y, r) {
  // Flat-top hexagon centred at the origin.
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return ay <= (Math.sqrt(3) / 2) * r && Math.sqrt(3) * ax + ay <= Math.sqrt(3) * r;
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size - 0.5;
      const y = (py + 0.5) / size - 0.5;
      let col = BG;
      if (insideHex(x, y, 0.4)) col = HEX;
      const d = Math.hypot(x, y);
      if (d < 0.2) {
        const t = Math.min(1, (0.2 - d) / 0.08);
        col = col.map((c, i) => Math.round(c + (GLOW[i] - c) * t));
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/apple-touch-icon.png', render(180));
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1d2433"/>` +
    `<polygon points="90,50 70,84.6 30,84.6 10,50 30,15.4 70,15.4" fill="#344058"/>` +
    `<circle cx="50" cy="50" r="16" fill="#ffc457"/></svg>\n`,
);
console.log('icons written');
