import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../../src/rules/content';
import { dodgeChances, dodgeResult } from '../../../src/rules/defense';
import type { Hex } from '../../../src/rules/hex';
import { loadContent } from '../../../src/rules/load';
import { defenseOptions, legalActions } from '../../../src/rules/queries';
import type { GameState } from '../../../src/rules/state';
import type { Variants } from '../../../src/rules/variants';
import { act, eventsOf, fillerCards, heroOf, makeContent, monsterType, rejects, selectAll, stackModifiers } from '../../helpers/engineFixtures';
import { forkGame } from './fixtures';

const BRUTE: MonsterCard[] = [{ id: 'tbrute.05', initiative: 5, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }];
const A = 'hero:alpha';
const B = 'hero:beta';
const ON: Partial<Variants> = { dodgeDie: true, coverAlly: true };

/** The brute (initiative 5, attack 6) hits alpha at the start of round 1; beta stands next to alpha. */
function attacked(o: { variants?: Partial<Variants>; items?: string[]; startHexes?: Hex[]; poison?: boolean } = {}) {
  const c = makeContent({
    heroes: { alpha: fillerCards('alpha'), beta: fillerCards('beta') },
    monsters: [monsterType('brute', 'tbrute', { normal: { hp: 30, move: 1, attack: 6 } })],
    decks: [{ id: 'tbrute', cards: BRUTE }],
    spawns: [{ monster: 'brute', hex: [1, 1] }],
    startHexes: o.startHexes ?? [[0, 2], [0, 3]],
  });
  c.items = loadContent().items;
  const s0 = forkGame(c, o.variants ?? ON, ['alpha', 'beta']);
  if (o.items) heroOf(s0, 'alpha').items = o.items.map((id) => ({ id, state: 'ready' as const }));
  stackModifiers(s0, 'monsters', Array<string>(10).fill('+0'));
  const s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
  return { c, s };
}

