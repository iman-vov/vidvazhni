import { describe, expect, it } from 'vitest';
import type { MonsterCard } from '../../src/rules/content';
import {
  act,
  eventsOf,
  finishRound,
  heroOf,
  makeContent,
  monsterType,
  newGame,
  rejects,
  selectAll,
  stackBehaviour,
  stackModifiers,
} from '../helpers/engineFixtures';

const IDLE: MonsterCard[] = [
  { id: 'idle.50', initiative: 50, steps: [{ type: 'shield', value: 1, target: 'self', duration: 'round' }] },
  { id: 'idle.20', initiative: 20, steps: [{ type: 'shield', value: 1, target: 'self', duration: 'round' }], shuffle: true },
  { id: 'idle.70', initiative: 70, steps: [] },
];

describe('card selection', () => {
  const content = makeContent();
  it('needs two different cards from the hand and a leading card among them', () => {
    const s = newGame(content, ['alpha']);
    rejects(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c1'], leading: 'alpha.c1' });
    rejects(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'beta.c1'], leading: 'alpha.c1' });
    rejects(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c1', 'alpha.c2'], leading: 'alpha.c3' });
    rejects(s, content, { type: 'declareLongRest', heroId: 'hero:alpha' });
  });

  it('waits for every hero, then reveals: leading card = initiative, cards leave the hand', () => {
    let s = newGame(content, ['alpha', 'beta']);
    s = act(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c3', 'alpha.c1'], leading: 'alpha.c3' });
    expect(s.phase).toBe('selectCards');
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:beta'] });
    s = act(s, content, { type: 'selectCards', heroId: 'hero:beta', cards: ['beta.c2', 'beta.c5'], leading: 'beta.c5' });
    expect(s.phase).toBe('turns');
    expect(heroOf(s, 'alpha').initiative).toBe(30);
    expect(heroOf(s, 'alpha').hand).not.toContain('alpha.c3');
    expect(s.turnOrder.map((e) => (e.kind === 'monsterGroup' ? e.typeId : e.figureId))).toEqual(['hero:alpha', 'hero:beta']);
  });
});

describe('turn order', () => {
  it('lower initiative first; hero before monster on a tie; heroes tie in list order', () => {
    const content = makeContent({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [5, 2] }] });
    let s = newGame(content, ['alpha', 'beta']);
    stackBehaviour(s, 'rat', ['idle.50']);
    s = selectAll(s, content, { beta: ['beta.c5', 'beta.c1'], alpha: ['alpha.c5', 'alpha.c2'] });
    expect(s.turnOrder).toEqual([
      { kind: 'hero', figureId: 'hero:alpha', initiative: 50 },
      { kind: 'hero', figureId: 'hero:beta', initiative: 50 },
      { kind: 'monsterGroup', typeId: 'rat', initiative: 50 },
    ]);
  });

  it('monster initiative = card + type offset, within 1–99', () => {
    for (const [offset, expected] of [
      [-60, 1],
      [5, 55],
      [60, 99],
    ] as const) {
      const content = makeContent({
        monsters: [monsterType('rat', 'tmelee', { initiativeOffset: offset })],
        decks: [{ id: 'tmelee', cards: IDLE }],
        spawns: [{ monster: 'rat', hex: [5, 2] }],
      });
      let s = newGame(content, ['alpha']);
      stackBehaviour(s, 'rat', ['idle.50']);
      s = selectAll(s, content, { alpha: ['alpha.c9', 'alpha.c2'] });
      expect(s.turnOrder.find((e) => e.kind === 'monsterGroup')?.initiative).toBe(expected);
    }
  });

  it('long rest has initiative 99', () => {
    const content = makeContent();
    let s = newGame(content, ['alpha']);
    heroOf(s, 'alpha').discard = ['alpha.c9', 'alpha.c10'];
    heroOf(s, 'alpha').hand = heroOf(s, 'alpha').hand.slice(0, 8);
    s = selectAll(s, content, { alpha: 'rest' });
    expect(s.turnOrder).toEqual([{ kind: 'hero', figureId: 'hero:alpha', initiative: 99 }]);
    expect(s.pending).toEqual({ kind: 'longRestLoss', heroId: 'hero:alpha' });
  });

  it('a monster group acts elite first, then normal by standee number', () => {
    const content = makeContent({
      decks: [{ id: 'tmelee', cards: IDLE }],
      spawns: [
        { monster: 'rat', hex: [5, 1] },
        { monster: 'rat', hex: [5, 3], rank: 'elite' },
        { monster: 'rat', hex: [6, 0] },
      ],
    });
    let s = newGame(content, ['alpha']);
    stackBehaviour(s, 'rat', ['idle.20']);
    const r = act(s, content, { type: 'selectCards', heroId: 'hero:alpha', cards: ['alpha.c9', 'alpha.c2'], leading: 'alpha.c9' });
    s = r;
    const started = eventsOf(s.log, 'turnStarted').map((e) => e.figureId);
    expect(started).toEqual(['monster:rat:2', 'monster:rat:1', 'monster:rat:3', 'hero:alpha']);
  });
});

describe('end of round', () => {
  it('elements decay, round effects end, ⟳ decks and decks that drew ×2/miss are shuffled', () => {
    const content = makeContent({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [5, 2] }] });
    let s = newGame(content, ['alpha']);
    stackBehaviour(s, 'rat', ['idle.20']);
    s.elements.fire = 'strong';
    s.elements.ice = 'waning';
    s.monsterDeck.needsShuffle = true;
    s.monsterDeck.discard = ['x2'];
    s.monsterDeck.draw = s.monsterDeck.draw.filter((c) => c !== 'x2');
    s = selectAll(s, content, { alpha: ['alpha.c9', 'alpha.c2'] });
    expect(s.figures['monster:rat:1']?.shields).toEqual([{ value: 1, source: 'round', until: 'round' }]);
    expect(s.behaviourDecks.rat?.needsShuffle).toBe(true);
    s = finishRound(s, content);
    expect(s.round).toBe(2);
    expect(s.elements.fire).toBe('waning');
    expect(s.elements.ice).toBe('inert');
    expect(s.figures['monster:rat:1']?.shields).toEqual([]);
    expect(s.behaviourDecks.rat).toMatchObject({ discard: [], current: null, needsShuffle: false });
    expect(s.behaviourDecks.rat?.draw).toHaveLength(3);
    expect(s.monsterDeck).toMatchObject({ discard: [], needsShuffle: false });
    expect(s.monsterDeck.draw).toHaveLength(20);
    expect(s.pending).toEqual({ kind: 'selectCards', heroIds: ['hero:alpha'] });
  });

  it('without ⟳ the behaviour card goes to the discard', () => {
    const content = makeContent({ decks: [{ id: 'tmelee', cards: IDLE }], spawns: [{ monster: 'rat', hex: [5, 2] }] });
    let s = newGame(content, ['alpha']);
    stackBehaviour(s, 'rat', ['idle.50']);
    stackModifiers(s, 'monsters', []);
    s = finishRound(selectAll(s, content, { alpha: ['alpha.c9', 'alpha.c2'] }), content);
    expect(s.behaviourDecks.rat?.discard).toEqual(['idle.50']);
    expect(s.behaviourDecks.rat?.draw).toHaveLength(2);
  });
});
