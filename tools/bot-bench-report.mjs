// Wins per scenario and party size from tools/bot-bench.sh output, as a Markdown table.
//   node tools/bot-bench-report.mjs out/bench/<label> [out/bench/<other> ...]
import fs from 'node:fs';
import path from 'node:path';

const ORDER = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's15', 's20'];
const runs = process.argv.slice(2).map((dir) => {
  const games = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
    fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  return { label: path.basename(dir), games };
});
const cell = (g) => {
  if (!g.length) return '–';
  const won = g.filter((x) => x.won).length;
  const ends = ['cards', 'damage', 'timeout', 'error'].map((e) => [e, g.filter((x) => x.end === e).length]).filter(([, n]) => n);
  return `${won}/${g.length}` + (ends.length ? ` (${ends.map(([e, n]) => `${e[0]}${n}`).join(' ')})` : '');
};
console.log(`| Місія | ${runs.flatMap((r) => [`${r.label} пара`, `${r.label} трійка`]).join(' | ')} |`);
console.log(`|---|${runs.flatMap(() => ['---', '---']).join('|')}|`);
const tot = runs.map(() => [0, 0, 0, 0]);
for (const sc of ORDER) {
  const cells = runs.flatMap((r, i) => [2, 3].map((n, j) => {
    const g = r.games.filter((x) => x.scenario === sc && x.party.length === n);
    tot[i][2 * j] += g.filter((x) => x.won).length;
    tot[i][2 * j + 1] += g.length;
    return cell(g);
  }));
  if (cells.some((c) => c !== '–')) console.log(`| ${sc} | ${cells.join(' | ')} |`);
}
console.log(`| **Разом** | ${tot.flatMap((t) => [`${t[0]}/${t[1]}`, `${t[2]}/${t[3]}`]).join(' | ')} |`);
