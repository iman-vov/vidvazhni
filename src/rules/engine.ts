// Public API of the rules engine. Pure: (state, action) → new state + events.
// `apply` works on a deep copy; monster turns between hero turns resolve automatically inside.

import type { Content } from './content';
import { resolveAvoidDamage } from './damage';
import type { Ctx } from './effects/context';
import { chooseHand, declareLongRest, revealIfReady, selectCards } from './round';
import { longRestLoss, shortRest, shortRestReroll } from './rest';
import { createGame as buildGame } from './setup';
import type { Action, ApplyResult, GameSetup, GameState } from './state';
import { endTurn, resolveStep, reviveAlly, run, skipStep, startHalf, surge } from './turn';
import { useItem } from './items';

/** Builds the initial state: start room revealed, monsters spawned, decks shuffled with the seed,
 *  phase `selectCards` (or `chooseHandBeforeScenario` when a hand is smaller than the deck). */
export function createGame(setup: GameSetup, content: Content): GameState {
  return buildGame(setup, content);
}

/** Applies one player action. Monster turns between hero turns resolve automatically inside. */
export function apply(state: GameState, action: Action, content: Content): ApplyResult {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, error: 'scenario is over' };
  if (action.type === 'undo') return undo(state);
  const s = structuredClone(state);
  const ctx: Ctx = { s, c: content, ev: [], out: [] };
  let error: string | null;
  try {
    error = dispatch(ctx, action);
    if (!error) {
      s.queue = [...ctx.out, ...(s.queue ?? [])];
      ctx.out = [];
      run(ctx);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (error) return { ok: false, error };
  return { ok: true, state: s, events: ctx.ev };
}

function dispatch(ctx: Ctx, action: Exclude<Action, { type: 'undo' }>): string | null {
  switch (action.type) {
    case 'chooseHand':
      return chooseHand(ctx, action.heroId, action.cards);
    case 'selectCards': {
      const err = selectCards(ctx, action.heroId, action.cards, action.leading);
      if (!err) revealIfReady(ctx);
      return err;
    }
    case 'declareLongRest': {
      const err = declareLongRest(ctx, action.heroId);
      if (!err) revealIfReady(ctx);
      return err;
    }
    case 'startHalf':
      return startHalf(ctx, action.heroId, action.cardId, action.half, !!action.basic);
    case 'resolveStep':
      return resolveStep(ctx, action.choice);
    case 'skipStep':
      return skipStep(ctx);
    case 'endTurn':
      return endTurn(ctx, action.heroId);
    case 'longRestLoss':
      return longRestLoss(ctx, action.heroId, action.cardId);
    case 'shortRest':
      return shortRest(ctx, action.heroId, action.rest);
    case 'shortRestReroll':
      return shortRestReroll(ctx, action.heroId, action.reroll);
    case 'avoidDamage': {
      const p = ctx.s.pending;
      if (p?.kind !== 'avoidDamage' || p.heroId !== action.heroId) return 'no damage to avoid';
      return resolveAvoidDamage(ctx, action.heroId, action.choice);
    }
    case 'surge':
      return surge(ctx, action.heroId);
    case 'reviveAlly':
      return reviveAlly(ctx, action.heroId, action.cardId, action.half, action.targetId);
    case 'useItem':
      return useItem(ctx, action.heroId, action.itemId);
  }
}

/** Back to the start of the current half, unless a modifier was drawn or a room revealed since. */
function undo(state: GameState): ApplyResult {
  const snap = state.undoPoint;
  if (!snap) return { ok: false, error: 'nothing to undo' };
  const s = structuredClone(snap);
  s.undoPoint = null;
  s.log = [...state.log, { type: 'undone' }];
  return { ok: true, state: s, events: [{ type: 'undone' }] };
}

/** Replays a game from setup + action log; used for reconnection and determinism tests. */
export function replay(setup: GameSetup, actions: Action[], content: Content): GameState {
  let state = createGame(setup, content);
  for (const action of actions) {
    const result = apply(state, action, content);
    if (!result.ok) throw new Error(`replay: ${result.error}`);
    state = result.state;
  }
  return state;
}
