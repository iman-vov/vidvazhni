import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScenarioDef } from '../../src/rules/content';
import { loadContent } from '../../src/rules/load';
import { environmentFor } from '../../src/render/environment/data';
import { scenarioPartitions, withRoomEdges } from '../../src/render/environment';
import { auditPlacements, circleFootprint, crossesWall, overlaps, pieceBox, placementFootprint, wallSegments } from '../../src/render/environment/footprint';
import { buildLayout } from '../../src/render/environment/layout';
import { planEnvironment } from '../../src/render/environment/plan';

const content = loadContent();
const scenarios: ScenarioDef[] = [
  JSON.parse(readFileSync('data/tutorial/s0-tutorial.json', 'utf8')) as ScenarioDef,
  ...Object.values(content.scenarios),
  ...['s6', 's7', 's8', 's9', 's10'].map((id) => JSON.parse(readFileSync(`data/scenarios/${id}.json`, 'utf8')) as ScenarioDef),
].filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i);

function audit(s: ScenarioDef) {
  const layout = buildLayout(s);
  const def = withRoomEdges(environmentFor(s.id), s);
  const partitions = scenarioPartitions(layout, s).map((p) => p.points);
  return auditPlacements(planEnvironment(layout, def, 'high', partitions), partitions, 0.04, def);
}

describe('footprints', () => {
  it('measures a wine rack as wide and shallow, a barrel as round', () => {
    const [x0, x1, z0, z1] = pieceBox('wine-rack');
    expect(x1 - x0).toBeGreaterThan(0.9);
    expect(z1 - z0).toBeLessThan(0.45);
    const b = pieceBox('barrel');
    expect(Math.abs(b[1] - b[0] - (b[3] - b[2]))).toBeLessThan(0.05);
  });

  it('sees overlap of turned boxes and a piece through a wall', () => {
    const a = placementFootprint({ piece: 'wine-rack', x: 0, z: 0, rot: 0, scale: 1 });
    expect(overlaps(a, circleFootprint(0.4, 0, 0.2))).toBe(true);
    expect(overlaps(a, circleFootprint(0, 0.5, 0.1))).toBe(false);
    // A wall along X at z = -0.5, room toward +Z: a rack whose back is at about -0.34 is clear, one
    // pushed back 0.3 is through it.
    const wall = wallSegments([{ piece: 'stone-wall', x: 0, z: -0.5, rot: 0, scale: 1, sx: 3, height: 1.6, room: 'r', band: 'edge' }]);
    expect(crossesWall(a, wall)).toBe(false);
    expect(crossesWall({ ...a, z: -0.3 }, wall)).toBe(true);
  });

  it('places no prop inside another or through a wall in any scenario', () => {
    const lines: string[] = [];
    for (const s of scenarios) {
      const r = audit(s);
      lines.push(`${s.id}: ${r.overlaps.length} overlaps, ${r.walls.length} through walls${r.overlaps.length + r.walls.length ? ' — ' + [...r.overlaps, ...r.walls].slice(0, 6).join('; ') : ''}`);
    }
    process.stderr.write(lines.join('\n') + '\n');
    for (const l of lines) expect(l).toMatch(/: 0 overlaps, 0 through walls$/);
  }, 60000);
});
