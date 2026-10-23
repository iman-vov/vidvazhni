import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterStats } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import { applyModifier, BASE_MODIFIER_CARDS, drawForAttack } from '../../src/rules/modifiers';
import type { GameState, MonsterState } from '../../src/rules/state';
import {
  act,
  card,
  eventsOf,
  fillerCards,
  heroOf,
  makeContent,
  monsterType,
  newGame,
  playHalf,
  rejects,
  selectAll,
  stackModifiers,
} from '../helpers/engineFixtures';

const CARDS: HeroCard[] = [
  card('x.melee', 10, [{ type: 'attack', value: 3 }], [{ type: 'move', value: 2 }]),
  card('x.ranged', 20, [{ type: 'attack', value: 2, range: 3 }], [{ type: 'move', value: 2 }]),
  card('x.pierce', 30, [{ type: 'attack', value: 3, pierce: 2 }], [{ type: 'move', value: 2 }]),
  card('x.multi', 40, [{ type: 'attack', value: 2, range: 3, targets: 2 }], [{ type: 'move', value: 2 }]),
  card('x.push', 50, [{ type: 'attack', value: 1, push: 2 }], [{ type: 'move', value: 2 }]),
  card('x.pull', 55, [{ type: 'attack', value: 1, range: 3, pull: 1 }], [{ type: 'move', value: 2 }]),
  card('x.cond', 60, [{ type: 'attack', value: 1, conditions: ['poison', 'immobilize'] }], [{ type: 'move', value: 2 }]),
  card('x.curse', 65, [{ type: 'attack', value: 1, curse: true }], [{ type: 'bless', target: 'self' }]),
  card('x.bonus', 70, [{ type: 'attack', value: 2, bonuses: [{ if: 'allyAdjacentToTarget', attack: 2 }] }], [{ type: 'move', value: 2 }]),
  card('x.adv', 75, [{ type: 'attack', value: 2, advantage: true }], [{ type: 'move', value: 2 }]),
  card('x.arc', 80, [{ type: 'attack', value: 2, area: { shape: 'arc', size: 3 } }], [{ type: 'move', value: 2 }]),
  card('x.tri', 85, [{ type: 'attack', value: 2, range: 3, area: { shape: 'triangle', size: 3 } }], [{ type: 'move', value: 2 }]),
  card('x.eagle', 90, [{ type: 'active', uses: 2, on: 'rangedAttack', grant: { advantage: true } }], [{ type: 'move', value: 2 }]),
];
CARDS[12]!.top.active = true;

/** Monsters that act last and do nothing, so attacks are tested in isolation. */
const IDLE_DECK = { id: 'tmelee', cards: [{ id: 'idle.99', initiative: 99, steps: [] }] };

interface Opts {
  rats?: { hex: Hex; rank?: 'normal' | 'elite' }[];
  stats?: Partial<MonsterStats>;
  heroes?: string[];
}

function game(o: Opts = {}): { content: ReturnType<typeof makeContent>; s: GameState } {
  const content = makeContent({
    heroes: { alpha: CARDS, beta: fillerCards('beta') },
    monsters: [monsterType('rat', 'tmelee', { normal: { hp: 8, move: 2, attack: 2, ...o.stats }, elite: { hp: 10, move: 2, attack: 3, ...o.stats } })],
    decks: [IDLE_DECK],
    spawns: (o.rats ?? [{ hex: [1, 2] }]).map((r) => ({ monster: 'rat', hex: r.hex, rank: r.rank ?? 'normal' })),
  });
  return { content, s: newGame(content, o.heroes ?? ['alpha']) };
}

/** Selects `cardId` + a filler and starts its top half. */
function attackWith(o: Opts, cardId: string, modifiers: string[], prep?: (s: GameState) => void) {
  const { content, s: s0 } = game(o);
  stackModifiers(s0, 'alpha', modifiers);
  prep?.(s0);
  const other = cardId === 'x.melee' ? 'x.ranged' : 'x.melee';
  const picks: Record<string, [string, string]> = { alpha: [cardId, other] };
  if (o.heroes?.includes('beta')) picks.beta = ['beta.c9', 'beta.c10'];
  let s = selectAll(s0, content, picks);
  s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId, half: 'top' });
  return { content, s };
}

const rat = (s: GameState, n = 1) => s.figures[`monster:rat:${n}`] as MonsterState | undefined;

