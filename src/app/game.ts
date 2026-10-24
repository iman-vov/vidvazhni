// Game controller: owns the GameState of one scenario, sends every player action through the
// rules engine, keeps the action log and autosaves after each action. No DOM here, so it is
// tested in node; the scenario screen listens to it and hands the events to the board.

import { apply, createGame } from '../rules/engine';
import { coinValue } from '../rules/effects/context';
import { loadContent, type LoadedContent } from '../rules/load';
import { legalActionResults } from '../rules/queries';
import type { Action, FigureId, GameEvent, GameSetup, GameState, HeroState, Pending } from '../rules/state';
import type { GameStorage, SavedGame } from './storage';

/** Intent tokens shown to everybody while cards are chosen (design doc, «Фаза вибору карт»). */
export const INTENTS = ['attack', 'heal', 'approach', 'hold', 'rest', 'early', 'late'] as const;
export type IntentId = (typeof INTENTS)[number];
/** «піду рано» and «піду пізно» exclude each other; the rest combine freely. */
const TIMING: readonly IntentId[] = ['early', 'late'];
export const MAX_INTENTS = 3;

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface GameMeta {
  players: PlayerInfo[];
  /** Intent tokens of the current round by hero id. */
  intents: Record<FigureId, IntentId[]>;
  intentsRound: number;
  /** Rule explanations already shown (hint level 1), e.g. `condition.poison`. */
  seenHints: string[];
}

export interface ActResult {
  ok: boolean;
  events: GameEvent[];
  error?: string;
}

export interface LegalOption {
  action: Action;
  state: GameState;
  events: GameEvent[];
}

export interface HeroReward {
  heroId: FigureId;
  xp: number;
  coins: number;
  gold: number;
}

export class GameController {
  readonly content: LoadedContent;
  state: GameState;
  readonly actions: Action[] = [];
  /** Set when a saved game could only be partly replayed (the engine rejected an action). */
  restoreError: string | null = null;
  private legalCache: { state: GameState; list: LegalOption[] } | null = null;
  private readonly listeners = new Set<(events: GameEvent[]) => void>();

  constructor(
    readonly setup: GameSetup,
    readonly meta: GameMeta,
    private readonly storage: GameStorage | null,
    content?: LoadedContent,
  ) {
    this.content = content ?? loadContent();
    this.state = createGame(setup, this.content);
  }

  /** A new game; saved at once so «continue» finds it. */
  static start(setup: GameSetup, players: PlayerInfo[], storage: GameStorage | null, content?: LoadedContent): GameController {
    const g = new GameController(setup, { players, intents: {}, intentsRound: 1, seenHints: [] }, storage, content);
    g.save();
    return g;
  }

  /** Rebuilds a saved game from setup + action log. */
  static restore(saved: SavedGame, storage: GameStorage | null, content?: LoadedContent): GameController {
    const g = new GameController(saved.setup, { ...emptyMeta(), ...saved.meta }, storage, content);
    for (const action of saved.actions) {
      const r = apply(g.state, action, g.content);
      if (!r.ok) {
        g.restoreError = `${g.actions.length + 1}: ${r.error}`;
        break;
      }
      g.actions.push(action);
      g.state = r.state;
    }
    return g;
  }

