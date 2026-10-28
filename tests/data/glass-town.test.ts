// Glass Town (s16–s20, docs/design/act3.md): what the shared map checks do not cover.
import { expect, it } from 'vitest';
import { createGame } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import { beamPath } from '../../src/rules/mirrors';
import { revealRoom } from '../../src/rules/setup';
import { BASE_RULES } from '../../src/rules/variants';
it('s19: the beam reaches the crystal door once all three mirrors are lit, not before', () => {
  const c = loadContent();
  const sc = c.scenarios['s19']!;
  const s = createGame({ scenarioId: 's19', seed: 1, heroes: [{ classId: 'warden', playerId: 'p1', level: 5 }, { classId: 'tinker', playerId: 'p2', level: 5 }], difficulty: 'normal', variants: { ...BASE_RULES } }, c);
  for (const r of sc.rooms) revealRoom({ s, c, ev: [], out: [] }, sc, r.id);
  expect(beamPath(s, sc)?.reached).toBe(false);
  for (const t of Object.values(s.board.tiles)) if (t.object?.kind === 'mirror') t.object.state = 'lit';
  const b = beamPath(s, sc)!;
  expect(b.lit).toEqual(['s19.mirror-1', 's19.mirror-2', 's19.mirror-3']);
  expect(b.reached).toBe(true);
});
