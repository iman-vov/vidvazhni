// s12's secondary goal: pick 3 of the 5 herb bushes (act3.md), counted by `objectsInState`.

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/rules/load';
import { secondaryMet } from '../../src/rules/objectives';
import type { GameState } from '../../src/rules/state';

const s12 = loadContent().scenarios.s12!;
const goal = s12.secondary!.find((g) => g.id === 's12.herbs')!;
const herbs = s12.rooms.flatMap((r) => r.objects ?? []).filter((o) => o.kind === 'herb');

/** A board with the herb bushes, the first `picked` of them picked. */
function board(picked: number): GameState {
  const tiles = Object.fromEntries(herbs.map((o, i) => [o.id, { object: { id: o.id, kind: 'herb', state: i < picked ? 'picked' : 'growing' } }]));
  return { board: { tiles } } as unknown as GameState;
}

describe('s12 herbs', () => {
  it('asks for 3 of the 5 bushes, as act3.md says', () => {
    expect(herbs).toHaveLength(5);
    expect(goal.check).toBe('objectsInState');
    expect(goal.params).toEqual({ kind: 'herb', state: 'picked', count: 3 });
  });

  it('is met from the third picked bush, whichever bushes they are', () => {
    expect([0, 1, 2, 3, 5].map((n) => secondaryMet(board(n), goal))).toEqual([false, false, false, true, true]);
  });
});
