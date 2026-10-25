import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { environmentFor } from '../../src/render/environment/data';
import { buildLayout } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';
import { naturalEdge, buildNatural } from '../../src/render/environment/thicket';
import { loadContent } from '../../src/rules/load';
it('count', () => {
  const content = loadContent();
  const lines: string[] = [];
  for (const id of ['s2', 's3', 's7']) {
    const def = environmentFor(id);
    const layout = buildLayout(content.scenarios[id]!);
    const ps = naturalEdge(layout, def, 'high', planEnvironment(layout, def, 'high'));
    const c: Record<string, number> = {};
    for (const p of ps) { const k = p.piece.split('#')[0]! + ':' + p.band; c[k] = (c[k] ?? 0) + 1; }
    lines.push(id + ' ' + JSON.stringify(c));
  }
  for (const k of ['wild-oak#0', 'wild-fir#0', 'wild-birch#0', 'wild-dead#0', 'brush#0', 'bramble#0', 'tall-grass#0', 'wild-fir-snow#0']) {
    const parts = buildNatural(k, { height: 1 });
    lines.push(k + ' ' + parts.length + ' ' + parts.reduce((s, p) => s + p.geometry.getAttribute('position').count / 3, 0));
  }
  writeFileSync('tests/_tmp/out.txt', lines.join('\n'));
});
