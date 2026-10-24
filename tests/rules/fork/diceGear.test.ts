import { describe, expect, it } from 'vitest';
import type { HeroCard, MonsterCard } from '../../../src/rules/content';
import { shopStock, type CampaignContent, type CampaignState } from '../../../src/rules/campaign';
import { createGame } from '../../../src/rules/engine';
import { loadContent } from '../../../src/rules/load';
import { initiativePrompts, legalActions } from '../../../src/rules/queries';
import type { GameState } from '../../../src/rules/state';
import { BASE_RULES, FULL_FORK, type Variants } from '../../../src/rules/variants';
import { act, card, eventsOf, fillerCards, heroOf, makeContent, rejects, selectAll } from '../../helpers/engineFixtures';
import { forkSetup } from './fixtures';

const IDLE: MonsterCard[] = [{ id: 'idle.50', initiative: 50, steps: [] }];
const X_CARD: HeroCard = card('alpha.gamble', 15, [{ type: 'attack', value: 3, x: 1, range: 3 }], [{ type: 'move', value: 2 }]);
const DICE = { initiativeDie: true, diceGear: true, dieCards: true };

function game(items: { alpha?: string[]; beta?: string[] }, variants: Partial<Variants> = DICE, seed = 1) {
  const c = makeContent({ heroes: { alpha: [X_CARD, ...fillerCards('alpha', 9)], beta: fillerCards('beta') }, decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [3, 2] }] });
  c.items = loadContent().items;
  const setup = forkSetup(c, variants, ['alpha', 'beta'], seed);
  setup.heroes[0]!.items = items.alpha ?? [];
  setup.heroes[1]!.items = items.beta ?? [];
  return { c, s: createGame(setup, c) };
}

/** alpha leads 30 (c3), beta leads 40 (c4). */
function reveal(items: Parameters<typeof game>[0], variants: Partial<Variants> = DICE, seed = 1) {
  const { c, s } = game(items, variants, seed);
  return { c, s: selectAll(s, c, { alpha: ['alpha.c3', 'alpha.c1'], beta: ['beta.c4', 'beta.c1'] }) };
}

const pass = (s: GameState, c: ReturnType<typeof game>['c'], id: string) => act(s, c, { type: 'passReaction', heroId: `hero:${id}` });