  onChange(cb: (events: GameEvent[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Applies one action; on success logs it, autosaves and notifies with the events. */
  act(action: Action): ActResult {
    const r = apply(this.state, action, this.content);
    if (!r.ok) return { ok: false, events: [], error: r.error };
    this.actions.push(action);
    this.state = r.state;
    if (this.meta.intentsRound !== this.state.round) {
      this.meta.intents = {};
      this.meta.intentsRound = this.state.round;
    }
    this.save();
    for (const cb of this.listeners) cb(r.events);
    return { ok: true, events: r.events };
  }

  /** Every action the engine accepts now, with its result (cached per state). Costly during card
   *  selection (every pair is tried), so screens only ask for it during turns. */
  legal(): LegalOption[] {
    if (this.legalCache?.state !== this.state) this.legalCache = { state: this.state, list: legalActionResults(this.state, this.content) };
    return this.legalCache.list;
  }

  legalOf<T extends Action['type']>(type: T): Extract<Action, { type: T }>[] {
    return this.legal()
      .map((o) => o.action)
      .filter((a): a is Extract<Action, { type: T }> => a.type === type);
  }

  canUndo(): boolean {
    return !!this.state.undoPoint && this.state.phase !== 'won' && this.state.phase !== 'lost';
  }

  undo(): ActResult {
    return this.act({ type: 'undo' });
  }

  setIntents(heroId: FigureId, intents: IntentId[]): void {
    this.meta.intents = { ...this.meta.intents, [heroId]: normalizeIntents(intents) };
    this.save();
  }

  intentsOf(heroId: FigureId): IntentId[] {
    return this.meta.intents[heroId] ?? [];
  }

  /** Marks a rule explanation as shown; false if it was shown before. */
  markHint(key: string): boolean {
    if (this.meta.seenHints.includes(key)) return false;
    this.meta.seenHints.push(key);
    this.save();
    return true;
  }

  heroes(): HeroState[] {
    return Object.values(this.state.figures).filter((f): f is HeroState => f.kind === 'hero');
  }

  playerOf(heroId: FigureId): PlayerInfo | undefined {
    const h = this.state.figures[heroId];
    return h?.kind === 'hero' ? this.meta.players.find((p) => p.id === h.playerId) : undefined;
  }

  /** Heroes the engine waits for, in hero order. */
  pendingHeroes(): FigureId[] {
    return pendingHeroIds(this.state.pending);
  }

  get over(): boolean {
    return this.state.phase === 'won' || this.state.phase === 'lost';
  }

  /** Shop items found in chests and on enemies (to the party chest, won or lost). */
  foundItems(): string[] {
    return [...(this.state.foundItems ?? [])];
  }

  /** XP (victory bonus already added by the engine), coins and gold per hero. */
  rewards(): HeroReward[] {
    const won = this.state.phase === 'won';
    const goldEach = won ? (this.content.scenarios[this.state.scenarioId]?.reward.goldEach ?? 0) : 0;
    return this.heroes().map((h) => ({ heroId: h.id, xp: h.xp, coins: h.coins, gold: h.coins * coinValue(this.state.level) + goldEach }));
  }

  toSaved(): SavedGame {
    return { app: 'vidvazhni', version: 1, setup: this.setup, actions: [...this.actions], meta: this.meta, savedAt: Date.now() };
  }

  save(): void {
    this.storage?.save(this.toSaved());
  }

  /** Bug-report JSON (same shape the debug overlay replays). */
  exportJson(): string {
    return JSON.stringify({ app: 'vidvazhni-game', version: 1, seed: this.setup.seed, setup: this.setup, actions: this.actions, round: this.state.round, phase: this.state.phase, pending: this.state.pending }, null, 1);
  }
}

function emptyMeta(): GameMeta {
  return { players: [], intents: {}, intentsRound: 1, seenHints: [] };
}

export function pendingHeroIds(p: Pending | null): FigureId[] {
  if (!p) return [];
  if ('heroIds' in p) return p.heroIds;
  if ('heroId' in p) return [p.heroId];
  return [];
}

/** Toggles one intent: at most `MAX_INTENTS`, and only one of «рано» / «пізно». */
export function toggleIntent(list: IntentId[], id: IntentId): IntentId[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  const kept = TIMING.includes(id) ? list.filter((x) => !TIMING.includes(x)) : list;
  if (kept.length >= MAX_INTENTS) return list;
  return normalizeIntents([...kept, id]);
}

function normalizeIntents(list: IntentId[]): IntentId[] {
  const unique = INTENTS.filter((id) => list.includes(id));
  return unique.slice(0, MAX_INTENTS);
}

/** Players in hero order, each with their heroes (for the curtain: «Передай планшет: Оля»). */
export function heroesByPlayer(s: GameState): Map<string, FigureId[]> {
  const out = new Map<string, FigureId[]>();
  for (const f of Object.values(s.figures)) if (f.kind === 'hero') out.set(f.playerId, [...(out.get(f.playerId) ?? []), f.id]);
  return out;
}
