import { describe, expect, it } from 'vitest';
import { act, endTurn, eventsOf, finishRound, playHalf, rejects, stackBehaviour, stackModifiers } from '../../helpers/engineFixtures';
import { takeDamage } from '../../../src/rules/damage';
import { monsterStats } from '../../../src/rules/effects/context';
import { healFigure } from '../../../src/rules/effects/support';
import { distance } from '../../../src/rules/hex';
import { legalActions } from '../../../src/rules/queries';
import { adjustDamage } from '../../../src/rules/scenarioRules';
import { runFadeOut } from '../../../src/rules/special/fadeOut';
import { figureSteps } from '../../../src/rules/turn';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, content, ctxOf, game, hero, monstersOf, place, reveal, selected, selectEarly, tile, untilTurn } from './helpers';

const BRAZIERS: [number, number][] = [
  [8, -3],
  [11, -4],
  [10, -1],
];

function boss(s: GameState) {
  const m = monstersOf(s, 'shadowhand')[0];
  if (!m) throw new Error('no Тінерук');
  return m;
}

/** The Heart with only Тінерук; the heroes stay in the tunnel unless placed. */
function heart(variants = {}): GameState {
  const s = reveal(game('s5', variants), 's5.heart');
  clearMonsters(s, 'shadow-wraith', 'gloom-cultist');
  return s;
}

function lightAll(s: GameState): void {
  for (const hex of BRAZIERS) tile(s, hex).object!.state = 'lit';
}

