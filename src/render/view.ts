// Contract between the game UI (src/ui/game, src/app) and the 3D board (src/render).
// The UI owns the game flow and calls the rules engine; the board only shows state and plays events.
// Implemented in src/render/boardView.ts. Extend additively; report changes.

import type { Content } from '../rules/content';
import type { Hex } from '../rules/hex';
import type { FigureId, GameEvent, GameState } from '../rules/state';
import type { GraphicsQuality } from './quality';

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
}

export interface BoardViewOptions {
  quality?: GraphicsQuality;
  /** Language for floating labels (damage numbers use digits only). */
  lang?: 'uk' | 'de' | 'en';
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
  onHexTap(cb: (hex: Hex) => void): () => void;
  onFigureTap(cb: (figureId: FigureId) => void): () => void;
  /** Long press on a figure (UI shows its details). */
  onFigureHold(cb: (figureId: FigureId) => void): () => void;
  /** Smoothly centres the camera on a figure (double tap on own hero does this too). */
  focus(figureId: FigureId): void;
  setQuality(quality: GraphicsQuality): void;
  dispose(): void;
}
