import { describe, expect, it } from 'vitest';
import { planAnimation, planLength, TIMING, type AnimStep } from '../../src/render/animPlan';
import type { GameEvent } from '../../src/rules/state';
import type { Hex } from '../../src/rules/hex';

const W = 'hero:warden';
const A = 'hero:wind-archer';
const R = 'monster:cellar-rat:1';
const G = 'monster:gremlin:2';
const start: Record<string, Hex> = { [W]: [0, 1], [A]: [0, 2], [R]: [3, -1], [G]: [2, 4] };

function kinds(steps: AnimStep[]): string[] {
  return steps.map((s) => s.kind);
}

describe('planAnimation', () => {
  it('ignores events without a picture', () => {
    const events: GameEvent[] = [
      { type: 'roundStarted', round: 1 },
      { type: 'cardMoved', heroId: W, cardId: 'x', to: 'discard' },
      { type: 'xpGained', heroId: W, amount: 1 },
      { type: 'turnEnded', figureId: W },
      { type: 'deckShuffled', deck: 'monsters' },
    ];
    expect(planAnimation(events, start)).toEqual([]);
  });

  it('walks from where the figure stands, and the next move starts at the end of the last one', () => {
    const steps = planAnimation(
      [
        { type: 'moved', figureId: W, path: [[1, 0]] },
        { type: 'moved', figureId: W, path: [[2, -1], [2, -2]] },
      ],
      start,
    );
    expect(kinds(steps)).toEqual(['walk', 'walk']);
    expect(steps[0]).toMatchObject({ path: [[0, 1], [1, 0]], wait: TIMING.walkPerHex });
    expect(steps[1]).toMatchObject({ path: [[1, 0], [2, -1], [2, -2]] });
    expect(steps[1]!.wait).toBeCloseTo(TIMING.walkPerHex * 2);
  });

  it('maps jump and fly to an arc, push and pull to a slide', () => {
    const steps = planAnimation(
      [
        { type: 'moved', figureId: W, path: [[1, 1], [2, 1]], jump: true },
        { type: 'moved', figureId: A, path: [[1, 2]], fly: true },
        { type: 'pushed', figureId: R, path: [[4, -1]] },
        { type: 'pushed', figureId: G, path: [[2, 3]], pull: true },
      ],
      start,
    );
    expect(kinds(steps)).toEqual(['jump', 'jump', 'slide', 'slide']);
    expect(steps[0]).toMatchObject({ fly: false, path: [[0, 1], [1, 1], [2, 1]] });
    expect(steps[1]).toMatchObject({ fly: true });
    expect(steps[2]).toMatchObject({ pull: false, path: [[3, -1], [4, -1]] });
    expect(steps[3]).toMatchObject({ pull: true });
  });

  it('marks an attack from further than one hex as ranged and waits for the projectile', () => {
    const attack = (attackerId: string, targetId: string, chosen = '+0'): GameEvent => ({
      type: 'attacked',
      attackerId,
      targetId,
      base: 2,
      modifiers: [chosen],
      chosen,
      shield: 0,
      damage: 2,
    });
    const [far, near] = planAnimation([attack(A, R), attack(W, A)], start);
    expect(far).toMatchObject({ kind: 'attack', ranged: true, range: 3 });
    expect(near).toMatchObject({ kind: 'attack', ranged: false, range: 1 });
    if (far?.kind !== 'attack' || near?.kind !== 'attack') throw new Error('attack steps expected');
    expect(far.impact).toBeGreaterThan(near.impact);
    // Damage numbers follow after the hit, never before.
    expect(far.wait).toBeGreaterThan(far.impact);
  });

  it('uses the attacker position after its move, and isRanged for monsters that always shoot', () => {
    const steps = planAnimation(
      [
        { type: 'moved', figureId: G, path: [[2, 3], [2, 2]] },
        { type: 'attacked', attackerId: G, targetId: A, base: 1, modifiers: ['+0'], chosen: '+0', shield: 0, damage: 1 },
      ],
      { ...start, [A]: [2, 1] },
      { isRanged: (id) => id === G },
    );
    expect(steps[1]).toMatchObject({ kind: 'attack', range: 1, ranged: true });
  });

  it('labels «промах» and ×2, and carries the shield', () => {
    const steps = planAnimation(
      [
        { type: 'attacked', attackerId: W, targetId: A, base: 2, modifiers: ['miss'], chosen: 'miss', shield: 1, damage: 0 },
        { type: 'attacked', attackerId: W, targetId: A, base: 2, modifiers: ['x2'], chosen: 'x2', shield: 1, damage: 3 },
      ],
      start,
    );
    expect(steps[0]).toMatchObject({ label: 'miss', shield: 1, damage: 0 });
    expect(steps[1]).toMatchObject({ label: 'x2', damage: 3 });
  });

  it('a monster disperses the fog, a hero is exhausted without a puff, a downed hero stays', () => {
    const steps = planAnimation(
      [
        { type: 'figureDied', figureId: R },
        { type: 'heroExhausted', heroId: A, reason: 'damage' },
        { type: 'heroDowned', heroId: W },
        { type: 'heroRevived', heroId: W, byId: A },
      ],
      start,
    );
    expect(steps).toMatchObject([
      { kind: 'death', figureId: R, fog: true },
      { kind: 'death', figureId: A, fog: false },
      { kind: 'downed', figureId: W },
      { kind: 'revived', figureId: W, byId: A },
    ]);
  });

  it('a spawned figure gets its hex for later steps', () => {
    const id = 'monster:gremlin:7';
    const steps = planAnimation(
      [
        { type: 'roomRevealed', roomId: 's1.wine-cellar' },
        { type: 'figureSpawned', figureId: id },
        { type: 'attacked', attackerId: id, targetId: W, base: 1, modifiers: ['+0'], chosen: '+0', shield: 0, damage: 1 },
      ],
      start,
      { spawnHex: (x) => (x === id ? [0, 4] : undefined) },
    );
    expect(kinds(steps)).toEqual(['room', 'spawn', 'attack']);
    expect(steps[2]).toMatchObject({ range: 3, ranged: true });
  });

  it('only a strong element has a burst, at the figure whose turn it is', () => {
    const steps = planAnimation(
      [
        { type: 'turnStarted', figureId: A },
        { type: 'elementChanged', element: 'air', level: 'strong' },
        { type: 'elementChanged', element: 'fire', level: 'waning' },
      ],
      start,
    );
    expect(steps).toMatchObject([{ kind: 'element', element: 'air', actorId: A }]);
  });

  it('maps orbs, conditions, heal, shield, loot and traps', () => {
    const steps = planAnimation(
      [
        { type: 'orbInfused', orb: 'fire', ownerId: W },
        { type: 'orbConsumed', orb: 'fire', byId: A, fromId: W },
        { type: 'orbDimmed', orb: 'air' },
        { type: 'orbExpired', orb: 'air' },
        { type: 'conditionAdded', figureId: R, condition: 'stun' },
        { type: 'conditionRemoved', figureId: R, condition: 'stun' },
        { type: 'healed', figureId: W, amount: 2, removed: ['poison'] },
        { type: 'shieldAdded', figureId: W, value: 1 },
        { type: 'looted', heroId: W, coins: 1 },
        { type: 'trapTriggered', figureId: R, damage: 2 },
        { type: 'damaged', figureId: R, amount: 2, source: 'trap' },
        { type: 'trapPlaced', hex: [1, 1] },
      ],
      start,
    );
    expect(kinds(steps)).toEqual(['orb', 'orb', 'orb', 'orb', 'condition', 'condition', 'heal', 'shield', 'loot', 'trap', 'damage', 'trapPlaced']);
    expect(steps.slice(0, 4).map((s) => (s.kind === 'orb' ? s.change : ''))).toEqual(['infused', 'consumed', 'dimmed', 'expired']);
    expect(steps[1]).toMatchObject({ ownerId: W, byId: A });
    expect(steps[4]).toMatchObject({ added: true });
    expect(steps[5]).toMatchObject({ added: false });
  });

  it('a trap snaps after the walk onto it (the engine reports it first), on the hex walked to', () => {
    const steps = planAnimation(
      [
        { type: 'trapTriggered', figureId: W, damage: 2 },
        { type: 'moved', figureId: W, path: [[1, 0], [2, 0]] },
        { type: 'damaged', figureId: W, amount: 2, source: 'trap' },
        { type: 'trapTriggered', figureId: R, damage: 2 },
        { type: 'pushed', figureId: R, path: [[4, -1]] },
      ],
      start,
    );
    expect(kinds(steps)).toEqual(['walk', 'trap', 'damage', 'slide', 'trap']);
    expect(steps[1]).toMatchObject({ figureId: W, hex: [2, 0], wait: TIMING.trap });
    expect(steps[4]).toMatchObject({ figureId: R, hex: [4, -1] });
  });

  it('does not change the positions it is given', () => {
    const positions = { [W]: [0, 1] as Hex };
    planAnimation([{ type: 'moved', figureId: W, path: [[1, 0]] }], positions);
    expect(positions[W]).toEqual([0, 1]);
  });

  it('the X die roll is a badge over a figure on the board', () => {
    const steps = planAnimation([{ type: 'dieRolled', figureId: W, roll: 4, value: 6 }, { type: 'dieRolled', figureId: 'hero:gone', roll: 2, value: 3 }], start);
    expect(steps).toEqual([expect.objectContaining({ kind: 'die', figureId: W, roll: 4 })]);
  });
});

describe('planLength', () => {
  it('is the sum of waits, or longer when the last step keeps animating', () => {
    const steps = planAnimation(
      [
        { type: 'moved', figureId: W, path: [[1, 0]] },
        { type: 'figureDied', figureId: R },
      ],
      start,
    );
    const waits = steps.reduce((t, s) => t + s.wait, 0);
    expect(planLength(steps)).toBeGreaterThanOrEqual(waits);
    expect(planLength([])).toBe(0);
  });
});
