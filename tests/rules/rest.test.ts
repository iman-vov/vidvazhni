import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../src/rules/content';
import type { Hex } from '../../src/rules/hex';
import {
  act,
  endTurn,
  eventsOf,
  finishRound,
  heroOf,
  makeContent,
  newGame,
  rejects,
  selectAll,
  stackModifiers,
  type FixtureOptions,
} from '../helpers/engineFixtures';

const IDLE: MonsterCard[] = [{ id: 'idle.99', initiative: 99, steps: [] }];
const HITTER: MonsterCard[] = [{ id: 'hit.5', initiative: 5, steps: [{ type: 'attack', value: 0 }] }];

function game(opts: FixtureOptions = {}, heroes = ['alpha']) {
  const content = makeContent({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [5, 2] }], ...opts });
  return { content, s: newGame(content, heroes) };
}

describe('short rest', () => {
  it('is offered at the end of the round with 2+ discarded cards: discard → hand, one random card lost', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = endTurn(s, content, 'alpha');
    expect(s.pending).toEqual({ kind: 'endOfRound', heroIds: ['hero:alpha'] });
    s = act(s, content, { type: 'shortRest', heroId: 'hero:alpha', rest: true });
    expect(s.pending?.kind).toBe('shortRestReroll');
    const lost = s.pending?.kind === 'shortRestReroll' ? s.pending.lostCard : '';
    s = act(s, content, { type: 'shortRestReroll', heroId: 'hero:alpha', reroll: false });
    const h = heroOf(s, 'alpha');
    expect(h.lost).toEqual([lost]);
    expect(h.discard).toEqual([]);
    expect(h.hand).toHaveLength(9);
    expect(eventsOf(s.log, 'rested')).toEqual([{ type: 'rested', heroId: 'hero:alpha', kind: 'short', lost }]);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:alpha'] });
  });

  it('may take 1 damage once to lose a different random card', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = endTurn(s, content, 'alpha');
    s = act(s, content, { type: 'shortRest', heroId: 'hero:alpha', rest: true });
    const first = s.pending?.kind === 'shortRestReroll' ? s.pending.lostCard : '';
    s = act(s, content, { type: 'shortRestReroll', heroId: 'hero:alpha', reroll: true });
    expect(heroOf(s, 'alpha').hp).toBe(9);
    expect(heroOf(s, 'alpha').lost).toHaveLength(1);
    expect(heroOf(s, 'alpha').lost[0]).not.toBe(first);
    expect(heroOf(s, 'alpha').hand).toContain(first);
  });

  it('is not offered with fewer than 2 discarded cards', () => {
    const { content, s: s0 } = game();
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    heroOf(s, 'alpha').playedThisTurn = [{ cardId: 'alpha.c2', half: 'top' }]; // as if lost
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').discard).toEqual(['alpha.c1']);
    expect(s.pending?.kind).toBe('selectCards');
  });
});

describe('long rest', () => {
  it('the hero picks the lost card, heals 2, and the rest of the discard returns to the hand', () => {
    const { content, s: s0 } = game();
    const h0 = heroOf(s0, 'alpha');
    h0.hand = h0.hand.slice(0, 7);
    h0.discard = ['alpha.c8', 'alpha.c9', 'alpha.c10'];
    h0.hp = 5;
    let s = selectAll(s0, content, { alpha: 'rest' });
    rejects(s, content, { type: 'longRestLoss', heroId: 'hero:alpha', cardId: 'alpha.c1' });
    s = act(s, content, { type: 'longRestLoss', heroId: 'hero:alpha', cardId: 'alpha.c9' });
    const h = heroOf(s, 'alpha');
    expect(h.lost).toEqual(['alpha.c9']);
    expect(h.hand).toHaveLength(9);
    expect(h.hp).toBe(7);
    expect(eventsOf(s.log, 'rested')).toEqual([{ type: 'rested', heroId: 'hero:alpha', kind: 'long', lost: 'alpha.c9' }]);
    expect(s.pending?.kind).toBe('selectCards');
  });
});