describe('s5 Серце Мороку: жаровні й Тінерук', () => {
  it('three unlit braziers stand in the Heart and block movement', () => {
    const s = heart();
    for (const hex of BRAZIERS) expect(tile(s, hex)).toMatchObject({ obstacle: true, object: { kind: 'brazier', state: 'unlit' } });
    expect(boss(s).maxHp).toBe(20);
  });

  it('a hero next to a brazier spends a bottom action to light it and infuse Light', () => {
    let s = heart();
    place(s, 'hero:warden', [8, -2]);
    s = untilTurn(selectEarly(s), 'warden');
    const [a, b] = selected(s, 'warden');
    expect(rejects(s, content, { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'top', objectId: 's5.brazier-1' })).toMatch(/bottom action/);
    expect(rejects(s, content, { type: 'interact', heroId: 'hero:warden', cardId: a, half: 'bottom', objectId: 's5.brazier-2' })).toMatch(/adjacent/);
    s = act(s, content, { type: 'interact', heroId: 'hero:warden', cardId: b, half: 'bottom', objectId: 's5.brazier-1' });
    expect(tile(s, [8, -3]).object?.state).toBe('lit');
    expect(s.pendingInfusions).toEqual(['light']);
    s = endTurn(s, content, 'warden');
    expect(s.elements.light).toBe('strong');
  });

  it('fork: lighting a brazier gives a Fire orb above the hero (there is no Light orb)', () => {
    let s = heart({ orbs: true });
    place(s, 'hero:warden', [8, -2]);
    s = untilTurn(selectEarly(s), 'warden');
    const [, b] = selected(s, 'warden');
    s = act(s, content, { type: 'interact', heroId: 'hero:warden', cardId: b, half: 'bottom', objectId: 's5.brazier-1' });
    expect(s.orbs.fire).toEqual({ ownerId: 'hero:warden', age: 0 });
  });

  it('fork: the scenario starts with a Fire and an Air orb', () => {
    const s = game('s5', { orbs: true });
    expect(s.orbs).toEqual({ fire: { ownerId: 'scenario', age: 0 }, air: { ownerId: 'scenario', age: 0 } });
    expect(game('s5').orbs).toEqual({});
  });

  it('while fewer than 3 braziers burn, Тінерук takes half damage, rounded down', () => {
    const s = heart();
    const ctx = ctxOf(s);
    expect(adjustDamage(ctx, boss(s), 5)).toBe(2);
    tile(s, [8, -3]).object!.state = 'lit';
    tile(s, [11, -4]).object!.state = 'lit';
    expect(adjustDamage(ctx, boss(s), 5)).toBe(2);
    tile(s, [10, -1]).object!.state = 'lit';
    expect(adjustDamage(ctx, boss(s), 5)).toBe(5);
    // Other monsters always take full damage.
    const t = reveal(game('s5'), 's5.heart');
    expect(adjustDamage(ctxOf(t), monstersOf(t, 'shadow-wraith')[0]!, 5)).toBe(5);
  });

  it('a hero attack on Тінерук deals half (base Атака 2 → 1), full once all braziers burn', () => {
    for (const [lit, expected] of [
      [false, 19],
      [true, 18],
    ] as const) {
      let s = heart();
      if (lit) lightAll(s);
      place(s, 'hero:warden', [9, -3]);
      s = untilTurn(selectEarly(s), 'warden');
      stackModifiers(s, 'warden', ['+0']);
      const [a] = selected(s, 'warden');
      s = playHalf(s, content, 'warden', a, 'top', [{ targets: [boss(s).id] }], true);
      expect(boss(s).hp).toBe(expected);
    }
  });

  it('a wraith ending its turn next to a lit brazier puts it out', () => {
    let s = reveal(game('s5'), 's5.heart');
    const [w, ...rest] = monstersOf(s, 'shadow-wraith');
    for (const m of [...rest, ...monstersOf(s, 'gloom-cultist'), boss(s)]) delete s.figures[m.id];
    tile(s, [8, -3]).object!.state = 'lit';
    place(s, w!.id, [8, -2]);
    w!.conditions.immobilize = { expiresAfterTurn: 99 };
    s = finishRound(selectEarly(s), content);
    expect(tile(s, [8, -3]).object?.state).toBe('unlit');
    expect(eventsOf(s.log, 'objectChanged')).toEqual([{ type: 'objectChanged', objectId: 's5.brazier-1', hex: [8, -3], state: 'unlit', byId: w!.id }]);
  });

  it('teleport: Тінерук jumps up to 5 hexes to a free hex away from heroes but within his range, and infuses Darkness', () => {
    let s = heart();
    place(s, 'hero:warden', [9, -3]);
    place(s, 'hero:herbalist', [9, -2]);
    stackBehaviour(s, 'shadowhand', ['boss.shadowhand.08']);
    const from = boss(s).hex;
    s = finishRound(selectEarly(s), content);
    const to = boss(s).hex;
    expect(to).not.toEqual(from);
    expect(distance(from, to)).toBeLessThanOrEqual(5);
    for (const h of [hero(s, 'warden'), hero(s, 'herbalist')]) {
      expect(distance(h.hex, to)).toBeGreaterThan(1);
      expect(distance(h.hex, to)).toBeLessThanOrEqual(3);
    }
    expect(tile(s, to).obstacle).toBeUndefined();
    expect(s.log.some((e) => e.type === 'moved' && e.figureId === boss(s).id && e.jump)).toBe(true);
    expect(s.elements.dark).toBe('waning');
  });

  it('«Згасання»: each hero chooses to lose a random discarded card or take 2 damage', () => {
    let s = heart();
    stackBehaviour(s, 'shadowhand', ['boss.shadowhand.74']);
    s = selectEarly(s);
    while (s.pending?.kind === 'heroTurn') s = endTurn(s, content, s.pending.heroId.slice(5));
    expect(s.pending).toEqual({ kind: 'fadeOut', heroId: 'hero:warden', damage: 2, sourceId: boss(s).id });
    expect(legalActions(s, content)).toEqual([
      { type: 'fadeOut', heroId: 'hero:warden', choice: 'loseCard' },
      { type: 'fadeOut', heroId: 'hero:warden', choice: 'damage' },
    ]);
    const discard = [...hero(s, 'warden').discard];
    s = act(s, content, { type: 'fadeOut', heroId: 'hero:warden', choice: 'loseCard' });
    const lost = hero(s, 'warden').lost;
    expect(lost).toHaveLength(1);
    expect(discard).toContain(lost[0]);
    expect(hero(s, 'warden').discard).toHaveLength(discard.length - 1);
    expect(s.pending).toEqual({ kind: 'fadeOut', heroId: 'hero:herbalist', damage: 2, sourceId: boss(s).id });
    const hp = hero(s, 'herbalist').hp;
    s = act(s, content, { type: 'fadeOut', heroId: 'hero:herbalist', choice: 'damage' });
    expect(hero(s, 'herbalist').hp).toBe(hp - 2);
    expect(eventsOf(s.log, 'fadeOutResolved').map((e) => e.heroId)).toEqual(['hero:warden', 'hero:herbalist']);
    expect(s.pending?.kind).not.toBe('fadeOut');
  });

  it('«Згасання»: a hero with nothing in the discard simply takes the damage', () => {
    const s = heart();
    const hp = hero(s, 'warden').hp;
    hero(s, 'herbalist').discard = ['herbalist.x'];
    const ctx = ctxOf(s);
    const task = { t: 'fadeOut' as const, sourceId: boss(s).id, damage: 2 };
    expect(runFadeOut(ctx, task)).toBe(false);
    expect(hero(s, 'warden').hp).toBe(hp - 2);
    expect(s.pending).toEqual({ kind: 'fadeOut', heroId: 'hero:herbalist', damage: 2, sourceId: boss(s).id });
  });

  it('second phase at ≤ 50% health: Атака +1 for the rest of the scenario, even when healed', () => {
    const s = heart();
    const m = boss(s);
    const ctx = ctxOf(s);
    takeDamage(ctx, m, 9, 'test');
    expect(m.bossPhase).toBeUndefined();
    takeDamage(ctx, m, 1, 'test');
    expect(m.bossPhase).toBe(2);
    expect(eventsOf(ctx.ev, 'bossPhaseChanged')).toEqual([{ type: 'bossPhaseChanged', figureId: m.id, phase: 2 }]);
    expect(monsterStats(ctx, m).attack).toBe(4);
    healFigure(ctx, m, 10);
    expect(m.hp).toBe(20);
    expect(monsterStats(ctx, m).attack).toBe(4);
    s.behaviourDecks['shadowhand']!.current = 'boss.shadowhand.88';
    expect(figureSteps(ctx, m)[1]).toMatchObject({ type: 'attack', value: 5, range: 3, conditions: ['wound'] });
  });
});
