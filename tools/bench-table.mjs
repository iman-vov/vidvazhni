// Markdown table from dev/bench.html results (docs/tech/bench/*.json):
//   node tools/bench-table.mjs <before.json> [after.json]
// One row per mission × quality: fps (p5), calls and tris, as "before → after" when two files are given.
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath) {
  console.error('usage: node tools/bench-table.mjs <before.json> [after.json]');
  process.exit(1);
}
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const before = load(beforePath);
const after = afterPath ? load(afterPath) : null;
const key = (r) => `${r.board}:${r.quality}`;
const afterRuns = new Map((after?.runs ?? []).map((r) => [key(r), r]));

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
const fps = (r) => (r.error ? 'error' : r.fps ? `${r.fps} (${r.p5})` : '—');
const pair = (a, b) => (b === undefined ? a : `${a} → ${b}`);

console.log(`${before.device}${after ? ` → ${after.device}` : ''}, ${before.gpu}, DPR ${before.devicePixelRatio}\n`);
console.log('| mission | quality | fps (p5) | calls | tris |');
console.log('|---|---|---|---|---|');
for (const r of before.runs) {
  const a = afterRuns.get(key(r));
  console.log(`| ${r.board} | ${r.quality} | ${pair(fps(r), a && fps(a))} | ${pair(r.calls, a?.calls)} | ${pair(k(r.tris), a && k(a.tris))} |`);
}