describe('modifier deck', () => {
  it('has 20 cards: 6×+0, 5×+1, 5×−1, +2, −2, ×2, miss', () => {
    const count = (c: string) => BASE_MODIFIER_CARDS.filter((x) => x === c).length;
    expect(BASE_MODIFIER_CARDS).toHaveLength(20);
    expect([count('+0'), count('+1'), count('-1'), count('+2'), count('-2'), count('x2'), count('miss')]).toEqual([6, 5, 5, 1, 1, 1, 1]);
    expect([applyModifier('+2', 3), applyModifier('-2', 1), applyModifier('x2', 3), applyModifier('miss', 5)]).toEqual([5, 0, 6, 0]);
    expect([applyModifier('bless', 3), applyModifier('curse', 3)]).toEqual([6, 0]);
  });

  it('advantage takes the better of two, disadvantage the worse; both together cancel', () => {
    const rng = { seed: 1 };
    const deck = () => ({ draw: ['-1', '+2', '+0'], discard: [], needsShuffle: false });
    expect(drawForAttack(rng, deck(), 3, true, false)).toEqual({ drawn: ['-1', '+2'], chosen: '+2' });
    expect(drawForAttack(rng, deck(), 3, false, true)).toEqual({ drawn: ['-1', '+2'], chosen: '-1' });
    expect(drawForAttack(rng, deck(), 3, true, true)).toEqual({ drawn: ['-1'], chosen: '-1' });
  });
});

