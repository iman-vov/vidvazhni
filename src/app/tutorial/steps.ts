// What the tutorial coach says and when. No DOM here: the coach hands every step a context with the
// game state, the last events and a few probes of the screen (is the curtain up, how many cards are
// picked…), so the order of the steps is tested in node. The engine is never bypassed; a step only
// waits for the player to do the thing it explains, and steps the player has already passed by
// doing something else are skipped.

import { areAdjacent } from '../../rules/hex';
import type { GameEvent, GameState, HeroState } from '../../rules/state';
import { t } from '../../ui/i18n';
import { modifierLabel } from '../../ui/game/text';

/** What the coach can look at on screen (implemented by the coach with querySelector). */
export interface ScreenProbe {
  has(selector: string): boolean;
  count(selector: string): number;
}

export interface CoachContext {
  s: GameState;
  heroId: string;
  /** Events since the coach started, newest last. */
  events: readonly GameEvent[];
  /** Events of the latest batch only. */
  latest: readonly GameEvent[];
  screen: ScreenProbe;
  /** Ids of info steps and tips the player has acknowledged. */
  acked: ReadonlySet<string>;
}

/** Where the coach points: a screen element (first match, optionally by its text) or a board spot. */
export type CoachTarget = { selector: string; text?: string; all?: boolean } | { hex: [number, number] } | { figure: string } | null;

export interface CoachStep {
  id: string;
  /** Info steps show «Далі» and are done when acknowledged (or passed by). */
  info?: boolean;
  /** The step is on now (its bubble shows). */
  when: (c: CoachContext) => boolean;
  /** The player did it, or the game went past it. */
  done: (c: CoachContext) => boolean;
  target?: (c: CoachContext) => CoachTarget;
  params?: (c: CoachContext) => Record<string, string | number>;
}

export const SEL = {
  intro: '.gmodal .gbtn-primary',
  introOpen: '.gmodal .gintro',
  curtain: '.gcurtain',
  hand: '.gsel-hand',
  bonusCard: '.gsel-hand .gcard:has(.gbonus.is-on)',
  suggested: '.gsel-hand [data-card="warden.shield-bash"]:not(.is-lifted), .gsel-hand [data-card="warden.earth-strike"]:not(.is-lifted)',
  picked: '.gsel-slots .gcc',
  leadingSet: '.gsel-slot.is-lead .gcc',
  leadButton: '.gsel-slots .gsel-lead[data-card="warden.shield-bash"]',
  anyLeadButton: '.gsel-slots .gsel-lead',
  ready: '.gsel-foot .ubtn.is-go',
  longRest: '.gsel-foot .ubtn:not(.is-go)',
  ribbon: '.gtop .gini',
  monsterEntry: '.gtop .gini.is-monster',
  figureCard: '.gfig',
  /** Windows the player opened to read; the coach steps aside while one is open. */
  reading: '.gfig, .gmodal.is-card, .hpop',
  currentEntry: '.gtop .gini.is-current',
  moveHalf: '.gpanel-turn [data-card="warden.shield-bash"] .gcard-bottom',
  attackHalf: '.gpanel-turn [data-card="warden.earth-strike"] .gcard-top',
  anyBottom: '.gpanel-turn .gcard-bottom:not(:disabled)',
  anyTop: '.gpanel-turn .gcard-top:not(:disabled)',
  endTurn: '.gpanel-turn .gb-right',
  doStep: '.gturn-left .gbtn-primary',
  bonus: '.gpanel-turn .gbonus.is-now, .gpanel-turn .gbonus.is-on',
  surge: '.gbtn-glow',
  sheet: '.gbottom .gsheet',
  shortRestNo: '.gbottom .gsheet-row .gbtn:not(.gbtn-primary)',
  right: '.gright-wrap',
  left: '.gleft-wrap',
  bottom: '.gbottom',
} as const;

