// Contract between the game UI (src/ui/game, src/app) and the 3D board (src/render).
// The UI owns the game flow and calls the rules engine; the board only shows state and plays events.
// Implemented in src/render/boardView.ts. Extend additively; report changes.

import type { AnimStep } from './animPlan';
import type { Content } from '../rules/content';
import type { Hex } from '../rules/hex';
import type { FigureId, GameEvent, GameState } from '../rules/state';
import type { GraphicsQuality } from './quality';
import type { IconName } from '../ui/icons/names';

export interface BoardHighlights {
  /** Hexes the active figure can move to (with the cost, for the label). */
  reachable?: { hex: Hex; cost: number }[];
  /** Figures that are valid targets for the current step. */
  targets?: FigureId[];
  /** Hexes an area attack would cover at the current anchor/rotation. */
  area?: Hex[];
  /** A path preview for the hovered/chosen destination. */
  path?: Hex[];
  /** Expected damage before the modifier, shown over each target. */
  expectedDamage?: Record<FigureId, number>;
  /** Colour of the target marks: 'enemy' (red, attacks; the default) or 'ally' (green: heals,
   *  shields, buffs on allies or the hero). */
  targetTone?: 'enemy' | 'ally';
  /** The action's reach: a line around the hexes within `radius` of `center`. */
  range?: { center: Hex; radius: number };
  /** A result preview over a target instead of expected damage: «5 → 8» with the heal icon. */
  preview?: Record<FigureId, { text: string; icon: IconName }>;
  /** The figure whose turn it is (glowing hex edge). Default: taken from the state
   *  (pending hero turn, else the current turn-order entry); null shows none. */
  active?: FigureId | null;
  /** A figure the player picked to look at (a soft white hex edge). */
  selected?: FigureId | null;
}

export interface BoardViewOptions {
  quality?: GraphicsQuality;
  /** Language for floating labels (damage numbers use digits only). */
  lang?: 'uk' | 'de' | 'en';
  /** Animation speed: 1 (default) or 2. Also settable later with setSpeed. */
  speed?: number;
  /** Heroes a double tap focuses on (this device's players). Default: every hero. */
  ownHeroes?: FigureId[];
  /** A small «reset view» button on the board's right edge, shown while the camera is turned,
   *  tilted, zoomed or panned away from home. Default true; false if the UI has its own. */
  resetButton?: boolean;
}

export interface BoardView {
  /** Places tiles, walls, doors, obstacles, loot and figures for `state` without animation. */
  sync(state: GameState, content: Content): void;
  /** Animates the events one after another (move along paths, attack, hit, death, conditions,
   *  element/orb changes, rooms opening) and resolves when done; ends in the same picture as
   *  `sync(stateAfter)`. Rules never wait for this. */
  play(events: GameEvent[], stateAfter: GameState, content: Content): Promise<void>;
  /** Skips the running animation queue to its end state. */
  skip(): void;
  highlight(h: BoardHighlights): void;
  clearHighlights(): void;
  /** A tap on a board hex. A tap on a figure fires onFigureTap and then onHexTap with its hex. */
  onHexTap(cb: (hex: Hex) => void): () => void;
  onFigureTap(cb: (figureId: FigureId) => void): () => void;
  /** Long press on a figure (UI shows its details). */
  onFigureHold(cb: (figureId: FigureId) => void): () => void;
  /** Each animation step as it starts, with the current speed (sounds follow the picture). */
  onStep?(cb: (step: AnimStep, speed: number) => void): () => void;
  /** Pins an HTML element over a figure's head (follows it; hidden while the figure is gone),
   *  e.g. a story speech bubble. Returns the remover. */
  pin?(figureId: FigureId, el: HTMLElement): () => void;
  /** Smoothly centres the camera on a figure (double tap on own hero does this too). */
  focus(figureId: FigureId): void;
  /** Eases the camera back to the home view: the whole board, unturned, at the home tilt. */
  resetCamera?(): void;
  setQuality(quality: GraphicsQuality): void;
  /** Animation speed setting (1× or 2×); applies to the running queue at once. */
  setSpeed?(speed: number): void;
  dispose(): void;
}