/** A copy of the state whose next d12 lands in `want`. */
function withRoll(s: GameState, c: ReturnType<typeof attacked>['c'], want: 'full' | 'half' | 'none'): GameState {
  for (let seed = 1; seed < 500; seed++) {
    const t = structuredClone(s);
    t.rng = { seed };
    const r = act(t, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    const ev = eventsOf(r.log, 'dodgeRolled').at(-1);
    if (ev?.result === want) return t;
  }
  throw new Error('no seed');
}

describe('«Ухилитися» (dodgeDie)', () => {
  it('the d12 table and the chances', () => {
    expect([1, 3, 4, 7, 8, 12].map(dodgeResult)).toEqual(['none', 'none', 'half', 'half', 'full', 'full']);
    const one = dodgeChances();
    expect(one.full).toBeCloseTo(5 / 12);
    expect(one.half).toBeCloseTo(4 / 12);
    expect(dodgeChances(2).none).toBeCloseTo(1 / 16);
  });

  it('a full dodge: the card goes to the discard (not lost) and no damage is taken', () => {
    const { c, s } = attacked();
    expect(s.pending).toMatchObject({ kind: 'avoidDamage', heroId: A, amount: 6 });
    const t = act(withRoll(s, c, 'full'), c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    const h = heroOf(t, 'alpha');
    expect(h.hp).toBe(10);
    expect(h.discard).toContain('alpha.c3');
    expect(h.lost).not.toContain('alpha.c3');
    expect(eventsOf(t.log, 'dodgeRolled')[0]).toMatchObject({ result: 'full', damageBefore: 6, damage: 0, pay: 'card' });
    expect(t.pending?.kind).not.toBe('avoidDamage');
  });

  it('a half dodge halves the damage (rounded down); the window stays and the attack cannot be dodged again', () => {
    const { c, s } = attacked();
    const t = act(withRoll(s, c, 'half'), c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    expect(t.pending).toMatchObject({ kind: 'avoidDamage', amount: 3 });
    expect(rejects(t, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c4' } })).toBe('already dodged this attack');
    expect(heroOf(act(t, c, { type: 'avoidDamage', heroId: A, choice: { kind: 'take' } }), 'alpha').hp).toBe(7);
  });

  it('a shield item after a half dodge keeps the halving', () => {
    const { c, s } = attacked({ items: ['chainmail'] });
    let t = act(withRoll(s, c, 'half'), c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    t = act(t, c, { type: 'useItem', heroId: A, itemId: 'chainmail' });
    expect(t.pending).toMatchObject({ kind: 'avoidDamage', amount: 2 }); // (6 − 1) / 2
  });

  it('pays with a Наснага charge when «Наснага» is on', () => {
    const { c, s } = attacked({ variants: { ...ON, momentum: true } });
    expect(rejects(s, c, { type: 'dodge', heroId: A, pay: { kind: 'momentum' } })).toBe('no Наснага charge');
    heroOf(s, 'alpha').momentum = 2;
    const t = act(s, c, { type: 'dodge', heroId: A, pay: { kind: 'momentum' } });
    expect(heroOf(t, 'alpha').momentum).toBe(1);
    expect(heroOf(t, 'alpha').hand).toHaveLength(heroOf(s, 'alpha').hand.length);
  });

  it('Щаслива кістка: two d12, the best is kept; the item is spent', () => {
    const { c, s } = attacked({ variants: { ...ON, diceGear: true }, items: ['lucky-bone', 'chainmail'] });
    expect(rejects(s, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' }, itemId: 'chainmail' })).toBe(
      'this item does not help the dodge',
    );
    const t = act(s, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' }, itemId: 'lucky-bone' });
    const ev = eventsOf(t.log, 'dodgeRolled')[0]!;
    expect(ev.rolls).toHaveLength(2);
    expect(ev.roll).toBe(Math.max(...ev.rolls));
    expect(heroOf(t, 'alpha').items?.find((i) => i.id === 'lucky-bone')?.state).toBe('spent');
  });

  it('no dodge while immobilized, against non-attack damage, or with the variant off', () => {
    const { c, s } = attacked();
    const im = structuredClone(s);
    heroOf(im, 'alpha').conditions.immobilize = {};
    expect(rejects(im, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } })).toBe('immobilized');
    const off = attacked({ variants: {} });
    expect(legalActions(off.s, off.c).some((a) => a.type === 'dodge' || a.type === 'coverAlly')).toBe(false);
    expect(legalActions(off.s, off.c)).toContainEqual({ type: 'avoidDamage', heroId: A, choice: { kind: 'loseHand', cardId: 'alpha.c3' } });
  });

  it('same seed, same roll (replayable)', () => {
    const { c, s } = attacked();
    const a = act(s, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    const b = act(s, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    expect(eventsOf(a.log, 'dodgeRolled')).toEqual(eventsOf(b.log, 'dodgeRolled'));
  });
});

describe('«Прикрий друга» (coverAlly)', () => {
  it('the adjacent ally takes the hit with their own shield and opens their own damage window', () => {
    const { c, s } = attacked();
    heroOf(s, 'beta').shields.push({ value: 2, source: 'test', until: 'round' });
    let t = act(s, c, { type: 'coverAlly', heroId: B, targetId: A });
    expect(eventsOf(t.log, 'allyCovered')).toEqual([
      { type: 'allyCovered', heroId: B, targetId: A, attackerId: 'monster:brute:1', damageBefore: 6, damage: 4 },
    ]);
    expect(t.pending).toMatchObject({ kind: 'avoidDamage', heroId: B, amount: 4 });
    expect(legalActions(t, c).some((a) => a.type === 'coverAlly')).toBe(false);
    t = act(t, c, { type: 'avoidDamage', heroId: B, choice: { kind: 'take' } });
    expect(heroOf(t, 'beta').hp).toBe(6);
    expect(heroOf(t, 'alpha').hp).toBe(10);
    expect(heroOf(t, 'beta').coverUsed).toBe(true);
  });

  it('only an adjacent ally, and not after a dodge', () => {
    const far = attacked({ startHexes: [[0, 2], [0, 5]] });
    expect(rejects(far.s, far.c, { type: 'coverAlly', heroId: B, targetId: A })).toBe('this hero cannot cover now');
    const { c, s } = attacked();
    const t = act(withRoll(s, c, 'half'), c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' } });
    expect(rejects(t, c, { type: 'coverAlly', heroId: B, targetId: A })).toBe('this hero cannot cover now');
  });

  it('defenseOptions: take first, dodge, cover decided by the ally, losing cards last as the fallback', () => {
    const { c, s } = attacked();
    const opts = defenseOptions(s, c);
    const kinds = opts.map((o) => o.kind);
    expect(kinds[0]).toBe('take');
    expect(kinds.at(-1)).toBe('loseCard');
    expect(kinds.indexOf('dodge')).toBeLessThan(kinds.indexOf('cover'));
    expect(opts.find((o) => o.kind === 'cover')).toMatchObject({ deciderId: B, targetId: A, damage: 6, after: 6 });
    expect(opts.find((o) => o.kind === 'dodge')).toMatchObject({ deciderId: A, halfDamage: 3 });
    expect(opts.filter((o) => o.kind === 'loseCard').every((o) => o.fallback && o.after === 0)).toBe(true);
  });
});