const hero = (c: CoachContext) => c.s.figures[c.heroId] as HeroState | undefined;
const pending = (c: CoachContext) => c.s.pending;
const selecting = (c: CoachContext) => pending(c)?.kind === 'selectCards';
const ownTurn = (c: CoachContext) => {
  const p = pending(c);
  return !!p && (p.kind === 'heroTurn' || p.kind === 'stepChoice') && p.heroId === c.heroId;
};
const played = (c: CoachContext) => hero(c)?.playedThisTurn.length ?? 0;
const stepChoiceOf = (c: CoachContext, type: string) => {
  const p = pending(c);
  return p?.kind === 'stepChoice' && p.heroId === c.heroId && p.step.type === type;
};
const firstRound = (c: CoachContext) => c.s.round === 1;
const cellarClosed = (c: CoachContext) => !c.events.some((e) => e.type === 'roomRevealed' && e.roomId === 's0.cellar');
const noMonsters = (c: CoachContext) => !Object.values(c.s.figures).some((f) => f.kind === 'monster');
const overlayOpen = (c: CoachContext) => c.screen.has(SEL.introOpen) || c.screen.has(SEL.curtain);
const button = (key: string) => () => ({ button: t(key) });

/** The guided first round, then free play. */
export const SCRIPT: readonly CoachStep[] = [
  { id: 'welcome', info: true, when: () => true, done: (c) => c.acked.has('welcome') || c.s.round > 1 },
  { id: 'intro', when: (c) => c.screen.has(SEL.introOpen), done: (c) => !c.screen.has(SEL.introOpen), target: () => ({ selector: SEL.intro }), params: button('game.begin') },
  { id: 'curtain', when: (c) => c.screen.has(SEL.curtain), done: (c) => !c.screen.has(SEL.curtain) || !firstRound(c), target: () => ({ selector: SEL.curtain }) },
  { id: 'hand', when: (c) => selecting(c) && !overlayOpen(c), done: (c) => !firstRound(c) || !selecting(c) || c.screen.count(SEL.picked) >= 2, target: (c) => (c.screen.has(SEL.suggested) ? { selector: SEL.suggested, all: true } : { selector: SEL.hand }) },
  {
    id: 'leading',
    info: true,
    when: (c) => selecting(c) && c.screen.count(SEL.picked) >= 2,
    done: (c) => c.acked.has('leading') || !firstRound(c) || !selecting(c),
    target: (c) => ({ selector: c.screen.has(SEL.leadingSet) ? SEL.leadingSet : SEL.anyLeadButton }),
    params: button('game.makeLeading'),
  },
  { id: 'ready', when: (c) => selecting(c) && c.screen.has(SEL.leadingSet) && c.acked.has('leading'), done: (c) => !firstRound(c) || !selecting(c), target: () => ({ selector: SEL.ready }), params: button('game.ready') },
  { id: 'order', info: true, when: (c) => c.s.phase === 'turns' || ownTurn(c), done: (c) => c.acked.has('order') || !firstRound(c) || played(c) > 0, target: () => ({ selector: SEL.ribbon, all: true }) },
  { id: 'plan', info: true, when: (c) => ownTurn(c), done: (c) => c.acked.has('plan') || c.screen.has(SEL.figureCard) || !firstRound(c) || played(c) > 0 || !!c.s.half, target: () => ({ selector: SEL.monsterEntry }) },
  {
    id: 'halfMove',
    when: (c) => ownTurn(c) && !c.s.half,
    done: (c) => !firstRound(c) || played(c) > 0 || !!c.s.half,
    target: (c) => ({ selector: c.screen.has(SEL.moveHalf) ? SEL.moveHalf : SEL.anyBottom }),
  },
  {
    id: 'hex',
    when: (c) => stepChoiceOf(c, 'move'),
    done: (c) => !firstRound(c) || (!stepChoiceOf(c, 'move') && (played(c) > 0 || !c.s.half)),
    target: () => ({ hex: [2, 0] }),
    params: button('game.confirm.move'),
  },
  {
    id: 'halfAttack',
    when: (c) => ownTurn(c) && !c.s.half && played(c) === 1,
    done: (c) => !firstRound(c) || played(c) >= 2 || (!!c.s.half && played(c) >= 1) || !ownTurn(c),
    target: (c) => ({ selector: c.screen.has(SEL.attackHalf) ? SEL.attackHalf : SEL.anyTop }),
  },
  {
    id: 'target',
    when: (c) => stepChoiceOf(c, 'attack'),
    done: (c) => !firstRound(c) || (!stepChoiceOf(c, 'attack') && (played(c) >= 2 || c.events.some((e) => e.type === 'attacked'))),
    target: (c) => {
      const p = pending(c);
      const me = hero(c);
      const foe = me && p?.kind === 'stepChoice' ? Object.values(c.s.figures).find((f) => f.kind === 'monster' && areAdjacent(f.hex, me.hex)) : undefined;
      return foe ? { figure: foe.id } : null;
    },
    params: button('game.confirm.attack'),
  },
  {
    id: 'infuse',
    when: (c) => stepChoiceOf(c, 'infuse'),
    done: (c) => !firstRound(c) || (!stepChoiceOf(c, 'infuse') && (played(c) >= 2 || c.events.some((e) => e.type === 'orbInfused'))),
    target: () => ({ selector: SEL.doStep }),
    params: button('game.do'),
  },
  {
    id: 'endTurn',
    when: (c) => ownTurn(c) && !c.s.half && played(c) >= 2,
    done: (c) => !firstRound(c) || (!ownTurn(c) && played(c) === 0) || c.events.some((e) => e.type === 'turnEnded' && e.figureId === c.heroId),
    target: () => ({ selector: SEL.endTurn }),
    params: button('ui.endTurn'),
  },
  {
    id: 'round2',
    when: (c) => selecting(c) && c.s.round >= 2 && !overlayOpen(c),
    done: (c) => c.s.round >= 3 || (c.s.round >= 2 && !selecting(c)),
    target: (c) => (c.screen.has(SEL.bonusCard) ? { selector: SEL.bonusCard, all: true } : { selector: SEL.hand }),
  },
  { id: 'free', info: true, when: (c) => c.s.round >= 2 && (c.s.phase === 'turns' || ownTurn(c)), done: (c) => c.acked.has('free') },
];

