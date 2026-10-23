// Turns the legal choices for the pending step into something a person can tap: move
// destinations, targets, area anchors with a rotation, element and consume toggles.
// Every choice it returns comes from `legalActions`, so the engine has already accepted it.

import type { Step } from '../../rules/content';
import { areaHexes } from '../../rules/geometry';
import { hexKey, type Hex } from '../../rules/hex';
import type { GameState, StepChoice } from '../../rules/state';

export interface StepSelection {
  consume: boolean;
  /** Key of the chosen element(s) for `any` infuse/consume choices. */
  elementKey: string | null;
  targets: string[];
  hex: Hex | null;
  direction: number | null;
}

export function emptySelection(): StepSelection {
  return { consume: false, elementKey: null, targets: [], hex: null, direction: null };
}

export type StepMode = 'path' | 'targets' | 'area' | 'hex' | 'plain';

export interface StepModel {
  mode: StepMode;
  /** True when the same step can be played with and without its consume bonus. */
  consumeToggle: boolean;
  elementKeys: string[];
  elementKey: string | null;
  /** Choices left after the consume/element filters. */
  choices: StepChoice[];
  highlights: Hex[];
  /** Figure ids that can be targeted (targets mode). */
  targetIds: string[];
  maxTargets: number;
  /** Area mode: directions available for the selected anchor, and the hexes the area covers. */
  directions: number[];
  areaPreview: Hex[];
  /** Choice ready to confirm (targets set matches, area anchor + direction chosen). */
  ready: StepChoice | null;
}

export function elementKeyOf(c: StepChoice): string {
  return c.elements?.join('+') ?? c.element ?? '';
}

function modeOf(c: StepChoice, step: Step): StepMode {
  if (c.path) return 'path';
  if (c.targets) return 'targets';
  if (c.hex && step.type === 'attack') return 'area';
  if (c.hex) return 'hex';
  return 'plain';
}

export function stepModel(s: GameState, step: Step, all: StepChoice[], sel: StepSelection): StepModel {
  const withConsume = all.filter((c) => c.consume);
  const consumeToggle = withConsume.length > 0 && withConsume.length < all.length;
  const consume = consumeToggle ? sel.consume : withConsume.length === all.length && all.length > 0;
  let choices = all.filter((c) => !!c.consume === consume);
  const elementKeys = [...new Set(choices.map(elementKeyOf))].filter((k) => k !== '');
  let elementKey: string | null = null;
  if (elementKeys.length > 0) {
    elementKey = sel.elementKey && elementKeys.includes(sel.elementKey) ? sel.elementKey : (elementKeys[0] as string);
    // Plain infuse-any choices are shown as one button per element, so do not filter those.
    if (choices.some((c) => modeOf(c, step) !== 'plain')) choices = choices.filter((c) => elementKeyOf(c) === elementKey);
  }
  // Mixed choices (e.g. a plain fallback and targets) are shown by their most specific mode.
  const modes = new Set(choices.map((c) => modeOf(c, step)));
  const mode: StepMode = (['path', 'targets', 'area', 'hex', 'plain'] as const).find((m) => modes.has(m)) ?? 'plain';
  const model: StepModel = {
    mode,
    consumeToggle,
    elementKeys,
    elementKey,
    choices,
    highlights: [],
    targetIds: [],
    maxTargets: 0,
    directions: [],
    areaPreview: [],
    ready: null,
  };
  const actor = s.half ? s.figures[s.half.heroId] : undefined;
  switch (mode) {
    case 'path': {
      const seen = new Set<string>();
      for (const c of choices) {
        const end = c.path?.[c.path.length - 1];
        if (end && !seen.has(hexKey(end))) {
          seen.add(hexKey(end));
          model.highlights.push(end);
        }
      }
      break;
    }
    case 'targets': {
      const ids = new Set<string>();
      for (const c of choices) for (const id of c.targets ?? []) ids.add(id);
      model.targetIds = [...ids];
      model.maxTargets = Math.max(0, ...choices.map((c) => c.targets?.length ?? 0));
      for (const id of ids) {
        const f = s.figures[id];
        if (f) model.highlights.push(f.hex);
      }
      const want = [...sel.targets].sort().join('|');
      model.ready = choices.find((c) => [...(c.targets ?? [])].sort().join('|') === want && want !== '') ?? null;
      break;
    }
    case 'area':
    case 'hex': {
      const anchors = new Map<string, Hex>();
      for (const c of choices) if (c.hex) anchors.set(hexKey(c.hex), c.hex);
      model.highlights = [...anchors.values()];
      const anchor = sel.hex && anchors.has(hexKey(sel.hex)) ? sel.hex : anchors.size === 1 ? [...anchors.values()][0] ?? null : null;
      if (!anchor) break;
      const forAnchor = choices.filter((c) => c.hex && hexKey(c.hex) === hexKey(anchor));
      if (mode === 'hex') {
        model.ready = forAnchor[0] ?? null;
        break;
      }
      const area = step.type === 'attack' ? (step.area ?? (consume ? step.consume?.area : undefined)) : undefined;
      // Rotations that cover the same hexes are one option.
      const byShape = new Map<string, number>();
      for (const c of forAnchor) {
        const d = c.direction ?? 0;
        const key = area && actor ? areaHexes(area, actor.hex, anchor, d).map(hexKey).sort().join('|') : String(d);
        if (!byShape.has(key)) byShape.set(key, d);
      }
      model.directions = [...byShape.values()];
      const d = sel.direction !== null && model.directions.includes(sel.direction) ? sel.direction : model.directions.length === 1 ? (model.directions[0] as number) : null;
      if (d === null) break;
      if (area && actor) model.areaPreview = areaHexes(area, actor.hex, anchor, d).filter((x) => s.board.tiles[hexKey(x)]);
      model.ready = forAnchor.find((c) => (c.direction ?? 0) === d) ?? null;
      break;
    }
    case 'plain':
      break;
  }
  return model;
}

/** What a tap on a hex does for the current step: a choice to apply now, or a selection change. */
export function tapStep(s: GameState, model: StepModel, sel: StepSelection, hex: Hex): { apply?: StepChoice; sel?: StepSelection } {
  const key = hexKey(hex);
  switch (model.mode) {
    case 'path': {
      // Shortest path to the tapped hex (fewest hexes entered).
      const options = model.choices.filter((c) => c.path && hexKey(c.path[c.path.length - 1] as Hex) === key);
      options.sort((a, b) => (a.path?.length ?? 0) - (b.path?.length ?? 0));
      return options[0] ? { apply: options[0] } : {};
    }
    case 'targets': {
      const f = Object.values(s.figures).find((x) => hexKey(x.hex) === key && model.targetIds.includes(x.id));
      if (!f) return {};
      if (model.maxTargets <= 1) {
        const c = model.choices.find((x) => x.targets?.length === 1 && x.targets[0] === f.id);
        return c ? { apply: c } : {};
      }
      const targets = sel.targets.includes(f.id) ? sel.targets.filter((id) => id !== f.id) : [...sel.targets, f.id];
      return { sel: { ...sel, targets } };
    }
    case 'hex': {
      const c = model.choices.find((x) => x.hex && hexKey(x.hex) === key);
      return c ? { apply: c } : {};
    }
    case 'area': {
      if (!model.highlights.some((x) => hexKey(x) === key)) return {};
      return { sel: { ...sel, hex, direction: null } };
    }
    case 'plain':
      return {};
  }
}