describe('avoid damage', () => {
  const hit = () => game({ decks: [{ id: 'tmelee', cards: HITTER }], spawns: [{ monster: 'rat', hex: [1, 2] }] });

  it('lose 1 card from the hand instead of taking the damage', () => {
    const { content, s: s0 } = hit();
    stackModifiers(s0, 'monsters', ['+0']);
    let s = act(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c2'], leading: 'alpha.c1' });
    expect(s.pending).toEqual({ kind: 'avoidDamage', heroId: 'hero:alpha', amount: 2, source: 'monster:rat:1' });
    rejects(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'loseHand', cardId: 'alpha.c1' } });
    s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'loseHand', cardId: 'alpha.c5' } });
    expect(heroOf(s, 'alpha')).toMatchObject({ hp: 10, lost: ['alpha.c5'] });
    expect(eventsOf(s.log, 'damageAvoided')).toEqual([{ type: 'damageAvoided', heroId: 'hero:alpha', amount: 2, lost: ['alpha.c5'] }]);
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:alpha' });
  });

  it('or 2 cards from the discard', () => {
    const { content, s: s0 } = hit();
    stackModifiers(s0, 'monsters', ['+0']);
    heroOf(s0, 'alpha').discard = ['alpha.c9', 'alpha.c10'];
    heroOf(s0, 'alpha').hand = heroOf(s0, 'alpha').hand.slice(0, 8);
    let s = act(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c2'], leading: 'alpha.c1' });
    s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'loseDiscard', cardIds: ['alpha.c9', 'alpha.c10'] } });
    expect(heroOf(s, 'alpha')).toMatchObject({ hp: 10, lost: ['alpha.c9', 'alpha.c10'], discard: [] });
  });
});

describe('exhaustion and loss', () => {
  it('a hero at 0 hp is exhausted and leaves the board; all heroes exhausted = scenario lost', () => {
    const { content, s: s0 } = game({ decks: [{ id: 'tmelee', cards: HITTER }], spawns: [{ monster: 'rat', hex: [1, 2] }] });
    stackModifiers(s0, 'monsters', ['x2']);
    heroOf(s0, 'alpha').hp = 3;
    let s = act(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c2'], leading: 'alpha.c1' });
    s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(s, 'alpha')).toMatchObject({ hp: 0, exhausted: true });
    expect(eventsOf(s.log, 'heroExhausted')).toEqual([{ type: 'heroExhausted', heroId: 'hero:alpha', reason: 'damage' }]);
    expect(s.phase).toBe('lost');
    expect(eventsOf(s.log, 'scenarioLost')).toHaveLength(1);
    expect(s.pending).toBeNull();
    rejects(s, content, { type: 'endTurn', heroId: 'hero:alpha' });
  });

  it('one exhausted hero: the others play on and monsters ignore the exhausted one', () => {
    const { content, s: s0 } = game({ decks: [{ id: 'tmelee', cards: HITTER }], spawns: [{ monster: 'rat', hex: [1, 2] }] }, ['alpha', 'beta']);
    stackModifiers(s0, 'monsters', ['x2', '+0']);
    heroOf(s0, 'alpha').hp = 3;
    heroOf(s0, 'beta').hex = [2, 2];
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
    s = act(s, content, { type: 'avoidDamage', heroId: 'hero:alpha', choice: { kind: 'take' } });
    expect(heroOf(s, 'alpha').exhausted).toBe(true);
    expect(s.phase).toBe('turns');
    expect(s.turnOrder.map((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId))).toContain('hero:alpha');
    expect(s.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:beta' });
  });

  it('a hero who can neither play 2 cards nor rest is exhausted at the start of the round', () => {
    const { content, s: s0 } = game({}, ['alpha', 'beta']);
    heroOf(s0, 'alpha').hand = ['alpha.c1', 'alpha.c2'];
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'], beta: ['beta.c1', 'beta.c2'] });
    heroOf(s, 'alpha').playedThisTurn = [{ cardId: 'alpha.c2', half: 'top' }]; // as if lost
    s = finishRound(s, content);
    expect(heroOf(s, 'alpha')).toMatchObject({ exhausted: true });
    expect(eventsOf(s.log, 'heroExhausted')).toEqual([{ type: 'heroExhausted', heroId: 'hero:alpha', reason: 'cards' }]);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:beta'] });
  });

  it('with fewer than 2 cards in hand but 2 discarded, only a long rest is possible', () => {
    const { content, s: s0 } = game();
    heroOf(s0, 'alpha').hand = ['alpha.c1'];
    heroOf(s0, 'alpha').discard = ['alpha.c2', 'alpha.c3'];
    rejects(s0, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c2'], leading: 'alpha.c1' });
    act(s0, content, { type: 'declareLongRest', heroId: 'hero:alpha' });
  });
});

describe('scenario goals', () => {
  const killer = (hex: Hex) =>
    game({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex }], secondRoom: false, monsters: undefined });

  it('killAll: won at the end of the round once every room is open and no monster is left', () => {
    const { content, s: s0 } = killer([1, 2]);
    (s0.figures['monster:rat:1'] as { hp: number }).hp = 1;
    stackModifiers(s0, 'alpha', ['+0']);
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c1', half: 'top' });
    s = act(s, content, { type: 'resolveStep', choice: { targets: ['monster:rat:1'] } });
    expect(s.phase).toBe('turns');
    s = endTurn(s, content, 'alpha');
    s = finishRound(s, content);
    expect(s.phase).toBe('won');
    expect(heroOf(s, 'alpha').xp).toBe(4 + 2 * 1);
    expect(eventsOf(s.log, 'scenarioWon')).toHaveLength(1);
  });

  it('killAll is not met while a room is still closed', () => {
    const { content, s: s0 } = game({ spawns: [] });
    const s = finishRound(selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] }), content);
    expect(s.phase).toBe('selectCards');
  });

  it('reachExit: every hero on an exit hex at the end of the round', () => {
    const { content, s: s0 } = game({ goal: { type: 'reachExit', hexes: [[1, 2]] } });
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c2', half: 'bottom' });
    s = act(s, content, { type: 'resolveStep', choice: { path: [[1, 2]] } });
    s = finishRound(s, content);
    expect(s.phase).toBe('won');
  });
});

