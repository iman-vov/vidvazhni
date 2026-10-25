import { describe, expect, it } from 'vitest';
import { act, eventsOf, finishRound, rejects, stackBehaviour } from '../../helpers/engineFixtures';
import { addCondition } from '../../../src/rules/conditions';
import { findPath } from '../../../src/rules/geometry';
import { legalActions } from '../../../src/rules/queries';
import { figureSteps } from '../../../src/rules/turn';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, content, ctxOf, game, hero, monstersOf, place, reveal, selected, selectEarly, tile, untilTurn } from './helpers';

function miller(s: GameState) {
  const m = monstersOf(s, 'bog-miller')[0];
  if (!m) throw new Error('no miller');
  return m;
}

/** The hall with only the Miller in it, the heroes placed where given. */
function hall(warden: [number, number], herbalist: [number, number], variants = {}): GameState {
  const s = reveal(game('s3', variants), 's3.sluice', 's3.mill-hall');
  clearMonsters(s, 'bandit-brute', 'bandit-crossbow', 'bog-slime');
  place(s, 'hero:warden', warden);
  place(s, 'hero:herbalist', herbalist);
  return s;
}

describe('s3 Затоплений млин: Мірошник-Болотяник', () => {
  it('health is 7 per hero (+2 per hero per level above 1), with Shield 1 and boss immunities', () => {
    expect(miller(reveal(game('s3'), 's3.mill-hall')).maxHp).toBe(14);
    expect(miller(reveal(game('s3', {}, ['warden', 'herbalist', 'tinker']), 's3.mill-hall')).maxHp).toBe(21);
    // Heroes of level 3 → scenario level 2.
    const lvl = reveal(game('s3', {}, ['warden', 'herbalist'], 3), 's3.mill-hall');
    expect(lvl.level).toBe(2);
    expect(miller(lvl).maxHp).toBe(18);
    const s = reveal(game('s3'), 's3.mill-hall');
    const m = miller(s);
    expect(m.shields).toEqual([{ value: 1, source: 'stats', until: 'scenario' }]);
    const ctx = ctxOf(s);
    expect(addCondition(ctx, m, 'stun')).toBe(false);
    expect(addCondition(ctx, m, 'immobilize')).toBe(false);
    expect(addCondition(ctx, m, 'muddle')).toBe(false);
    expect(addCondition(ctx, m, 'poison')).toBe(true);
  });

  it('«Кидок мішка» is a range 3 attack on 2 targets', () => {
    const s = hall([13, -5], [13, -4]);
    s.behaviourDecks['bog-miller']!.current = 'boss.miller.45';
    expect(figureSteps(ctxOf(s), miller(s))).toEqual([{ type: 'attack', value: 3, range: 3, targets: 2 }]);
  });

  it('card 22 summons 2 bog slimes next to the Miller and heals him by 3', () => {
    let s = hall([13, -5], [13, -4]);
    miller(s).hp = 10;
    stackBehaviour(s, 'bog-miller', ['boss.miller.22']);
    s = finishRound(selectEarly(s), content);
    const slimes = monstersOf(s, 'bog-slime');
    expect(slimes).toHaveLength(2);
    for (const sl of slimes) {
      expect(sl.summonerId).toBe(miller(s).id);
      expect(Math.max(Math.abs(sl.hex[0] - 15), Math.abs(sl.hex[1] + 5), Math.abs(sl.hex[0] + sl.hex[1] - 10))).toBe(1);
    }
    expect(miller(s).hp).toBe(13);
  });

  it('«Потоп»: heroes on water take 2 damage and are immobilized; others are spared', () => {
    let s = hall([14, -5], [13, -5]);
    expect(tile(s, [14, -5]).terrain).toBe('water');
    expect(tile(s, [13, -5]).terrain).toBe('normal');
    stackBehaviour(s, 'bog-miller', ['boss.miller.72']);
    s = selectEarly(s);
    const before = { warden: hero(s, 'warden').hp, herbalist: hero(s, 'herbalist').hp };
    s = finishRound(s, content);
    expect(hero(s, 'warden').hp).toBe(before.warden - 2);
    expect(hero(s, 'herbalist').hp).toBe(before.herbalist);
    expect(s.log.some((e) => e.type === 'conditionAdded' && e.figureId === 'hero:warden' && e.condition === 'immobilize')).toBe(true);
  });

  it('the sluice lever: a hero next to it spends a top action to lower it', () => {
    let s = clearMonsters(reveal(game('s3'), 's3.sluice'));
    expect(tile(s, [6, -1])).toMatchObject({ obstacle: true, object: { id: 's3.sluice-lever', kind: 'lever', state: 'up' } });
    place(s, 'hero:warden', [6, 0]);
    s = untilTurn(selectEarly(s), 'warden');
    const [a, b] = selected(s, 'warden');
    const offered = legalActions(s, content).filter((x) => x.type === 'interact');
    expect(offered).toEqual([
      { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'top', objectId: 's3.sluice-lever' },
      { type: 'interact', heroId: 'hero:warden', cardId: b, half: 'top', objectId: 's3.sluice-lever' },
    ]);
    expect(rejects(s, content, { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'bottom', objectId: 's3.sluice-lever' })).toMatch(
      /top action/,
    );
    const r = act(s, content, { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'top', objectId: 's3.sluice-lever' });
    expect(tile(r, [6, -1]).object?.state).toBe('down');
    expect(eventsOf(r.log, 'objectChanged')).toEqual([{ type: 'objectChanged', objectId: 's3.sluice-lever', hex: [6, -1], state: 'down', byId: 'hero:warden' }]);
    expect([...hero(r, 'warden').discard, ...hero(r, 'warden').lost]).toContain(a);
    expect(r.pending).toEqual({ kind: 'heroTurn', heroId: 'hero:warden' });
    // The other card's bottom half can still be played; the lever is done.
    expect(rejects(r, content, { type: 'interact', heroId: 'hero:warden', cardId: b, half: 'top', objectId: 's3.sluice-lever' })).toMatch(/top action already/);
    expect(act(r, content, { type: 'undo' }).board.tiles['6,-1']?.object?.state).toBe('up');
  });

  it('the lever must be adjacent', () => {
    let s = clearMonsters(reveal(game('s3'), 's3.sluice'));
    place(s, 'hero:warden', [9, -2]);
    s = untilTurn(selectEarly(s), 'warden');
    const [a] = selected(s, 'warden');
    expect(rejects(s, content, { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'top', objectId: 's3.sluice-lever' })).toMatch(/adjacent/);
  });

  it('with the sluice lowered «Потоп» does nothing', () => {
    let s = hall([14, -5], [14, -4]);
    tile(s, [6, -1]).object!.state = 'down';
    stackBehaviour(s, 'bog-miller', ['boss.miller.72']);
    s = selectEarly(s);
    const before = hero(s, 'warden').hp + hero(s, 'herbalist').hp;
    s = finishRound(s, content);
    expect(hero(s, 'warden').hp + hero(s, 'herbalist').hp).toBe(before);
    expect(s.log.some((e) => e.type === 'conditionAdded' && e.condition === 'immobilize')).toBe(false);
  });

  it('water is difficult terrain: entering it costs 2 movement', () => {
    const s = clearMonsters(reveal(game('s3'), 's3.sluice'));
    place(s, 'hero:warden', [6, 0]);
    expect(findPath(s, [7, 0], { figureId: 'hero:warden' })?.cost).toBe(2);
    expect(findPath(s, [5, 0], { figureId: 'hero:warden' })?.cost).toBe(1);
  });

  it('fork: the millstones infuse Earth every round once the hall is revealed', () => {
    let s = clearMonsters(game('s3', { orbs: true }));
    expect(s.orbs.earth).toBeUndefined();
    s = finishRound(selectEarly(s), content);
    expect(s.orbs.earth).toBeUndefined();
    reveal(s, 's3.sluice', 's3.mill-hall');
    // The Miller stays (killing him would end the scenario); he is far from the heroes in the yard.
    clearMonsters(s, 'bog-slime');
    s = finishRound(selectEarly(s), content);
    expect(s.orbs.earth).toEqual({ ownerId: 's3.millstones', hex: [17, -8], age: 0 });
    expect(tile(s, [17, -8]).obstacle).toBe(true);
  });

  it('base rules: the millstones give nothing', () => {
    const s = clearMonsters(reveal(game('s3'), 's3.sluice', 's3.mill-hall'), 'bandit-brute', 'bandit-crossbow', 'bog-slime');
    const t = finishRound(selectEarly(s), content);
    expect(t.phase).toBe('selectCards');
    expect(t.orbs).toEqual({});
    expect(t.elements.earth).toBe('inert');
  });
});
