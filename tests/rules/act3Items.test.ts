// Act III items (docs/design/act3.md «Нагороди й предмети»): one test per new effect.
import { describe, expect, it } from 'vitest';
import { shopStock, type CampaignContent, type CampaignState } from '../../src/rules/campaign';
import type { MonsterCard } from '../../src/rules/content';
import { createGame } from '../../src/rules/engine';
import { attackSpecFor, runRetaliate, withRangeGrants } from '../../src/rules/effects/attack';
import type { Ctx } from '../../src/rules/effects/context';
import { hexKey } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { buildMoveModel } from '../../src/rules/path';
import type { GameState } from '../../src/rules/state';
import type { Variants } from '../../src/rules/variants';
import { act, eventsOf, fillerCards, heroOf, makeContent, monsterType, rejects, selectAll, setupFor, stackModifiers } from '../helpers/engineFixtures';
import { forkGame, forkSetup } from './fork/fixtures';

const items = loadContent().items;
const A = 'hero:alpha';
const IDLE: MonsterCard[] = [{ id: 'idle.50', initiative: 50, steps: [] }];

/** alpha's own turn (initiative 10 vs the idle rat's 50), carrying `carried`. */
function ownTurn(carried: string[]) {
  const c = makeContent({ heroes: { alpha: fillerCards('alpha') }, decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [5, 2] }] });
  c.items = items;
  const setup = setupFor(c, ['alpha']);
  setup.heroes[0]!.items = carried;
  const s = selectAll(createGame(setup, c), c, { alpha: ['alpha.c1', 'alpha.c2'] });
  expect(s.pending?.kind).toBe('heroTurn');
  return { c, s };
}

const use = (s: GameState, c: ReturnType<typeof ownTurn>['c'], itemId: string) => act(s, c, { type: 'useItem', heroId: A, itemId });
const ctxOf = (s: GameState, c: ReturnType<typeof ownTurn>['c']): Ctx => ({ s, c, ev: [], out: [] });

/** Both heroes rolled initiative dice; the items open the window. */
function rolled(carried: string[], seed = 1) {
  const c = makeContent({ heroes: { alpha: fillerCards('alpha'), beta: fillerCards('beta') }, decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [3, 2] }] });
  c.items = items;
  const setup = forkSetup(c, { initiativeDie: true, diceGear: true }, ['alpha', 'beta'], seed);
  setup.heroes[0]!.items = carried;
  const s = selectAll(createGame(setup, c), c, { alpha: ['alpha.c3', 'alpha.c1'], beta: ['beta.c4', 'beta.c1'] });
  expect(s.pending?.kind).toBe('initiativeItems');
  return { c, s };
}

