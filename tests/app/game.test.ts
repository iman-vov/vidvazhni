import { describe, expect, it } from 'vitest';
import { GameController, MAX_INTENTS, toggleIntent, type PlayerInfo } from '../../src/app/game';
import { SettingsStore } from '../../src/app/settings';
import { gameStorage, memoryStore, GAME_KEY } from '../../src/app/storage';
import { applyScenarioResult, newCampaign } from '../../src/rules/campaign';
import { loadContent } from '../../src/rules/load';
import type { Action, GameSetup } from '../../src/rules/state';
import { BASE_RULES } from '../../src/rules/variants';
import baseWin from './fixtures/s1-base-ui.json';
import forkWin from './fixtures/s1-fork-ui.json';

const content = loadContent();
const players: PlayerInfo[] = [
  { id: 'p1', name: 'Оля' },
  { id: 'p2', name: 'Тато' },
];

function setup(): GameSetup {
  return {
    scenarioId: 's1',
    seed: 12345,
    heroes: [
      { classId: 'warden', playerId: 'p1', level: 1 },
      { classId: 'wind-archer', playerId: 'p2', level: 1 },
    ],
    difficulty: 'normal',
    variants: { ...BASE_RULES },
  };
}

describe('GameController', () => {
  it('saves after every action and restores the same state from the log', () => {
    const kv = memoryStore();
    const storage = gameStorage(kv);
    const g = GameController.start(setup(), players, storage, content);
    expect(storage.load()?.actions).toEqual([]);
    const p = g.state.pending;
    expect(p?.kind).toBe('chooseHandBeforeScenario');
    const hand = g.legalOf('chooseHand')[0] as Action;
    expect(g.act(hand).ok).toBe(true);
    expect(storage.load()?.actions).toHaveLength(1);

    const back = GameController.restore(storage.load()!, storage, content);
    expect(back.restoreError).toBeNull();
    expect(back.state).toEqual(g.state);
    expect(back.meta.players).toEqual(players);
  });

  it('rejects illegal actions without logging them', () => {
    const storage = gameStorage(memoryStore());
    const g = GameController.start(setup(), players, storage, content);
    const r = g.act({ type: 'endTurn', heroId: 'hero:warden' });
    expect(r.ok).toBe(false);
    expect(g.actions).toHaveLength(0);
  });

  it('notifies listeners with the events of each action', () => {
    const g = GameController.start(setup(), players, null, content);
    const seen: number[] = [];
    g.onChange((events) => seen.push(events.length));
    g.act(g.legalOf('chooseHand')[0] as Action);
    expect(seen).toHaveLength(1);
  });

  it('replays the scenario-1 win played through the game UI (base rules)', () => {
    const storage = gameStorage(memoryStore());
    const saved = { app: 'vidvazhni' as const, version: 1 as const, setup: baseWin.setup as GameSetup, actions: baseWin.actions as Action[], meta: { players, intents: {}, intentsRound: 1, seenHints: [] }, savedAt: 0 };
    const g = GameController.restore(saved, storage, content);
    expect(g.restoreError).toBeNull();
    expect(g.state.phase).toBe('won');
    expect(g.over).toBe(true);
    const rewards = g.rewards();
    expect(rewards.map((r) => r.heroId)).toEqual(['hero:warden', 'hero:wind-archer']);
    // Victory bonus (4 + 2 × level 1) is in the XP; gold = coins × 2 + the scenario reward.
    for (const r of rewards) {
      expect(r.xp).toBeGreaterThanOrEqual(6);
      expect(r.gold).toBe(r.coins * 2 + (content.scenarios.s1?.reward.goldEach ?? 0));
    }
  });

  it('gives the camp a scenario result that counts once', () => {
    const meta = { players, intents: {}, intentsRound: 1, seenHints: [], campaign: true, startedAt: 777 };
    const g = GameController.restore({ app: 'vidvazhni', version: 1, setup: baseWin.setup as GameSetup, actions: baseWin.actions as Action[], meta, savedAt: 0 }, null, content);
    const r = g.scenarioResult();
    expect(r).toMatchObject({ id: '777', scenarioId: 's1', won: true });
    expect(r.heroes.map((x) => x.classId)).toEqual(['warden', 'wind-archer']);
    const camp = newCampaign(content, { players: ['p1', 'p2'], heroes: [{ classId: 'warden', playerId: 'p1' }, { classId: 'wind-archer', playerId: 'p2' }] });
    const once = applyScenarioResult(content, camp, r);
    expect(once.ok && once.state.completed).toEqual(['s1']);
    expect(once.ok && applyScenarioResult(content, once.state, r).ok).toBe(false);
  });

  it('replays the scenario-1 win played through the game UI (full fork, items, Порив)', () => {
    const saved = { app: 'vidvazhni' as const, version: 1 as const, setup: forkWin.setup as GameSetup, actions: forkWin.actions as Action[], meta: { players, intents: {}, intentsRound: 1, seenHints: [] }, savedAt: 0 };
    const g = GameController.restore(saved, null, content);
    expect(g.restoreError).toBeNull();
    expect(g.state.phase).toBe('won');
    expect(forkWin.actions.some((a) => a.type === 'surge')).toBe(true);
    expect(forkWin.actions.some((a) => a.type === 'useItem')).toBe(true);
  });

  it('undo goes back to the start of the half', () => {
    const g = GameController.start(setup(), players, null, content);
    for (const a of baseWin.actions.slice(0, 4) as Action[]) expect(g.act(a).ok).toBe(true);
    expect(g.state.pending?.kind).toBe('stepChoice');
    expect(g.canUndo()).toBe(true);
    expect(g.undo().ok).toBe(true);
    expect(g.state.pending?.kind).toBe('heroTurn');
    expect(g.actions.at(-1)).toEqual({ type: 'undo' });
    // The log with the undo still replays.
    const back = GameController.restore(g.toSaved(), null, content);
    expect(back.state.pending).toEqual(g.state.pending);
  });

  it('keeps intent tokens for the current round only', () => {
    const g = GameController.start(setup(), players, null, content);
    g.setIntents('hero:warden', ['attack', 'early']);
    expect(g.intentsOf('hero:warden')).toEqual(['attack', 'early']);
    for (const a of baseWin.actions.slice(0, 14) as Action[]) expect(g.act(a).ok).toBe(true);
    expect(g.state.round).toBe(2);
    expect(g.intentsOf('hero:warden')).toEqual([]);
  });

  it('marks rule hints once', () => {
    const g = GameController.start(setup(), players, null, content);
    expect(g.markHint('condition.poison')).toBe(true);
    expect(g.markHint('condition.poison')).toBe(false);
  });

  it('names the player of a hero', () => {
    const g = GameController.start(setup(), players, null, content);
    expect(g.playerOf('hero:wind-archer')?.name).toBe('Тато');
  });
});