const lastAttackBy = (c: CoachContext, by: 'hero' | 'monster') =>
  [...c.latest].reverse().find((e): e is Extract<GameEvent, { type: 'attacked' }> => e.type === 'attacked' && e.attackerId.startsWith(by));

/** Tips that come up once when their rule first appears (they go before the script). */
export const TIPS: readonly CoachStep[] = [
  {
    id: 'modifier',
    info: true,
    when: (c) => c.events.some((e) => e.type === 'attacked' && e.attackerId === c.heroId),
    done: (c) => c.acked.has('modifier'),
    params: (c) => {
      const e = c.events.find((x): x is Extract<GameEvent, { type: 'attacked' }> => x.type === 'attacked' && x.attackerId === c.heroId);
      return { mod: e ? modifierLabel(e.chosen) : '', damage: e?.damage ?? 0 };
    },
  },
  { id: 'orb', info: true, when: (c) => c.events.some((e) => e.type === 'orbInfused'), done: (c) => c.acked.has('orb'), target: () => ({ selector: SEL.right }) },
  { id: 'momentum', info: true, when: (c) => c.events.some((e) => e.type === 'momentumGained'), done: (c) => c.acked.has('momentum'), target: () => ({ selector: SEL.left }) },
  { id: 'monsters', info: true, when: (c) => !!lastAttackBy(c, 'monster') || c.events.some((e) => e.type === 'turnStarted' && e.figureId.startsWith('monster')), done: (c) => c.acked.has('monsters'), target: () => ({ selector: SEL.currentEntry }) },
  { id: 'avoid', when: (c) => pending(c)?.kind === 'avoidDamage', done: (c) => c.acked.has('avoid'), target: () => ({ selector: SEL.bottom, text: t('ui.takeDamage') }), params: button('ui.takeDamage') },
  { id: 'shortRest', when: (c) => pending(c)?.kind === 'endOfRound', done: (c) => c.acked.has('shortRest'), target: () => ({ selector: SEL.shortRestNo }), params: button('game.shortRest.no') },
  { id: 'consume', info: true, when: (c) => ownTurn(c) && c.screen.has(SEL.bonus), done: (c) => c.acked.has('consume'), target: () => ({ selector: SEL.bonus }) },
  { id: 'surge', when: (c) => ownTurn(c) && (hero(c)?.momentum ?? 0) >= 3 && c.screen.has(SEL.surge), done: (c) => c.acked.has('surge'), target: () => ({ selector: SEL.surge }), params: button('ui.useSurge') },
  {
    id: 'longRest',
    when: (c) => selecting(c) && !overlayOpen(c) && (hero(c)?.hand.length ?? 99) <= 4 && (hero(c)?.discard.length ?? 0) >= 2,
    done: (c) => c.acked.has('longRest'),
    target: () => ({ selector: SEL.longRest }),
    params: button('ui.longRest'),
  },
  { id: 'longRestLoss', when: (c) => pending(c)?.kind === 'longRestLoss', done: (c) => c.acked.has('longRestLoss'), target: () => ({ selector: SEL.bottom }) },
  { id: 'openDoor', when: (c) => ownTurn(c) && noMonsters(c) && cellarClosed(c), done: (c) => c.acked.has('openDoor') || !cellarClosed(c), target: () => ({ hex: [2, 1] }) },
  { id: 'door', info: true, when: (c) => c.events.some((e) => e.type === 'roomRevealed' && e.roomId !== 's0.yard'), done: (c) => c.acked.has('door') },
  { id: 'loot', info: true, when: (c) => c.events.some((e) => e.type === 'looted' && (e.coins > 0 || !!e.chest)), done: (c) => c.acked.has('loot') },
];