describe('Act III items', () => {
  it('all ten are in the catalog with the prices and sources of act3.md', () => {
    const row = (id: string) => [items[id]?.slot, items[id]?.price, items[id]?.use, items[id]?.source?.type];
    expect(row('heron-tea')).toEqual(['small', 15, 'lost', 'shop']);
    expect(row('marsh-boots')).toEqual(['legs', 25, 'spent', 'shop']);
    expect(row('firefly-jar')).toEqual(['small', 25, 'spent', 'shop']);
    expect(row('bell-clapper')).toEqual(['small', 30, 'lost', 'gift']);
    expect(row('mist-pearl')).toEqual(['small', 30, 'spent', 'shop']);
    expect(row('queen-veil')).toEqual(['body', 45, 'spent', 'boss']);
    expect(row('gear-shield')).toEqual(['hand', 30, 'spent', 'shop']);
    expect(row('prism-lens')).toEqual(['small', 30, 'spent', 'shop']);
    expect(row('crystal-die')).toEqual(['small', 35, 'spent', 'gift']);
    expect(row('glass-shield')).toEqual(['hand', 45, 'spent', 'boss']);
  });

  it('Чай Чаплі and Болотяні чоботи are sold only once the heron is saved', () => {
    const c = loadContent() as unknown as CampaignContent;
    const won = { completed: ['s1', 's12'] } as unknown as CampaignState;
    const ids = (s: CampaignState) => shopStock(c, s).map((it) => it.id);
    expect(ids(won)).not.toContain('heron-tea');
    expect(ids({ ...won, flags: ['heron.saved'] })).toEqual(expect.arrayContaining(['heron-tea', 'marsh-boots']));
  });

  it('curePoison: Чай Чаплі removes the poison and still heals 3', () => {
    const { c, s } = ownTurn(['heron-tea']);
    const h = heroOf(s, 'alpha');
    h.hp -= 4;
    h.conditions.poison = {};
    const t = use(s, c, 'heron-tea');
    expect(heroOf(t, 'alpha').conditions.poison).toBeUndefined();
    expect(heroOf(t, 'alpha').hp).toBe(h.hp + 3);
  });

  it('ignoreTerrain: this turn difficult terrain costs 1 to enter', () => {
    const { c, s } = ownTurn(['marsh-boots']);
    const next = [heroOf(s, 'alpha').hex[0] + 1, heroOf(s, 'alpha').hex[1]] as [number, number];
    s.board.tiles[hexKey(next)]!.terrain = 'difficult';
    expect(buildMoveModel(s, { figureId: A }).enterCost(hexKey(next))).toBe(2);
    const t = use(s, c, 'marsh-boots');
    expect(buildMoveModel(t, { figureId: A }).enterCost(hexKey(next))).toBe(1);
    heroOf(t, 'alpha').turnCount++; // its next turn
    expect(buildMoveModel(t, { figureId: A }).enterCost(hexKey(next))).toBe(2);
  });

  it('firstRangedAgainstDisadvantage: the next ranged attack on the hero has disadvantage, a melee one does not', () => {
    const { c, s } = ownTurn(['queen-veil']);
    const t = use(s, c, 'queen-veil');
    const ctx = ctxOf(t, c);
    const rat = Object.values(t.figures).find((f) => f.kind === 'monster')!;
    const h = heroOf(t, 'alpha');
    expect(attackSpecFor(ctx, rat, h, { type: 'attack', value: 2 }).disadvantage).toBe(false);
    expect(attackSpecFor(ctx, rat, h, { type: 'attack', value: 2, range: 5 }).disadvantage).toBe(true);
  });

  it('nextRangedRangeBonus: Призма gives the next ranged attack range +1 (★ +2) and infuses Light', () => {
    const { c, s } = ownTurn(['prism-lens+']);
    const t = use(s, c, 'prism-lens+');
    expect(t.elements?.light ?? t.elements).toBeTruthy();
    const step = withRangeGrants(ctxOf(t, c), heroOf(t, 'alpha'), { type: 'attack', value: 2, range: 3 });
    expect(step.range).toBe(5);
  });

  it('reflectRanged: Скляний щит answers a ranged attacker, not an adjacent one, for the scenario', () => {
    const { c, s } = ownTurn(['glass-shield']);
    const t = use(s, c, 'glass-shield');
    const h = heroOf(t, 'alpha');
    expect(h.shields).toEqual(expect.arrayContaining([expect.objectContaining({ value: 1, until: 'scenario' })]));
    expect(h.retaliates).toEqual([expect.objectContaining({ value: 1, until: 'scenario', rangedOnly: true })]);
    const rat = Object.values(t.figures).find((f) => f.kind === 'monster')!;
    const far = ctxOf(t, c);
    runRetaliate(far, rat.id, A);
    expect(far.ev.filter((e) => e.type === 'retaliated')).toHaveLength(1);
    rat.hex = [h.hex[0] + 1, h.hex[1]];
    const near = ctxOf(t, c);
    runRetaliate(near, rat.id, A);
    expect(near.ev.filter((e) => e.type === 'retaliated')).toHaveLength(0);
  });

  it('dieMirror: Кришталева кістка turns the own die into 13 − x; ★ works twice', () => {
    const { c, s } = rolled(['crystal-die+']);
    const before = heroOf(s, 'alpha').initiativeRoll!;
    const s1 = use(s, c, 'crystal-die+');
    expect(heroOf(s1, 'alpha').initiativeRoll).toBe(13 - before);
    expect(heroOf(s1, 'alpha').items).toEqual([{ id: 'crystal-die+', state: 'ready' }]);
    const s2 = use(s1, c, 'crystal-die+');
    expect(heroOf(s2, 'alpha').initiativeRoll).toBe(before);
    expect(heroOf(s2, 'alpha').items).toEqual([{ id: 'crystal-die+', state: 'spent' }]);
  });

  it('partyInitiativeReroll: Дзвоник rerolls every hero’s die, keeps the lower, and is lost', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { c, s } = rolled(['bell-clapper'], seed);
      const was = { a: heroOf(s, 'alpha').initiativeRoll!, b: heroOf(s, 'beta').initiativeRoll! };
      const t = use(s, c, 'bell-clapper');
      expect(heroOf(t, 'alpha').initiativeRoll).toBeLessThanOrEqual(was.a);
      expect(heroOf(t, 'beta').initiativeRoll).toBeLessThanOrEqual(was.b);
      expect(heroOf(t, 'alpha').items).toEqual([{ id: 'bell-clapper', state: 'lost' }]);
    }
  });

  it('dodgeRerollBest: Перлина туману helps only the dodge — 2 d12, ★ 3', () => {
    const c = makeContent({
      heroes: { alpha: fillerCards('alpha') },
      monsters: [monsterType('brute', 'tbrute', { normal: { hp: 30, move: 1, attack: 6 } })],
      decks: [{ id: 'tbrute', cards: [{ id: 'tbrute.05', initiative: 5, steps: [{ type: 'move', value: 0 }, { type: 'attack', value: 0 }] }] }],
      spawns: [{ monster: 'brute', hex: [1, 1] }],
      startHexes: [[0, 2]],
    });
    c.items = items;
    for (const [id, n] of [['mist-pearl', 2], ['mist-pearl+', 3]] as const) {
      const variants: Partial<Variants> = { dodgeDie: true, diceGear: true };
      const s0 = forkGame(c, variants, ['alpha']);
      heroOf(s0, 'alpha').items = [{ id, state: 'ready' }];
      stackModifiers(s0, 'monsters', Array<string>(10).fill('+0'));
      const s = selectAll(s0, c, { alpha: ['alpha.c1', 'alpha.c2'] });
      expect(s.pending).toMatchObject({ kind: 'avoidDamage', heroId: A });
      expect(rejects(s, c, { type: 'useItem', heroId: A, itemId: id })).toBeTruthy();
      const t = act(s, c, { type: 'dodge', heroId: A, pay: { kind: 'card', cardId: 'alpha.c3' }, itemId: id });
      expect(eventsOf(t.log, 'dodgeRolled').at(-1)!.rolls).toHaveLength(n);
    }
  });
});