describe('loot', () => {
  it('heroes pick up loot on their hex at the end of the turn; «Лут N» takes everything within N', () => {
    const { content, s: s0 } = game({ room: { coins: [[1, 2], [2, 2], [3, 0]], chests: [{ hex: [2, 3], id: 'lantern-shard' }] } });
    let s = selectAll(s0, content, { alpha: ['alpha.c1', 'alpha.c2'] });
    s = act(s, content, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'alpha.c2', half: 'bottom' });
    s = act(s, content, { type: 'resolveStep', choice: { path: [[1, 2]] } });
    expect(heroOf(s, 'alpha').coins).toBe(0);
    s = endTurn(s, content, 'alpha');
    expect(heroOf(s, 'alpha').coins).toBe(1);
    expect(s.board.tiles['1,2']?.coins).toBeUndefined();

    const content2 = makeContent({
      heroes: { alpha: [{ id: 'l.loot', level: 1, initiative: 10, top: { steps: [{ type: 'loot', range: 2 }] }, bottom: { steps: [] } }, { id: 'l.x', level: 1, initiative: 20, top: { steps: [] }, bottom: { steps: [] } }] },
      decks: [{ id: 'tmelee', cards: IDLE }],
      room: { coins: [[1, 2], [2, 2], [3, 0]], chests: [{ hex: [2, 1], id: 'lantern-shard' }] },
    });
    let t = selectAll(newGame(content2, ['alpha']), content2, { alpha: ['l.loot', 'l.x'] });
    t = act(t, content2, { type: 'startHalf', heroId: 'hero:alpha', cardId: 'l.loot', half: 'top' });
    t = act(t, content2, { type: 'resolveStep', choice: {} });
    expect(heroOf(t, 'alpha')).toMatchObject({ coins: 2, chests: ['lantern-shard'] });
    expect(t.board.tiles['3,0']?.coins).toBe(1);
  });
});