const TIP_ORDER = [...TIPS.filter((x) => !x.info), ...TIPS.filter((x) => x.info)];

/** Action tips (no «Далі») count as seen once their moment has passed. */
const ACTION_TIPS_PASS: Record<string, (c: CoachContext) => boolean> = {
  avoid: (c) => pending(c)?.kind !== 'avoidDamage',
  shortRest: (c) => pending(c)?.kind !== 'endOfRound',
  surge: (c) => !ownTurn(c) || (hero(c)?.momentum ?? 0) < 3,
  longRest: (c) => !selecting(c),
  longRestLoss: (c) => pending(c)?.kind !== 'longRestLoss',
  openDoor: (c) => !cellarClosed(c),
};

export interface CoachView {
  step: CoachStep;
  /** The step is a tip (not part of the script). */
  tip: boolean;
}

/** Tracks the script position and the tips seen; `update` returns what to show now. */
export class CoachScript {
  private index = 0;
  private readonly seenTips = new Set<string>();
  private readonly shownTips = new Set<string>();
  readonly acked = new Set<string>();

  get position(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= SCRIPT.length;
  }

  ack(id: string): void {
    this.acked.add(id);
  }

  update(c: Omit<CoachContext, 'acked'>): CoachView | null {
    const ctx: CoachContext = { ...c, acked: this.acked };
    // Tips that wait for a decision go before explanations.
    for (const tip of TIP_ORDER) {
      if (this.seenTips.has(tip.id)) continue;
      if (this.shownTips.has(tip.id) && ACTION_TIPS_PASS[tip.id]?.(ctx)) {
        this.seenTips.add(tip.id);
        continue;
      }
      if (tip.done(ctx)) {
        this.seenTips.add(tip.id);
        continue;
      }
      // Explanations wait until the player has finished choosing a hex or a target.
      if (tip.info && ctx.s.pending?.kind === 'stepChoice') continue;
      if (tip.when(ctx)) {
        this.shownTips.add(tip.id);
        return { step: tip, tip: true };
      }
    }
    while (this.index < SCRIPT.length && (SCRIPT[this.index] as CoachStep).done(ctx)) this.index++;
    const step = SCRIPT[this.index];
    return step && step.when(ctx) ? { step, tip: false } : null;
  }
}