describe('intent tokens', () => {
  it('«рано» and «пізно» exclude each other', () => {
    expect(toggleIntent(['attack', 'early'], 'late')).toEqual(['attack', 'late']);
  });

  it('toggles off and caps the count', () => {
    expect(toggleIntent(['attack'], 'attack')).toEqual([]);
    const full = toggleIntent(toggleIntent(toggleIntent([], 'attack'), 'heal'), 'approach');
    expect(full).toHaveLength(MAX_INTENTS);
    expect(toggleIntent(full, 'hold')).toEqual(full);
  });
});

describe('storage and settings', () => {
  it('ignores a broken or foreign save', () => {
    const kv = memoryStore({ [GAME_KEY]: '{not json' });
    expect(gameStorage(kv).load()).toBeNull();
    kv.set(GAME_KEY, JSON.stringify({ app: 'other', version: 1, actions: [] }));
    expect(gameStorage(kv).load()).toBeNull();
  });

  it('stores volumes and hint levels per hero', () => {
    const kv = memoryStore();
    const a = new SettingsStore(kv);
    expect(a.hintLevel('warden')).toBe(0);
    a.setHint('warden', 2);
    a.setVolume('music', 1.7);
    const b = new SettingsStore(kv);
    expect(b.hintLevel('warden')).toBe(2);
    expect(b.hintLevel('wind-archer')).toBe(0);
    expect(b.get().volume.music).toBe(1);
  });
});
