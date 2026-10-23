// One debug game: setup, current state, the action list (for «copy log» and replay) and the
// event log. Every change goes through the rules engine; the UI never edits state itself.

import { apply, createGame } from '../../rules/engine';
import { loadContent, type LoadedContent } from '../../rules/load';
import { legalActionResults } from '../../rules/queries';
import type { Action, GameEvent, GameSetup, GameState } from '../../rules/state';

export interface LogEntry {
  /** Index of the action in `actions` that produced these events; -1 = game setup. */
  action: number;
  events: GameEvent[];
  /** State right after the action, used to name figures that may be gone later. */
  state: GameState;
  /** Who was asked before the action (names the actor of step choices). */
  actorId: string | null;
}

export interface LegalOption {
  action: Action;
  state: GameState;
  events: GameEvent[];
}

export class Session {
  readonly content: LoadedContent = loadContent();
  state: GameState;
  readonly actions: Action[] = [];
  readonly log: LogEntry[] = [];
  lastError: string | null = null;
  private legalCache: { state: GameState; list: LegalOption[] } | null = null;

  constructor(readonly setup: GameSetup) {
    this.state = createGame(setup, this.content);
    this.log.push({ action: -1, events: [...this.state.log], state: this.state, actorId: null });
  }

  /** Every action the engine accepts now, with its result (cached per state). */
  legal(): LegalOption[] {
    if (this.legalCache?.state !== this.state) {
      this.legalCache = { state: this.state, list: legalActionResults(this.state, this.content) };
    }
    return this.legalCache.list;
  }

  /** Applies an action; returns the error text or null. */
  act(action: Action): string | null {
    const r = apply(this.state, action, this.content);
    if (!r.ok) {
      this.lastError = r.error;
      return r.error;
    }
    this.lastError = null;
    const p = this.state.pending;
    const actorId = p && 'heroId' in p ? p.heroId : null;
    this.actions.push(action);
    this.state = r.state;
    this.log.push({ action: this.actions.length - 1, events: r.events, state: r.state, actorId });
    return null;
  }

  /** Bug-report JSON: enough to rebuild the game with `replay(setup, actions)`. */
  exportJson(): string {
    return JSON.stringify(
      {
        app: 'vidvazhni-debug',
        version: 1,
        seed: this.setup.seed,
        setup: this.setup,
        actions: this.actions,
        round: this.state.round,
        phase: this.state.phase,
        pending: this.state.pending,
        lastError: this.lastError,
      },
      null,
      1,
    );
  }

  /** Rebuilds a session from exported JSON (actions applied one by one). */
  static fromJson(text: string): Session {
    const data = JSON.parse(text) as { setup: GameSetup; actions: Action[] };
    const s = new Session(data.setup);
    for (const a of data.actions) {
      const err = s.act(a);
      if (err) throw new Error(`replay stopped at action ${s.actions.length}: ${err}`);
    }
    return s;
  }
}