describe('«Предмети кубика» (diceGear)', () => {
  it('the six dice items are in data/items.json with the prices from dice.md', () => {
    const items = loadContent().items;
    const row = (id: string) => [items[id]?.slot, items[id]?.price, items[id]?.use, items[id]?.unlockedAfter];
    expect(row('hourglass')).toEqual(['small', 15, 'spent', 0]);
    expect(row('agility-potion')).toEqual(['small', 10, 'lost', 0]);
    expect(row('partner-whistle')).toEqual(['small', 20, 'spent', 0]);
    expect(row('quiet-boots')).toEqual(['legs', 20, 'spent', 3]);
    expect(row('lucky-bone')).toEqual(['small', 30, 'spent', 3]);
    expect(row('luck-potion')).toEqual(['small', 15, 'lost', 3]);
  });

  it('the shop sells them with diceGear and hides them without', () => {
    const c = loadContent() as unknown as CampaignContent;
    const s = { completed: ['s1', 's2', 's3'] } as unknown as CampaignState;
    const ids = (v: Variants) => shopStock(c, s, v).map((it) => it.id);
    expect(ids(FULL_FORK)).toEqual(expect.arrayContaining(['hourglass', 'lucky-bone', 'quiet-boots']));
    expect(ids(BASE_RULES)).not.toContain('hourglass');
    expect(ids(BASE_RULES)).toContain('dagger');
  });

  it('no dice item carried: the turns start right after the roll', () => {
    const { s } = reveal({ alpha: ['dagger'] });
    expect(s.pending?.kind).toBe('heroTurn');
  });

  it('a carried initiative item opens the window before cardsRevealed; passing starts the turns', () => {
    const { c, s } = reveal({ alpha: ['hourglass'] });
    expect(s.pending).toEqual({ kind: 'initiativeItems', heroIds: ['hero:alpha'] });
    expect(eventsOf(s.log, 'initiativeRolled')).toHaveLength(1);
    expect(eventsOf(s.log, 'cardsRevealed')).toHaveLength(0);
    expect(legalActions(s, c)).toEqual(expect.arrayContaining([{ type: 'passReaction', heroId: 'hero:alpha' }, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass' }]));
    const s1 = pass(s, c, 'alpha');
    expect(eventsOf(s1.log, 'cardsRevealed')).toHaveLength(1);
    expect(s1.pending?.kind).toBe('heroTurn');
  });

  it('diceGear off: a carried dice item does nothing and opens no window', () => {
    const { c, s } = reveal({ alpha: ['hourglass'] }, { initiativeDie: true });
    expect(s.pending?.kind).toBe('heroTurn');
    expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass' })).toMatch(/dice items are off|own turn/);
  });

  it('Пісочний годинник rerolls the own die (the new roll stands), is spent and ends the hero’s part', () => {
    const { c, s } = reveal({ alpha: ['hourglass'] }, DICE, 3);
    const s1 = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass' });
    const h = heroOf(s1, 'alpha');
    const [ev] = eventsOf(s1.log, 'initiativeChanged');
    expect(ev).toMatchObject({ heroId: 'hero:alpha', itemId: 'hourglass', card: 30, roll: h.initiativeRoll, initiative: 30 + h.initiativeRoll! });
    expect(h.items).toEqual([{ id: 'hourglass', state: 'spent' }]);
    expect(s1.pending?.kind).toBe('heroTurn');
    expect(s1.turnOrder.find((e) => e.kind === 'hero' && e.figureId === 'hero:alpha')).toMatchObject({ initiative: h.initiative, roll: h.initiativeRoll });
  });

  it('Пісочний годинник ★ rerolls twice in a round', () => {
    const { c, s } = reveal({ alpha: ['hourglass+'] });
    const s1 = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass+' });
    expect(heroOf(s1, 'alpha').items).toEqual([{ id: 'hourglass+', state: 'ready' }]);
    expect(s1.pending?.kind).toBe('initiativeItems');
    const s2 = act(s1, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass+' });
    expect(heroOf(s2, 'alpha').items).toEqual([{ id: 'hourglass+', state: 'spent' }]);
    expect(eventsOf(s2.log, 'initiativeChanged')).toHaveLength(2);
    expect(s2.pending?.kind).toBe('heroTurn');
  });

  it('Зілля спритності sets the die to 1 and is lost', () => {
    const { c, s } = reveal({ alpha: ['agility-potion'] });
    const s1 = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'agility-potion' });
    expect(heroOf(s1, 'alpha')).toMatchObject({ initiative: 31, initiativeRoll: 1, items: [{ id: 'agility-potion', state: 'lost' }] });
  });

  it('★ versions: Зілля спритності+ also heals 2, Щаслива кістка+ takes the best of three X', () => {
    const { c, s } = reveal({ alpha: ['agility-potion+'] });
    heroOf(s, 'alpha').hp -= 3;
    const hp = heroOf(s, 'alpha').hp;
    expect(heroOf(act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'agility-potion+' }), 'alpha')).toMatchObject({ hp: hp + 2, initiativeRoll: 1 });
    const b = game({ alpha: ['lucky-bone+'] });
    let sb = selectAll(b.s, b.c, { alpha: ['alpha.gamble', 'alpha.c1'], beta: ['beta.c4', 'beta.c1'] });
    sb = act(sb, b.c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.gamble', half: 'top' });
    sb = act(sb, b.c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'lucky-bone+' });
    expect(eventsOf(sb.log, 'dieRolled').filter((e) => e.itemId === 'lucky-bone+')).toHaveLength(2);
  });

  it('Свисток напарника swaps the totals with an ally', () => {
    const { c, s } = reveal({ alpha: ['partner-whistle'] });
    const a = heroOf(s, 'alpha').initiative;
    const b = heroOf(s, 'beta').initiative;
    expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'partner-whistle' })).toMatch(/ally/);
    const s1 = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'partner-whistle', targetId: 'hero:beta' });
    expect(heroOf(s1, 'alpha').initiative).toBe(b);
    expect(heroOf(s1, 'beta').initiative).toBe(a);
    expect(eventsOf(s1.log, 'initiativeChanged').map((e) => e.heroId).sort()).toEqual(['hero:alpha', 'hero:beta']);
  });

  it('Тихі черевики move the card ±10 (★ ±15), never below 1, the die stays', () => {
    const { c, s } = reveal({ alpha: ['quiet-boots'] });
    const roll = heroOf(s, 'alpha').initiativeRoll!;
    expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'quiet-boots' })).toMatch(/earlier or later/);
    const early = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'quiet-boots', shift: -1 });
    expect(heroOf(early, 'alpha')).toMatchObject({ initiative: 20 + roll, initiativeRoll: roll, initiativeCard: 20 });
    const late = act(reveal({ alpha: ['quiet-boots+'] }).s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'quiet-boots+', shift: 1 });
    expect(heroOf(late, 'alpha').initiativeCard).toBe(45);
    // A card of 10 cannot go below 1.
    const low = game({ alpha: ['quiet-boots'] });
    const sl = selectAll(low.s, low.c, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c4', 'beta.c1'] });
    expect(heroOf(act(sl, low.c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'quiet-boots', shift: -1 }), 'alpha').initiativeCard).toBe(1);
  });

  it('Зілля удачі in the window rerolls the initiative die and keeps the lower one', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { c, s } = reveal({ alpha: ['luck-potion'] }, DICE, seed);
      const before = heroOf(s, 'alpha').initiativeRoll!;
      const s1 = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'luck-potion' });
      expect(heroOf(s1, 'alpha').initiativeRoll).toBeLessThanOrEqual(before);
    }
  });

  it('both heroes in the window: the turns start only when both are done', () => {
    const { c, s } = reveal({ alpha: ['hourglass'], beta: ['agility-potion'] });
    expect(s.pending).toEqual({ kind: 'initiativeItems', heroIds: ['hero:alpha', 'hero:beta'] });
    const s1 = pass(s, c, 'alpha');
    expect(s1.pending).toEqual({ kind: 'initiativeItems', heroIds: ['hero:beta'] });
    expect(rejects(s1, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'hourglass' })).toBeTruthy();
    const s2 = act(s1, c, { type: 'useItem', heroId: 'hero:beta', itemId: 'agility-potion' });
    expect(s2.pending?.kind).toBe('heroTurn');
  });

  it('Щаслива кістка waits for a rolled X on the own turn and keeps the better X', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { c, s: s0 } = game({ alpha: ['lucky-bone'] }, DICE, seed);
      let s = selectAll(s0, c, { alpha: ['alpha.gamble', 'alpha.c1'], beta: ['beta.c4', 'beta.c1'] });
      expect(s.pending?.kind).toBe('heroTurn');
      expect(rejects(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'lucky-bone' })).toMatch(/rolled X/);
      s = act(s, c, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.gamble', half: 'top' });
      const first = s.pending?.kind === 'stepChoice' ? s.pending.step.xRoll! : 0;
      s = act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: 'lucky-bone' });
      const step = s.pending?.kind === 'stepChoice' ? s.pending.step : undefined;
      expect(step?.xRoll).toBeGreaterThanOrEqual(first);
      expect(step).toMatchObject({ value: 1 + step!.xRoll! });
      expect(s.half?.steps[0]).toEqual(step);
      expect(eventsOf(s.log, 'dieRolled').at(-1)).toMatchObject({ previous: first, itemId: 'lucky-bone' });
    }
  });

  it('the prompts show the change and hide a reroll’s result', () => {
    const { c, s } = reveal({ alpha: ['hourglass', 'quiet-boots'], beta: ['partner-whistle'] });
    const prompts = initiativePrompts(s, c);
    const a = heroOf(s, 'alpha');
    expect(prompts.find((p) => p.itemId === 'hourglass')).toMatchObject({ kind: 'reroll', initiative: a.initiative, roll: a.initiativeRoll });
    expect(prompts.find((p) => p.itemId === 'hourglass')!.after).toBeUndefined();
    expect(prompts.filter((p) => p.itemId === 'quiet-boots').map((p) => p.after)).toEqual([a.initiative! - 10, a.initiative! + 10]);
    expect(prompts.find((p) => p.itemId === 'partner-whistle')).toMatchObject({ heroId: 'hero:beta', allyId: 'hero:alpha', after: a.initiative });
  });
});
