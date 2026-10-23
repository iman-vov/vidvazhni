import { describe, expect, it } from 'vitest';
import type { HeroCard } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import {
  act,
  card,
  eventsOf,
  fillerCards,
  heroOf,
  makeContent,
  newGame,
  playHalf,
  rejects,
  selectAll,
  type FixtureOptions,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('m.walk', 10, [{ type: 'move', value: 4, jump: true }], [{ type: 'move', value: 3 }]),
  card('m.fly', 20, [{ type: 'move', value: 4, fly: true }], [{ type: 'move', value: 5 }]),
  ...fillerCards('m', 8),
];

function game(opts: FixtureOptions = {}) {
  const content = makeContent({ heroes: { alpha: CARDS }, ...opts });
  return { content, s: newGame(content, ['alpha']) };
}

function move(opts: FixtureOptions, half: 'top' | 'bottom', cardId: string, path: Hex[]) {
  const { content, s } = game(opts);
  const t = selectAll(s, content, { alpha: ['m.walk', 'm.fly'] });
  return { content, s: act(t, content, { type: 'startHalf', heroId: 'hero:alpha', cardId, half }), path };
}

describe('move', () => {
  it('follows a legal path within the move value', () => {
    const { content, s } = move({}, 'bottom', 'm.walk', []);
    rejects(s, content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2], [4, 2]] } });
    rejects(s, content, { type: 'resolveStep', choice: { path: [[2, 2]] } });
    const t = act(s, content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2]] } });
    expect(heroOf(t, 'alpha').hex).toEqual([3, 2]);
    expect(eventsOf(t.log, 'moved')).toEqual([{ type: 'moved', figureId: 'hero:alpha', path: [[1, 2], [2, 2], [3, 2]] }]);
  });

  it('difficult terrain costs 2; obstacles block walking but not jumping', () => {
    const terrain = { room: { terrain: [{ hex: [1, 2] as Hex, terrain: 'difficult' as const }], obstacles: [{ hex: [2, 2] as Hex }] } };
    const walk = move(terrain, 'bottom', 'm.walk', []);
    rejects(walk.s, walk.content, { type: 'resolveStep', choice: { path: [[1, 2], [1, 3], [2, 3]] } });
    act(walk.s, walk.content, { type: 'resolveStep', choice: { path: [[1, 2], [1, 3]] } });
    const jump = move(terrain, 'top', 'm.walk', []);
    const t = act(jump.s, jump.content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2]] } });
    expect(heroOf(t, 'alpha').hex).toEqual([3, 2]);
  });

  it('a trap deals 2 + level damage when entered and disappears; the hero may avoid it', () => {
    const opts = { room: { traps: [{ hex: [1, 2] as Hex }] } };
    const { content, s } = move(opts, 'bottom', 'm.walk', []);
    let t = act(s, content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2]] } });
    expect(t.pending).toEqual({ kind: 'avoidDamage', heroId: 'hero:alpha', amount: 3, source: 'trap' });
    expect(heroOf(t, 'alpha').hex).toEqual([1, 2]);
    t = act(t, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(t, 'alpha').hp).toBe(7);
    expect(heroOf(t, 'alpha').hex).toEqual([2, 2]);
    expect(t.board.tiles['1,2']?.trap).toBeUndefined();
    expect(eventsOf(t.log, 'trapTriggered')).toHaveLength(1);
    expect(t.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
  });

  it('jumping ignores traps on the way but not on the landing hex; flying ignores them', () => {
    const opts = { room: { traps: [{ hex: [1, 2] as Hex }, { hex: [3, 2] as Hex }] } };
    const jump = move(opts, 'top', 'm.walk', []);
    const t = act(jump.s, jump.content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2]] } });
    expect(t.pending).toMatchObject({ kind: 'avoidDamage', amount: 3 });
    expect(t.board.tiles['1,2']?.trap).toBeDefined();
    const fly = move(opts, 'top', 'm.fly', []);
    const u = act(fly.s, fly.content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2]] } });
    expect(u.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
    expect(heroOf(u, 'alpha').hp).toBe(10);
  });

  it('hazardous terrain hurts on every hex entered', () => {
    const opts = { room: { terrain: [{ hex: [1, 2] as Hex, terrain: 'hazardous' as const }, { hex: [2, 2] as Hex, terrain: 'hazardous' as const }] } };
    const { content, s } = move(opts, 'bottom', 'm.walk', []);
    let t = act(s, content, { type: 'resolveStep', choice: { path: [[1, 2], [2, 2], [3, 2]] } });
    t = act(t, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    t = act(t, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(t, 'alpha').hp).toBe(8);
    expect(heroOf(t, 'alpha').hex).toEqual([3, 2]);
  });

  it('an immobilized hero cannot move', () => {
    const { content, s } = move({}, 'bottom', 'm.walk', []);
    heroOf(s, 'alpha').conditions.immobilize = { expiresAfterTurn: 1 };
    rejects(s, content, { type: 'resolveStep', choice: { path: [[1, 2]] } });
  });
});

describe('doors', () => {
  const opts: FixtureOptions = {
    secondRoom: {
      spawns: [
        { monster: 'rat', hex: [8, 2], by: { '2': 'normal' } },
        { monster: 'rat', hex: [8, 3], by: { '2': 'elite' } },
      ],
      coins: [[9, 0]],
    },
  };

  it('a closed door ends the move, reveals the room and spawns its monsters; undo is no longer possible', () => {
    const { content, s: s0 } = game(opts);
    heroOf(s0, 'alpha').hex = [4, 2];
    let s = selectAll(s0, content, { alpha: ['m.walk', 'm.fly'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'm.fly', half: 'bottom' });
    rejects(s, content, { type: 'resolveStep', choice: { path: [[5, 2], [6, 2], [7, 2]] } });
    s = act(s, content, { type: 'resolveStep', choice: { path: [[5, 2], [6, 2]] } });
    expect(s.board.revealedRooms).toEqual(['r1', 'r2']);
    expect(s.board.tiles['6,2']?.door?.open).toBe(true);
    expect(s.board.tiles['9,0']?.coins).toBe(1);
    expect(s.figures['monster:rat:1']).toMatchObject({ rank: 'normal', hex: [8, 2] });
    expect(s.figures['monster:rat:2']).toMatchObject({ rank: 'elite', hex: [8, 3] });
    expect(s.turnOrder.some((e) => e.kind === 'monsterGroup' && e.typeId === 'rat')).toBe(true);
    expect(s.undoPoint).toBeNull();
    rejects(s, content, { type: 'undo' });
  });

  it('newly revealed monsters act this round', () => {
    const { content, s: s0 } = game(opts);
    heroOf(s0, 'alpha').hex = [5, 2];
    let s = selectAll(s0, content, { alpha: ['m.walk', 'm.fly'] });
    s = playHalf(s, content, 'alpha', 'm.fly', 'bottom', [{ path: [[6, 2]] }]);
    s = act(s, content, { type: 'endTurn', heroId: 'hero:alpha' });
    expect(eventsOf(s.log, 'turnStarted').map((e) => e.figureId)).toContain('monster:rat:2');
  });
});
