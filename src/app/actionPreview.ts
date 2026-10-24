// What a non-attack step would do, for the board's target marks and the step box: the engine plays
// each legal choice on a copy of the state and the events up to the end of the turn tell who is
// healed, shielded, buffed or pushed and by how much («Травниця: 5 » 8»). Attacks keep their own
// preview (expected damage); moves have paths.

import type { ConditionId, Content, Step } from '../rules/content';
import { apply } from '../rules/engine';
import type { FigureId, GameEvent, GameState, StepChoice } from '../rules/state';
import type { IconName } from '../ui/icons/names';

export type PreviewTone = 'ally' | 'enemy';

export interface FigurePreview {
  /** Short label over the figure: «5 » 8», «+2», «» (icons only). */
  text: string;
  icon: IconName;
  hpBefore: number;
  hpAfter: number;
  shield: number;
  conditions: ConditionId[];
  removed: ConditionId[];
  pushed: number;
}

export interface ActionPreview {
  tone: PreviewTone;
  /** Figures the step reaches: every valid target for a chosen one, the affected ones otherwise. */
  targets: FigureId[];
  /** The step's reach around the hero, when it reaches further than the hero's own hex. */
  range: number;
  /** Result per figure, for the choice that targets it (or the only choice). */
  results: Record<FigureId, FigurePreview>;
}

/** Steps whose targets are shown green/red with a result instead of an attack's damage. */
const PREVIEWED: ReadonlySet<Step['type']> = new Set(['heal', 'shield', 'condition', 'bless', 'push', 'pull', 'retaliate', 'provoke', 'active', 'special', 'infuse']);

export function previewsStep(step: Step): boolean {
  return PREVIEWED.has(step.type);
}

function stepRange(step: Step): number {
  switch (step.type) {
    case 'heal':
      return step.radius ?? step.range ?? (step.target === 'ally' || step.target === 'allyOrSelf' ? 1 : 0);
    case 'shield':
    case 'bless':
      return step.range ?? (step.target === 'ally' || step.target === 'allyOrSelf' ? 1 : 0);
    case 'condition':
      return step.radius ?? step.range ?? (step.target === 'self' ? 0 : 1);
    case 'pull':
      return step.range ?? 1;
    case 'push':
      return 1;
    case 'provoke':
      return step.radius;
    default:
      return 0;
  }
}

/** Events of the step itself: everything before the turn moves on. */
function ownEvents(events: GameEvent[]): GameEvent[] {
  const end = events.findIndex((e) => e.type === 'turnEnded' || e.type === 'turnStarted');
  return end < 0 ? events : events.slice(0, end);
}

function blank(state: GameState, id: FigureId): FigurePreview {
  const hp = state.figures[id]?.hp ?? 0;
  return { text: '', icon: 'hp', hpBefore: hp, hpAfter: hp, shield: 0, conditions: [], removed: [], pushed: 0 };
}

function collect(state: GameState, events: GameEvent[], out: Map<FigureId, FigurePreview>): void {
  const of = (id: FigureId): FigurePreview | null => {
    const f = state.figures[id];
    if (!f) return null;
    let p = out.get(id);
    if (!p) out.set(id, (p = blank(state, id)));
    return p;
  };
  for (const e of ownEvents(events)) {
    if (e.type === 'healed') {
      const p = of(e.figureId);
      if (p) {
        p.hpAfter += e.amount;
        p.removed.push(...e.removed);
      }
    } else if (e.type === 'shieldAdded') {
      const p = of(e.figureId);
      if (p) p.shield += e.value;
    } else if (e.type === 'conditionAdded') {
      const p = of(e.figureId);
      if (p && !p.conditions.includes(e.condition)) p.conditions.push(e.condition);
    } else if (e.type === 'conditionRemoved') {
      const p = of(e.figureId);
      if (p && !p.removed.includes(e.condition)) p.removed.push(e.condition);
    } else if (e.type === 'pushed') {
      const p = of(e.figureId);
      if (p) p.pushed += e.path.length;
    }
  }
}

function label(p: FigurePreview, step: Step): void {
  if (p.hpAfter !== p.hpBefore) {
    p.text = `${p.hpBefore} » ${p.hpAfter}`;
    p.icon = 'heal';
  } else if (p.shield) {
    p.text = `+${p.shield}`;
    p.icon = 'shield';
  } else if (p.pushed) {
    p.text = String(p.pushed);
    p.icon = step.type === 'pull' ? 'pull' : 'push';
  } else if (p.removed.length) {
    p.text = '';
    p.icon = 'check';
  } else {
    p.text = '';
    p.icon = step.type === 'bless' ? 'bless' : step.type === 'heal' ? 'heal' : step.type === 'shield' ? 'shield' : (p.conditions[0] as IconName | undefined) ?? 'special';
  }
}

/**
 * Plays every choice of the step on a copy of the state. `choices` are the legal ones the step box
 * offers now (after the consume / element filters). Null for steps without such a preview.
 */
export function previewAction(state: GameState, content: Content, heroId: FigureId, step: Step, choices: readonly StepChoice[]): ActionPreview | null {
  if (!previewsStep(step) || choices.length === 0) return null;
  const hero = state.figures[heroId];
  if (!hero) return null;
  const results = new Map<FigureId, FigurePreview>();
  const valid = new Set<FigureId>();
  for (const choice of choices) {
    if (choice.targets && choice.targets.length !== 1) continue;
    const r = apply(state, { type: 'resolveStep', choice }, content);
    if (!r.ok) continue;
    const got = new Map<FigureId, FigurePreview>();
    collect(state, r.events, got);
    for (const [id, p] of got) if (!results.has(id)) results.set(id, p);
    const chosen = choice.targets?.[0];
    if (chosen) {
      valid.add(chosen);
      if (!results.has(chosen)) results.set(chosen, blank(state, chosen));
    }
    else for (const id of got.keys()) valid.add(id);
  }
  // Buffs with no event of their own (retaliate, provoke, an active bonus) land on the hero.
  if (valid.size === 0 && !choices.some((c) => c.targets)) {
    valid.add(heroId);
    results.set(heroId, blank(state, heroId));
  }
  for (const p of results.values()) label(p, step);
  const targets = [...valid].filter((id) => state.figures[id]);
  const enemy = (id: FigureId) => {
    const f = state.figures[id];
    return !!f && (f.kind === 'monster') !== (hero.kind === 'monster');
  };
  const tone: PreviewTone = targets.some(enemy) ? 'enemy' : 'ally';
  const out: Record<FigureId, FigurePreview> = {};
  for (const id of targets) {
    const p = results.get(id);
    if (p) out[id] = p;
  }
  return { tone, targets, range: stepRange(step), results: out };
}
