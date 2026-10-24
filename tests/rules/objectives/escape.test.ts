import { describe, expect, it } from 'vitest';
import { finishRound, makeContent, newGame, selectAll } from '../../helpers/engineFixtures';
import type { Content } from '../../../src/rules/content';
import { goalReached, objectiveStatus } from '../../../src/rules/objectives';
import type { GameState, HeroState } from '../../../src/rules/state';
import { checkScenario } from '../../data/crossref';

const content = makeContent({ secondRoom: false, scenario: { zones: [{ id: 'exit', hexes: [[6, 0], [6, 1]] }] }, goal: { type: 'escape', zone: 'exit', rounds: 2 } });

function round(s: GameState, c: Content = content): GameState {
  return finishRound(selectAll(s, c, { alpha: two(s, 'alpha'), beta: two(s, 'beta') }), c);
}

function two(s: GameState, id: string): [string, string] {
  const hand = (s.figures[`hero:${id}`] as HeroState).hand;
  return [hand[0]!, hand[1]!];
}

function at(s: GameState, id: string, hex: [number, number]): GameState {
  s.figures[`hero:${id}`]!.hex = hex;
  return s;
}

describe('escape', () => {
  it('every hero on its feet in the exit zone wins; the HUD counts heroes out and rounds left', () => {
    const s = at(newGame(content), 'alpha', [6, 0]);
    expect(objectiveStatus(content, s)).toMatchObject({ goal: 'escape', done: 1, of: 2, roundsLeft: 2 });
    expect(round(structuredClone(s)).phase).toBe('selectCards');
    expect(round(at(s, 'beta', [6, 1])).phase).toBe('won');
  });

  it('an exhausted hero does not hold the party back', () => {
    const s = at(newGame(content), 'alpha', [6, 0]);
    const beta = s.figures['hero:beta']!;
    if (beta.kind === 'hero') beta.exhausted = true;
    expect(goalReached({ s, c: content, ev: [], out: [] })).toBe(true);
  });

  it('not out by the end of round `rounds`: the cave-in loses', () => {
    let s = round(newGame(content));
    expect(objectiveStatus(content, s)?.roundsLeft).toBe(1);
    s = round(s);
    expect(s.phase).toBe('lost');
  });

  it('the data checks want exit hexes', () => {
    const bad = { ...content.scenarios['test']!, goal: { type: 'escape' as const, rounds: 3 } };
    expect(checkScenario(bad, content)).toContain('test: goal escape has no hexes');
  });
});
