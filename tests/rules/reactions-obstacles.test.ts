import { describe, expect, it } from 'vitest';
import type { MonsterCard, RoomDef } from '../../src/rules/content';
import { createGame } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import { interactiveObstacles, legalActions, reactionPrompts } from '../../src/rules/queries';
import { act, endTurn, eventsOf, fillerCards, heroOf, makeContent, rejects, selectAll, setupFor, stackModifiers } from '../helpers/engineFixtures';

const ATTACK: MonsterCard[] = [{ id: 'tmelee.50', initiative: 50, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];
const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const H = 'hero:alpha';

function game(o: { items?: string[]; deck?: MonsterCard[]; room?: Partial<RoomDef>; secondRoom?: Partial<RoomDef>; noRat?: boolean } = {}) {
  const c = makeContent({
    heroes: { alpha: fillerCards('alpha') },
    decks: [{ id: 'tmelee', cards: o.deck ?? ATTACK }],
    spawns: o.noRat ? [] : [{ monster: 'rat', hex: [1, 2], rank: 'elite' }],
    ...(o.room ? { room: o.room } : {}),
    ...(o.secondRoom ? { secondRoom: o.secondRoom } : {}),
  });
  c.items = loadContent().items;
  const setup = setupFor(c, ['alpha']);
  setup.heroes[0]!.items = o.items ?? [];
  const s = createGame(setup, c);
  stackModifiers(s, 'alpha', Array<string>(10).fill('+0'));
  stackModifiers(s, 'monsters', Array<string>(10).fill('+0'));
  return { c, s: selectAll(s, c, { alpha: ['alpha.c1', 'alpha.c2'] }) };
}

describe('reactive items', () => {
  it('Кольчуга in the damage window: Щит 1 lowers the incoming attack damage before it resolves', () => {
    const { c, s: s0 } = game({ items: ['chainmail', 'dagger'] });
    let s = act(s0, c, { type: 'endTurn', heroId: H });
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', heroId: H, amount: 3 });
    expect(legalActions(s, c)).toContainEqual({ type: 'useItem', heroId: H, itemId: 'chainmail' });
    expect(rejects(s, c, { type: 'useItem', heroId: H, itemId: 'dagger' })).toBe('only a shield item helps against this damage');
    expect(reactionPrompts(s, c)).toMatchObject([{ itemId: 'chainmail', window: 'damage', shield: 1, damage: 3, reduced: 2 }]);
    s = act(s, c, { type: 'useItem', heroId: H, itemId: 'chainmail' });
    expect(eventsOf(s.log, 'itemReaction')).toEqual([
      { type: 'itemReaction', heroId: H, itemId: 'chainmail', window: 'damage', shield: 1, damageBefore: 3, damage: 2 },
    ]);
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', amount: 2 });
    s = act(s, c, { type: 'avoidDamage', heroId: H, choice: { kind: 'take' } });
    expect(heroOf(s, 'alpha').hp).toBe(8);
    expect(heroOf(s, 'alpha').items?.find((i) => i.id === 'chainmail')?.state).toBe('spent');
  });

  it('a shield that absorbs everything ends the damage; the window opens without cards to avoid with', () => {
    const { c, s: s0 } = game({ items: ['chainmail', 'buckler'] });
    const h = heroOf(s0, 'alpha');
    h.hand = [];
    let s = act(s0, c, { type: 'endTurn', heroId: H });
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', amount: 3 });
    rejects(s, c, { type: 'avoidDamage', heroId: H, choice: { kind: 'loseHand', cardId: 'alpha.c3' } });
    heroOf(s, 'alpha').shields.push({ value: 1, source: 'test', until: 'round' });
    s.pending = { kind: 'avoidDamage', heroId: H, amount: 2, source: 'monster:rat:1' };
    const task = s.queue?.[0];
    if (task?.t === 'damage') {
      task.amount = 2;
      task.attack!.shield = 1;
    }
    s = act(s, c, { type: 'useItem', heroId: H, itemId: 'chainmail' });
    s = act(s, c, { type: 'useItem', heroId: H, itemId: 'buckler' });
    expect(s.pending?.kind).not.toBe('avoidDamage');
    expect(eventsOf(s.log, 'damaged')).toEqual([]);
    expect(heroOf(s, 'alpha').hp).toBe(10);
  });

  it('a shield item does not help against trap damage', () => {
    const { c, s: s0 } = game({ items: ['chainmail'], deck: IDLE, room: { traps: [{ hex: [0, 1], damage: 3 }] } });
    let s = act(s0, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c1', half: 'bottom' });
    s = act(s, c, { type: 'resolveStep', choice: { path: [[0, 1]] } });
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', source: 'trap' });
    expect(rejects(s, c, { type: 'useItem', heroId: H, itemId: 'chainmail' })).toBe('a shield only helps against attack damage');
  });

  it('Шкіряний шолом: a before-attacked window before the modifier; used = disadvantage, passed = normal draw', () => {
    const used = game({ items: ['leather-helmet', 'dagger'] });
    let s = act(used.s, used.c, { type: 'endTurn', heroId: H });
    expect(s.pending).toEqual({ kind: 'beforeAttacked', heroId: H, attackerId: 'monster:rat:1' });
    expect(eventsOf(s.log, 'attacked')).toEqual([]);
    expect(legalActions(s, used.c)).toEqual([
      { type: 'passReaction', heroId: H },
      { type: 'useItem', heroId: H, itemId: 'leather-helmet' },
    ]);
    expect(reactionPrompts(s, used.c)).toMatchObject([{ itemId: 'leather-helmet', window: 'beforeAttacked', disadvantage: true }]);
    s = act(s, used.c, { type: 'useItem', heroId: H, itemId: 'leather-helmet' });
    expect(eventsOf(s.log, 'itemReaction')[0]).toMatchObject({ window: 'beforeAttacked', disadvantage: true, attackerId: 'monster:rat:1' });
    expect(eventsOf(s.log, 'attacked')[0]?.modifiers).toHaveLength(2);

    const passed = game({ items: ['leather-helmet'] });
    let t = act(passed.s, passed.c, { type: 'endTurn', heroId: H });
    t = act(t, passed.c, { type: 'passReaction', heroId: H });
    expect(eventsOf(t.log, 'attacked')[0]?.modifiers).toHaveLength(1);
    expect(heroOf(t, 'alpha').items).toEqual([{ id: 'leather-helmet', state: 'ready' }]);
  });

  it('no before-attacked window when the attack already has disadvantage or the hero is stunned', () => {
    const { c, s: s0 } = game({ items: ['leather-helmet'] });
    heroOf(s0, 'alpha').conditions.stun = {};
    const s = endTurn(s0, c, 'alpha');
    expect(s.pending?.kind).not.toBe('beforeAttacked');
    expect(eventsOf(s.log, 'attacked')).toHaveLength(1);
  });
});

describe('breakable and movable obstacles', () => {
  const room: Partial<RoomDef> = {
    obstacles: [{ hex: [1, 2], breakable: { hp: 3 } }, { hex: [0, 1], movable: true }],
    doors: [{ hex: [6, 2], to: 'r2', breakable: { hp: 2 } }],
  };

  it('setup marks them; interactiveObstacles lists them', () => {
    const { s } = game({ noRat: true, deck: IDLE, room });
    expect(s.board.tiles['1,2']).toMatchObject({ obstacle: true, breakable: { hp: 3, maxHp: 3 } });
    expect(s.board.tiles['6,2']).toMatchObject({ obstacle: true, door: { open: false, breakable: { hp: 2, maxHp: 2 } } });
    expect(interactiveObstacles(s).map((o) => o.hex)).toEqual(expect.arrayContaining([[1, 2], [0, 1], [6, 2]]));
  });

  it('a hero attacks a breakable obstacle without a modifier draw; at 0 hp it is gone', () => {
    const { c, s: s0 } = game({ noRat: true, deck: IDLE, room, secondRoom: { spawns: [] } });
    let s = act(s0, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c1', half: 'top' });
    expect(legalActions(s, c)).toContainEqual({ type: 'resolveStep', choice: { obstacles: [[1, 2]] } });
    rejects(s, c, { type: 'resolveStep', choice: { obstacles: [[6, 2]] } });
    const before = heroOf(s, 'alpha').modifierDeck.draw.length;
    s = act(s, c, { type: 'resolveStep', choice: { obstacles: [[1, 2]] } });
    expect(eventsOf(s.log, 'obstacleDamaged')).toEqual([{ type: 'obstacleDamaged', hex: [1, 2], damage: 2, hp: 1, byId: H }]);
    expect(heroOf(s, 'alpha').modifierDeck.draw.length).toBe(before);
    heroOf(s, 'alpha').hex = [5, 2];
    s = act(s, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c2', half: 'bottom', basic: true });
    s = act(s, c, { type: 'skipStep' });
    // A breakable door: blocks the move, an attack breaks it and the room opens.
    const t0 = structuredClone(s0);
    heroOf(t0, 'alpha').hex = [5, 2];
    let t = act(t0, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c1', half: 'bottom' });
    rejects(t, c, { type: 'resolveStep', choice: { path: [[6, 2]] } });
    t = act(t, c, { type: 'skipStep' });
    t = act(t, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c2', half: 'top' });
    t = act(t, c, { type: 'resolveStep', choice: { obstacles: [[6, 2]] } });
    expect(eventsOf(t.log, 'obstacleDestroyed')).toEqual([{ type: 'obstacleDestroyed', hex: [6, 2], byId: H, door: true }]);
    expect(eventsOf(t.log, 'roomRevealed').map((e) => e.roomId)).toContain('r2');
    expect(t.board.tiles['6,2']?.obstacle).toBeUndefined();
    expect(t.board.tiles['6,2']?.door?.open).toBe(true);
  });

  it('an adjacent hero spends a move step to push a movable obstacle or door aside', () => {
    const r: Partial<RoomDef> = { obstacles: [{ hex: [0, 1], movable: true }], doors: [{ hex: [6, 2], to: 'r2', movable: true }] };
    const { c, s: s0 } = game({ noRat: true, deck: IDLE, room: r, secondRoom: { spawns: [] } });
    let s = act(s0, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c1', half: 'bottom', basic: true });
    expect(legalActions(s, c)).toContainEqual({ type: 'resolveStep', choice: { moveObstacle: [0, 1] } });
    rejects(s, c, { type: 'resolveStep', choice: { moveObstacle: [6, 2] } });
    rejects(s, c, { type: 'resolveStep', choice: { moveObstacle: [0, 1], path: [[1, 2]] } });
    s = act(s, c, { type: 'resolveStep', choice: { moveObstacle: [0, 1] } });
    expect(eventsOf(s.log, 'obstacleMoved')).toEqual([{ type: 'obstacleMoved', hex: [0, 1], byId: H }]);
    expect(s.board.tiles['0,1']?.obstacle).toBeUndefined();

    const t0 = structuredClone(s0);
    heroOf(t0, 'alpha').hex = [5, 2];
    heroOf(t0, 'alpha').conditions.immobilize = {};
    let t = act(t0, c, { type: 'startHalf', heroId: H, cardId: 'alpha.c1', half: 'bottom' });
    rejects(t, c, { type: 'resolveStep', choice: { moveObstacle: [6, 2] } });
    delete heroOf(t, 'alpha').conditions.immobilize;
    t = act(t, c, { type: 'resolveStep', choice: { moveObstacle: [6, 2] } });
    expect(eventsOf(t.log, 'obstacleMoved')[0]).toMatchObject({ hex: [6, 2], door: true });
    expect(t.board.revealedRooms).toContain('r2');
  });
});