describe('attack', () => {
  it('base + modifier, damage dealt; ×2 marks the deck for shuffling', () => {
    let { content, s } = attackWith({}, 'x.melee', ['+1']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(rat(s)?.hp).toBe(4);
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 3, modifiers: ['+1'], chosen: '+1', shield: 0, damage: 4 });
    ({ content, s } = attackWith({}, 'x.melee', ['x2']));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(rat(s)?.hp).toBe(2);
    expect(heroOf(s, 'alpha').modifierDeck.needsShuffle).toBe(true);
  });

  it('a monster dies at 0 hp and leaves the board', () => {
    let { content, s } = attackWith({ stats: { hp: 3 } }, 'x.melee', ['+0']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(rat(s)).toBeUndefined();
    expect(eventsOf(s.log, 'figureDied')).toEqual([{ type: 'figureDied', figureId: 'monster:rat:1' }]);
  });

  it('a ranged attack against an adjacent target has disadvantage', () => {
    let { content, s } = attackWith({}, 'x.ranged', ['+2', '-1']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ modifiers: ['+2', '-1'], chosen: '-1', damage: 1 });
  });

  it('advantage from the card; strengthen gives advantage, muddle disadvantage', () => {
    let { content, s } = attackWith({}, 'x.adv', ['-1', '+2']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ chosen: '+2', damage: 4 });
    ({ content, s } = attackWith({}, 'x.melee', ['-1', '+2'], (g) => (heroOf(g, 'alpha').conditions.strengthen = { expiresAfterTurn: 1 })));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ chosen: '+2' });
    ({ content, s } = attackWith({}, 'x.melee', ['+2', '-1'], (g) => (heroOf(g, 'alpha').conditions.muddle = { expiresAfterTurn: 1 })));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ chosen: '-1' });
  });

  it('shield reduces damage; pierce ignores that much shield', () => {
    let { content, s } = attackWith({ stats: { shield: 2 } }, 'x.melee', ['+0']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ shield: 2, damage: 1 });
    ({ content, s } = attackWith({ stats: { shield: 2 } }, 'x.pierce', ['+0']));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ shield: 2, damage: 3 });
  });

  it('poison adds 1 to every attack against the target, before the modifier', () => {
    let { content, s } = attackWith({}, 'x.melee', ['x2'], (g) => (rat(g)!.conditions.poison = {}));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 3, chosen: 'x2', damage: 8 });
    expect(rat(s)).toBeUndefined();
  });

  it('several targets: each gets its own modifier; more targets than allowed is rejected', () => {
    const o = { rats: [{ hex: [2, 1] as Hex }, { hex: [2, 3] as Hex }, { hex: [3, 2] as Hex }] };
    let { content, s } = attackWith(o, 'x.multi', ['+1', '-1']);
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1', 'monster:rat:2', 'monster:rat:3'] } });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1', 'monster:rat:2'] } });
    expect([rat(s, 1)?.hp, rat(s, 2)?.hp, rat(s, 3)?.hp]).toEqual([5, 7, 8]);
  });

  it('targets must be in range, in sight and visible; a disarmed hero cannot attack', () => {
    let { content, s } = attackWith({ rats: [{ hex: [4, 2] }] }, 'x.ranged', []);
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    ({ content, s } = attackWith({}, 'x.melee', [], (g) => (rat(g)!.conditions.invisible = { expiresAfterTurn: 1 })));
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    ({ content, s } = attackWith({}, 'x.melee', [], (g) => (heroOf(g, 'alpha').conditions.disarm = { expiresAfterTurn: 1 })));
    expect(rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } })).toBe('disarmed');
  });

  it('an attack across a thin wall needs line of sight', () => {
    const content = makeContent({
      heroes: { alpha: CARDS },
      spawns: [{ monster: 'rat', hex: [3, 2] }],
      room: { walls: [[[1, 2], [2, 2]], [[1, 2], [2, 1]], [[1, 3], [2, 2]], [[1, 1], [2, 1]], [[1, 3], [2, 3]], [[1, 2], [1, 3]], [[1, 2], [1, 1]]] },
    });
    let s = newGame(content, ['alpha']);
    s.figures['hero:alpha']!.hex = [1, 2];
    s = selectAll(s, content, { alpha: ['x.ranged', 'x.melee'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'x.ranged', half: 'top' });
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
  });

  it('conditions land on the target after the damage', () => {
    let { content, s } = attackWith({}, 'x.cond', ['+0']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(rat(s)?.conditions).toEqual({ poison: {}, immobilize: { expiresAfterTurn: 1 } });
  });

  it('push moves the target away along the chosen path (or a default one); pull draws it closer', () => {
    let { content, s } = attackWith({}, 'x.push', ['+0']);
    rejects(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], pushPaths: { 'monster:rat:1': [[1, 1]] } } });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], pushPaths: { 'monster:rat:1': [[2, 2], [3, 2]] } } });
    expect(rat(s)?.hex).toEqual([3, 2]);
    expect(eventsOf(s.log, 'pushed')).toEqual([{ type: 'pushed', figureId: 'monster:rat:1', path: [[2, 2], [3, 2]] }]);
    ({ content, s } = attackWith({}, 'x.push', ['+0']));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(rat(s)!.hex[0] + rat(s)!.hex[1]).toBeGreaterThanOrEqual(4);
    ({ content, s } = attackWith({ rats: [{ hex: [3, 2] }] }, 'x.pull', ['+0']));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'], pushPaths: { 'monster:rat:1': [[2, 2]] } } });
    expect(rat(s)?.hex).toEqual([2, 2]);
  });

  it('a push into a trap triggers it', () => {
    const content = makeContent({ heroes: { alpha: CARDS }, decks: [IDLE_DECK], spawns: [{ monster: 'rat', hex: [1, 2] }], room: { traps: [{ hex: [2, 2] }] } });
    let s = newGame(content, ['alpha']);
    stackModifiers(s, 'alpha', ['+0']);
    s = selectAll(s, content, { alpha: ['x.push', 'x.melee'] });
    s = playHalf(s, content, 'alpha', 'x.push', 'top', [{ targets: ['monster:rat:1'], pushPaths: { 'monster:rat:1': [[2, 2], [3, 2]] } }]);
    expect(rat(s)).toMatchObject({ hex: [3, 2], hp: 5 - 1 - 3 });
  });

  it('curse goes into the target deck and leaves it when drawn (as a miss); bless gives ×2 and leaves', () => {
    let { content, s } = attackWith({}, 'x.curse', ['+0']);
    s.monsterDeck.draw = ['+1', '+1'];
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(s.monsterDeck.draw.filter((c) => c === 'curse')).toHaveLength(1);
    const g = game();
    let t = g.s;
    stackModifiers(t, 'alpha', ['bless']);
    t = selectAll(t, g.content, { alpha: ['x.melee', 'x.curse'] });
    t = playHalf(t, g.content, 'alpha', 'x.melee', 'top', [{ targets: ['monster:rat:1'] }]);
    expect(eventsOf(t.log, 'attacked')[0]).toMatchObject({ chosen: 'bless', damage: 6 });
    expect([...heroOf(t, 'alpha').modifierDeck.draw, ...heroOf(t, 'alpha').modifierDeck.discard]).not.toContain('bless');
    t = playHalf(t, g.content, 'alpha', 'x.curse', 'bottom', [{}]);
    expect(heroOf(t, 'alpha').modifierDeck.draw.filter((c) => c === 'bless')).toHaveLength(1);
  });

  it('conditional bonus: +2 when an ally stands next to the target', () => {
    let { content, s } = attackWith({ heroes: ['alpha', 'beta'] }, 'x.bonus', ['+0', '+0'], (st) => (heroOf(st, 'beta').hex = [0, 4]));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 2 });
    const g = attackWith({ heroes: ['alpha', 'beta'] }, 'x.bonus', ['+0'], (st) => (heroOf(st, 'beta').hex = [1, 3]));
    s = act(g.s, g.content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(eventsOf(s.log, 'attacked')[0]).toMatchObject({ base: 4 });
  });

  it('retaliate hits back an attacker within its range, after the attack', () => {
    let { content, s } = attackWith({ stats: { retaliate: 2 } }, 'x.melee', ['+0']);
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(s.pending).toEqual({ kind: 'avoidDamage', heroId: 'hero:alpha', amount: 2, source: 'monster:rat:1' });
    s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(s, 'alpha').hp).toBe(8);
    expect(eventsOf(s.log, 'retaliated')).toEqual([{ type: 'retaliated', figureId: 'monster:rat:1', targetId: 'hero:alpha', damage: 2 }]);
    ({ content, s } = attackWith({ stats: { retaliate: 2 }, rats: [{ hex: [2, 2] }] }, 'x.ranged', ['+0']));
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(heroOf(s, 'alpha').hp).toBe(10);
  });

  it('area: an arc hits every enemy in it and no ally; a ranged triangle is placed within range', () => {
    const o = { heroes: ['alpha', 'beta'], rats: [{ hex: [1, 2] as Hex }, { hex: [1, 1] as Hex }, { hex: [3, 2] as Hex }] };
    let { content, s } = attackWith(o, 'x.arc', ['+0', '+0', '+0'], (g) => (heroOf(g, 'beta').hex = [0, 1]));
    s = act(s, content, { type: 'resolveStep', choice: { direction: 0 } });
    expect([rat(s, 1)?.hp, rat(s, 2)?.hp, rat(s, 3)?.hp, heroOf(s, 'beta').hp]).toEqual([6, 6, 8, 10]);
    ({ content, s } = attackWith({ rats: [{ hex: [3, 2] }, { hex: [4, 2] }, { hex: [6, 2] }] }, 'x.tri', ['+0', '+0']));
    rejects(s, content, { type: 'resolveStep', choice: { hex: [6, 2], direction: 0 } });
    s = act(s, content, { type: 'resolveStep', choice: { hex: [3, 2], direction: 0 } });
    expect([rat(s, 1)?.hp, rat(s, 2)?.hp, rat(s, 3)?.hp]).toEqual([6, 6, 8]);
  });

  it('active card «next 2 ranged attacks with advantage» is used up, then discarded', () => {
    const { content, s: s0 } = game({ rats: [{ hex: [3, 2] }] });
    stackModifiers(s0, 'alpha', ['-1', '+1', '-1', '+1']);
    let s = selectAll(s0, content, { alpha: ['x.eagle', 'x.ranged'] });
    s = playHalf(s, content, 'alpha', 'x.eagle', 'top', [{}]);
    expect(heroOf(s, 'alpha').active).toEqual([{ cardId: 'x.eagle', half: 'top', usesLeft: 2, lossOnEnd: false }]);
    s = playHalf(s, content, 'alpha', 'x.ranged', 'bottom', [null]);
    // Next round: two ranged attacks.
    s = act(s, content, { type: 'endTurn', heroId: 'hero:alpha' });
    while (s.pending?.kind === 'avoidDamage') s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(s, 'alpha').active).toHaveLength(1);
    expect(s.pending?.kind).toBe('selectCards');
    s = selectAll(s, content, { alpha: ['x.multi', 'x.pull'] });
    s = playHalf(s, content, 'alpha', 'x.multi', 'top', [{ targets: [Object.values(s.figures).find((f) => f.kind === 'monster')!.id] }]);
    expect(eventsOf(s.log, 'attacked').at(-1)).toMatchObject({ modifiers: ['-1', '+1'], chosen: '+1' });
    expect(heroOf(s, 'alpha').active[0]?.usesLeft).toBe(1);
  });
});
