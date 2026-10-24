import { describe, expect, it } from 'vitest';
import { act, eventsOf, finishRound, rejects } from '../../helpers/engineFixtures';
import { killFigure, takeDamage } from '../../../src/rules/damage';
import { performStep } from '../../../src/rules/effects/index';
import { isDoorLocked, legalActions, previewAttack } from '../../../src/rules/queries';
import { figureSteps } from '../../../src/rules/turn';
import type { GameState } from '../../../src/rules/state';
import { clearMonsters, content, ctxOf, game, hero, monstersOf, place, reveal, selected, selectEarly, tile, untilTurn } from './helpers';

const DOOR: [number, number] = [7, 0];
const ATTACK3 = { type: 'attack', value: 3 } as const;

describe('s4 Стара сторожова вежа', () => {
  it('the door to the upper tier stays shut until a hero of the party holds the tower key', () => {
    let s = clearMonsters(reveal(game('s4'), 's4.barracks'));
    expect(tile(s, DOOR).door).toEqual({ to: 's4.upper-tier', open: false, key: 'tower-key' });
    expect(isDoorLocked(s, DOOR)).toBe(true);
    place(s, 'hero:warden', [6, 0]);
    s = untilTurn(selectEarly(s), 'warden');
    const [, b] = selected(s, 'warden');
    s = act(s, content, { type: 'startHalf', heroId: 'hero:warden', cardId: b, half: 'bottom', basic: true });
    expect(rejects(s, content, { type: 'resolveStep', choice: { path: [DOOR] } })).toBe('the door is locked');
    const moves = legalActions(s, content).filter((a) => a.type === 'resolveStep' && a.choice.path?.some((h) => h[0] === 7 && h[1] === 0));
    expect(moves).toEqual([]);

    // The key held by any hero of the party opens it.
    hero(s, 'herbalist').questItems = ['tower-key'];
    expect(isDoorLocked(s, DOOR)).toBe(false);
    const t = act(s, content, { type: 'resolveStep', choice: { path: [DOOR] } });
    expect(t.board.revealedRooms).toContain('s4.upper-tier');
    expect(tile(t, DOOR).door?.open).toBe(true);
  });

  it('the last cultist of the barracks to die drops the key on its hex; a hero ending the turn there takes it', () => {
    let s = clearMonsters(reveal(game('s4'), 's4.barracks'), 'stone-sentinel');
    const cultists = monstersOf(s, 'gloom-cultist');
    expect(cultists).toHaveLength(2);
    expect(cultists.every((c) => c.room === 's4.barracks')).toBe(true);
    const [first, last] = cultists as [(typeof cultists)[0], (typeof cultists)[0]];
    const ctx = ctxOf(s);
    killFigure(ctx, first);
    expect(eventsOf(ctx.ev, 'questItemDropped')).toEqual([]);
    killFigure(ctx, last);
    expect(eventsOf(ctx.ev, 'questItemDropped')).toEqual([{ type: 'questItemDropped', item: 'tower-key', hex: last.hex, byId: last.id }]);
    expect(tile(s, last.hex).questItems).toEqual(['tower-key']);

    place(s, 'hero:warden', last.hex);
    s = finishRound(selectEarly(s), content);
    expect(hero(s, 'warden').questItems).toEqual(['tower-key']);
    expect(tile(s, last.hex).questItems).toBeUndefined();
    expect(s.log.some((e) => e.type === 'looted' && e.questItems?.includes('tower-key'))).toBe(true);
  });

  it('a cultist on a rune has Shield 1; off the rune, or another monster on it, has none', () => {
    const s = clearMonsters(reveal(game('s4'), 's4.barracks'), 'stone-sentinel');
    const [c] = monstersOf(s, 'gloom-cultist');
    place(s, c!.id, [5, -1]);
    expect(tile(s, [5, -1]).object?.kind).toBe('rune');
    place(s, 'hero:warden', [4, -1]);
    expect(previewAttack(s, 'hero:warden', c!.id, content, ATTACK3)).toMatchObject({ shield: 1, damage: 2 });
    place(s, c!.id, [5, 0]);
    expect(previewAttack(s, 'hero:warden', c!.id, content, ATTACK3)).toMatchObject({ shield: 0, damage: 3 });
    const sentinelGame = reveal(game('s4'), 's4.barracks');
    const sentinel = monstersOf(sentinelGame, 'stone-sentinel')[0]!;
    const plain = previewAttack(sentinelGame, 'hero:warden', sentinel.id, content, ATTACK3)!.shield;
    place(sentinelGame, sentinel.id, [5, -1]);
    place(sentinelGame, 'hero:warden', [4, -1]);
    expect(previewAttack(sentinelGame, 'hero:warden', sentinel.id, content, ATTACK3)!.shield).toBe(plain);
  });

  it('the chest on the upper tier gives the Lantern piece; carried back to the entrance it wins', () => {
    let s = clearMonsters(reveal(game('s4'), 's4.barracks', 's4.upper-tier'));
    place(s, 'hero:warden', [11, -5]);
    s = finishRound(selectEarly(s), content);
    expect(hero(s, 'warden').questItems).toEqual(['lantern-shard-2']);
    expect(hero(s, 'warden').chests).toEqual(['s4.lantern-shard']);
    expect(s.phase).toBe('selectCards');
    place(s, 'hero:warden', [1, 2]);
    s = finishRound(selectEarly(s), content);
    expect(s.phase).toBe('won');
  });

  it('an exhausted carrier drops the piece on its hex; another hero can pick it up', () => {
    let s = clearMonsters(reveal(game('s4'), 's4.barracks', 's4.upper-tier'));
    hero(s, 'warden').questItems = ['lantern-shard-2'];
    place(s, 'hero:warden', [5, 0]);
    const ctx = ctxOf(s);
    takeDamage(ctx, hero(s, 'warden'), 100, 'test');
    expect(hero(s, 'warden').exhausted).toBe(true);
    expect(hero(s, 'warden').questItems).toEqual([]);
    expect(eventsOf(ctx.ev, 'questItemDropped')).toEqual([{ type: 'questItemDropped', item: 'lantern-shard-2', hex: [5, 0], byId: 'hero:warden' }]);
    expect(tile(s, [5, 0]).questItems).toEqual(['lantern-shard-2']);

    s.pending = { kind: 'selectCards', heroIds: ['hero:herbalist'] };
    place(s, 'hero:herbalist', [5, 0]);
    s = finishRound(selectEarly(s), content);
    expect(hero(s, 'herbalist').questItems).toEqual(['lantern-shard-2']);
  });

  it('«поглинути Темряву: Прокляття»: a cultist with Darkness about curses its target', () => {
    const s = reveal(game('s4'), 's4.barracks');
    const [c] = monstersOf(s, 'gloom-cultist');
    s.behaviourDecks['gloom-cultist']!.current = 'caster.48';
    expect(figureSteps(ctxOf(s), c!)).toEqual([{ type: 'attack', value: 3, range: 3, consume: { element: 'dark', curse: true } }]);
    s.elements.dark = 'strong';
    expect(figureSteps(ctxOf(s), c!)[0]).toMatchObject({ type: 'attack', value: 3, curse: true });
  });

  it('a cultist keeps at most one summoned wraith at a time', () => {
    const s = clearMonsters(reveal(game('s4'), 's4.barracks'), 'stone-sentinel');
    const [c] = monstersOf(s, 'gloom-cultist');
    const ctx = ctxOf(s);
    const step = { type: 'summon', summon: 'shadow-wraith', rank: 'normal' } as const;
    expect(performStep(ctx, c!, step, {})).toBeNull();
    expect(performStep(ctx, c!, step, {})).toBeNull();
    const wraiths = monstersOf(s, 'shadow-wraith');
    expect(wraiths).toHaveLength(1);
    expect(wraiths[0]).toMatchObject({ summonerId: c!.id, summonedRound: 1 });
  });
});
