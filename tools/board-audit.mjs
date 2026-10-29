// Board audit (docs/design/board-obstacles.md): how much of each map's field is blocked and how
// much the obstacles bend the way to the monsters.
//   node tools/board-audit.mjs [s2 s3 …]     a markdown table, one row per scenario (default s1–s20)
// Columns: hexes; blocked = obstacles + blocking objects; inner = blocked hexes with all six
// neighbours on the map (not edge dressing), and their share of the field; terrain and traps;
// detour = average walking cost / straight hex distance from each room's way in (start hexes or the
// doors that lead in) to its spawns, with difficult terrain and water at 2; +max = the most extra
// steps any spawn needs. 1.00 means every monster walks a straight line to the heroes.
import { readFileSync, readdirSync } from 'node:fs';

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (h) => `${h[0]},${h[1]}`;
const distance = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
const envOf = {};
for (const f of readdirSync('data/environments')) {
  const e = JSON.parse(readFileSync(`data/environments/${f}`, 'utf8'));
  for (const s of e.scenarios ?? []) envOf[s] = f.replace('.json', '');
}

function audit(id) {
  const s = JSON.parse(readFileSync(`data/scenarios/${id}.json`, 'utf8'));
  const all = new Set();
  const blocked = new Set();
  const terrain = {};
  let traps = 0;
  for (const r of s.rooms) {
    for (const h of r.hexes) all.add(key(h));
    for (const o of r.obstacles ?? []) blocked.add(key(o.hex));
    for (const o of r.objects ?? []) if (o.blocks) blocked.add(key(o.hex));
    for (const t of r.terrain ?? []) terrain[t.terrain] = (terrain[t.terrain] ?? 0) + 1;
    traps += (r.traps ?? []).length;
  }
  const inner = [...blocked].filter((k) => {
    const [q, r] = k.split(',').map(Number);
    return DIRS.every(([dq, dr]) => all.has(key([q + dq, r + dr])));
  }).length;
  let ratio = 0;
  let n = 0;
  let extra = 0;
  for (const room of s.rooms) {
    const hexes = new Set(room.hexes.map(key));
    const stop = new Set([...(room.obstacles ?? []).map((o) => key(o.hex)), ...(room.objects ?? []).filter((o) => o.blocks).map((o) => key(o.hex))]);
    const walls = new Set((room.walls ?? []).flatMap(([a, b]) => [`${key(a)}|${key(b)}`, `${key(b)}|${key(a)}`]));
    const cost = {};
    for (const t of room.terrain ?? []) cost[key(t.hex)] = t.terrain === 'difficult' || t.terrain === 'water' ? 2 : 1;
    const ways = room.id === s.startRoom ? [...s.startHexes] : [];
    for (const other of s.rooms) for (const d of other.doors ?? []) if (d.to === room.id) ways.push(d.hex);
    for (const from of ways) {
      const best = new Map([[key(from), 0]]);
      const queue = [[0, from]];
      while (queue.length) {
        queue.sort((a, b) => a[0] - b[0]);
        const [c, h] = queue.shift();
        if (c > best.get(key(h))) continue;
        for (const [dq, dr] of DIRS) {
          const next = [h[0] + dq, h[1] + dr];
          const k = key(next);
          if (!hexes.has(k) || stop.has(k) || walls.has(`${key(h)}|${k}`)) continue;
          const nc = c + (cost[k] ?? 1);
          if (nc < (best.get(k) ?? Infinity)) {
            best.set(k, nc);
            queue.push([nc, next]);
          }
        }
      }
      for (const sp of room.spawns ?? []) {
        const walk = best.get(key(sp.hex));
        const straight = distance(from, sp.hex);
        if (walk === undefined || straight === 0) continue;
        ratio += walk / straight;
        n++;
        extra = Math.max(extra, walk - straight);
      }
    }
  }
  const terr = [...Object.entries(terrain).map(([t, c]) => `${t} ${c}`), ...(traps ? [`traps ${traps}`] : [])].join(', ') || '—';
  return `| ${id} | ${envOf[id] ?? '?'} | ${s.goal.type} | ${s.rooms.length} | ${all.size} | ${blocked.size} | ${inner} (${Math.round((100 * inner) / all.size)}%) | ${terr} | ${n ? (ratio / n).toFixed(2) : '—'} | +${extra} |`;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Array.from({ length: 20 }, (_, i) => `s${i + 1}`);
console.log('| map | location | goal | rooms | hexes | blocked | inner blocked | terrain, traps | detour | +max |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const id of ids) console.log(audit(id));
