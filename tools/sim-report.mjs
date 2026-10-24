// Summarises the balance simulator's JSON lines (tests/balance/sim.test.ts) as Markdown tables.
//   node tools/sim-report.mjs <dir-or-files...>
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2).flatMap((p) =>
  fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(p, f)) : [p],
);
const games = files.flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const quant = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
/** Rounds a hand of `cards` lasts (a card lost per rest), as in tests/replay/card-budget.test.ts. */
const handRounds = (cards) => {
  let r = 0;
  for (let c = cards; c >= 2; c--) r += Math.floor(c / 2);
  return r;
};
const HAND = { warden: 10, 'wind-archer': 10, herbalist: 11, rogue: 9, elementalist: 8, tinker: 12 };
for (const id of Object.keys(HAND)) {
  try {
    HAND[id] = JSON.parse(fs.readFileSync(`data/heroes/${id}.json`, 'utf8')).handSize;
  } catch {}
}

function row(cells) {
  return `| ${cells.join(' | ')} |`;
}

function scenarioTable(filter, title) {
  const out = [`### ${title}`, '', row(['Сценарій', 'Партій', 'Перемоги', 'Раунди (перемога, сер. / мін–макс)', 'Програш: колода', 'Програш: рани', 'Ліміт 40 р.', 'Помилки', 'Запас карт (факт.)']), row(Array(9).fill('---'))];
  for (const sc of ['s1', 's2', 's3', 's4', 's5']) {
    const g = games.filter((x) => x.scenario === sc && filter(x));
    if (!g.length) continue;
    const won = g.filter((x) => x.won);
    const r = won.map((x) => x.rounds);
    const slack = won.map((x) => {
      const max = Math.min(...x.party.map((c) => handRounds(HAND[c])));
      return (max - x.rounds) / max;
    });
    out.push(
      row([
        sc,
        g.length,
        pct(won.length, g.length),
        r.length ? `${f1(avg(r))} / ${Math.min(...r)}–${Math.max(...r)}` : '–',
        pct(g.filter((x) => x.end === 'cards').length, g.length),
        pct(g.filter((x) => x.end === 'damage').length, g.length),
        pct(g.filter((x) => x.end === 'timeout').length, g.length),
        g.filter((x) => x.end === 'error').length,
        slack.length ? pct(avg(slack) * 100, 100) : '–',
      ]),
    );
  }
  return out.join('\n');
}

function heroTable(filter, title) {
  const ids = Object.keys(HAND);
  const out = [`### ${title}`, '', row(['Герой', 'Партій', 'Перемоги партій з ним', 'Шкода / раунд', 'Шкода / партія', 'Лікування / партія', 'Отримано шкоди / раунд', 'Вибув', 'Втрачено карт']), row(Array(9).fill('---'))];
  for (const id of ids) {
    const g = games.filter((x) => filter(x) && x.party.includes(id) && x.end !== 'error');
    if (!g.length) continue;
    const hs = g.map((x) => ({ x, h: x.heroes.find((h) => h.classId === id) }));
    out.push(
      row([
        id,
        g.length,
        pct(g.filter((x) => x.won).length, g.length),
        f1(avg(hs.map(({ x, h }) => h.dealt / Math.max(1, x.rounds)))),
        f1(avg(hs.map(({ h }) => h.dealt))),
        f1(avg(hs.map(({ h }) => h.healed))),
        f1(avg(hs.map(({ x, h }) => h.taken / Math.max(1, x.rounds)))),
        pct(hs.filter(({ h }) => h.exhausted).length, hs.length),
        f1(avg(hs.map(({ h }) => h.lost))),
      ]),
    );
  }
  return out.join('\n');
}

function pairTable(sc) {
  const ids = Object.keys(HAND);
  const out = [`#### ${sc}: перемоги пар (рівні 1–3 разом)`, '', row(['', ...ids]), row(Array(ids.length + 1).fill('---'))];
  for (const a of ids) {
    const cells = ids.map((b) => {
      if (a === b) return '·';
      const g = games.filter((x) => x.scenario === sc && x.party.length === 2 && x.party.includes(a) && x.party.includes(b));
      return g.length ? pct(g.filter((x) => x.won).length, g.length) : '–';
    });
    out.push(row([a, ...cells]));
  }
  return out.join('\n');
}

function initiativeTable() {
  const out = ['### Ініціатива (d12)', '', row(['Сценарій', 'Герої: сер. / p10–p90', 'Монстри: сер. / p10–p90', 'Хід героя раніше за монстрів']), row(Array(4).fill('---'))];
  for (const sc of ['s1', 's2', 's3', 's4', 's5']) {
    const g = games.filter((x) => x.scenario === sc);
    const h = g.flatMap((x) => x.heroInitiative);
    const m = g.flatMap((x) => x.monsterInitiative);
    if (!h.length) continue;
    // Share of (hero, monster group) pairs where the hero acts first, over random pairs.
    let first = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const a = h[(i * 7919) % h.length];
      const b = m[(i * 104729) % m.length];
      if (a === undefined || b === undefined) continue;
      n++;
      if (a < b) first++;
    }
    out.push(row([sc, `${f1(avg(h))} / ${quant(h, 0.1)}–${quant(h, 0.9)}`, `${f1(avg(m))} / ${quant(m, 0.1)}–${quant(m, 0.9)}`, pct(first, n)]));
  }
  return out.join('\n');
}

function defenceLine() {
  const g = games.filter((x) => x.end !== 'error');
  return `Захист: ухилень d12 у середньому ${f1(avg(g.map((x) => x.dodges)))} за партію, «Прикрий друга» ${f1(avg(g.map((x) => x.covers)))}.`;
}

const parts = [
  `Партій: ${games.length} (помилок рушія: ${games.filter((x) => x.end === 'error').length}).`,
  '',
  scenarioTable(() => true, 'Усі партії'),
  '',
  ...[1, 2, 3].map((l) => scenarioTable((x) => x.level === l, `Рівень ${l}`) + '\n'),
  scenarioTable((x) => x.party.length === 2, 'Пари'),
  '',
  scenarioTable((x) => x.party.length > 2, 'Загони по 3–4 героя'),
  '',
  heroTable((x) => x.party.length === 2, 'Герої (у парах, усі сценарії й рівні)'),
  '',
  heroTable((x) => x.party.length === 2 && x.level === 1, 'Герої (у парах, рівень 1)'),
  '',
  ...['s1', 's2', 's3', 's4', 's5'].map((sc) => pairTable(sc) + '\n'),
  initiativeTable(),
  '',
  defenceLine(),
];
const errors = games.filter((x) => x.end === 'error');
if (errors.length) parts.push('', 'Помилки:', ...[...new Set(errors.map((x) => `- ${x.scenario}: ${x.error}`))].slice(0, 10));
console.log(parts.join('\n'));
