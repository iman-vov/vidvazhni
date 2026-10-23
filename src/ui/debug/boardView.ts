// Thin adapter between the game state and the three.js board. The board takes its hex set at
// creation, so it is rebuilt when a room is revealed. Obstacles, doors, traps, coins and chests
// are shown as dark marker tokens on hexes with no figure (the board API has no terrain layer).

import { createBoard, type Board, type BoardToken, type Hex } from '../../render/board';
import { parseHexKey } from '../../rules/hex';
import type { Figure, GameState } from '../../rules/state';
import { t } from '../i18n';
import { tokenLabel } from './format';

const HERO_COLORS = ['#3d8bfd', '#2fbf71', '#b46cff', '#f0a030'];
const MONSTER_COLOR = '#d9534f';
const ELITE_COLOR = '#f2c94c';
const SUMMON_COLOR = '#3cc8c8';
const DOWNED_COLOR = '#7d8594';
const MARKER_COLOR = '#2a303c';
const DOOR_COLOR = '#8a5a2b';
const TRAP_COLOR = '#6b2d5c';
const LOOT_COLOR = '#7a6a2a';

export class BoardView {
  private board: Board | null = null;
  private roomsKey = '';
  private unsub: (() => void) | null = null;
  private tapHandler: (hex: Hex) => void = () => {};

  constructor(private readonly container: HTMLElement) {}

  onTap(cb: (hex: Hex) => void): void {
    this.tapHandler = cb;
  }

  /** Shows the state; `highlights` replaces the highlighted hexes, `labels` overrides token labels. */
  show(s: GameState, highlights: { hexes: Hex[]; color: string }, labels: Record<string, string> = {}): void {
    const key = [...s.board.revealedRooms].sort().join('|');
    if (!this.board || key !== this.roomsKey) this.rebuild(s, key);
    const board = this.board as Board;
    board.setTokens(this.tokens(s, labels));
    board.setHighlights(highlights.hexes, highlights.color);
  }

  dispose(): void {
    this.unsub?.();
    this.board?.dispose();
    this.board = null;
    this.roomsKey = '';
  }

  private rebuild(s: GameState, key: string): void {
    this.dispose();
    const hexes = Object.keys(s.board.tiles).map((k) => parseHexKey(k) as Hex);
    this.board = createBoard(this.container, { hexes });
    this.roomsKey = key;
    this.unsub = this.board.onHexTap((q, r) => this.tapHandler([q, r]));
  }

  private tokens(s: GameState, labels: Record<string, string>): BoardToken[] {
    const out: BoardToken[] = [];
    const occupied = new Set<string>();
    const heroIds = Object.values(s.figures)
      .filter((f) => f.kind === 'hero')
      .map((f) => f.id);
    for (const f of Object.values(s.figures)) {
      if (f.kind === 'hero' && f.exhausted) continue;
      occupied.add(`${f.hex[0]},${f.hex[1]}`);
      out.push({ id: f.id, q: f.hex[0], r: f.hex[1], color: colorOf(f, heroIds), label: labels[f.id] ?? tokenLabel(f) });
    }
    for (const [k, tile] of Object.entries(s.board.tiles)) {
      if (occupied.has(k)) continue;
      const [q, r] = parseHexKey(k);
      let marker: { color: string; label: string } | null = null;
      if (tile.obstacle) marker = { color: MARKER_COLOR, label: t('debug.marker.obstacle') };
      else if (tile.door && !tile.door.open) marker = { color: DOOR_COLOR, label: t('debug.marker.door') };
      else if (tile.trap) marker = { color: TRAP_COLOR, label: t('debug.marker.trap', { damage: tile.trap.damage }) };
      else if (tile.chest) marker = { color: LOOT_COLOR, label: t('debug.marker.chest') };
      else if (tile.coins) marker = { color: LOOT_COLOR, label: t('debug.marker.coins', { n: tile.coins }) };
      else if (tile.object) marker = { color: MARKER_COLOR, label: tile.object.kind };
      else if (tile.terrain !== 'normal') marker = { color: MARKER_COLOR, label: t(`debug.terrain.${tile.terrain}`) };
      if (marker) out.push({ id: `marker:${k}`, q, r, ...marker });
    }
    return out;
  }
}

function colorOf(f: Figure, heroIds: string[]): string {
  if (f.kind === 'hero') return f.downed ? DOWNED_COLOR : (HERO_COLORS[heroIds.indexOf(f.id) % HERO_COLORS.length] as string);
  if (f.kind === 'summon') return SUMMON_COLOR;
  return f.rank === 'normal' ? MONSTER_COLOR : ELITE_COLOR;
}

export function heroColor(s: GameState, heroId: string): string {
  const ids = Object.values(s.figures)
    .filter((f) => f.kind === 'hero')
    .map((f) => f.id);
  return HERO_COLORS[ids.indexOf(heroId) % HERO_COLORS.length] as string;
}
