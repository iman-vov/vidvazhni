// Temporary BoardView (render/view.ts) on top of the phase-0 token board, used until the real 3D
// board (render/boardView.ts, session phase2-board) exists. Figures are coloured cylinders with a
// label; obstacles, doors, traps and loot are dark markers. One highlight colour at a time, so the
// most specific highlight wins (area > targets > path > reachable). `play` walks figures along their
// paths and flashes damage numbers, then lands on `sync(stateAfter)`.

import { createBoard, type Board, type BoardToken } from '../render/board';
import type { BoardHighlights, BoardView, BoardViewOptions } from '../render/view';
import type { GraphicsQuality } from '../render/quality';
import type { Content } from '../rules/content';
import { hexKey, parseHexKey, type Hex } from '../rules/hex';
import type { Figure, FigureId, GameEvent, GameState } from '../rules/state';
import { t } from '../ui/i18n';

const HERO_COLORS = ['#3d8bfd', '#2fbf71', '#b46cff', '#f0a030'];
const MONSTER_COLOR = '#d9534f';
const ELITE_COLOR = '#f2c94c';
const SUMMON_COLOR = '#3cc8c8';
const DOWNED_COLOR = '#7d8594';
const MARKER_COLOR = '#2a303c';
const DOOR_COLOR = '#8a5a2b';
const TRAP_COLOR = '#6b2d5c';
const LOOT_COLOR = '#7a6a2a';
const PATH_COLOR = '#ffe08a';
const HL = { reachable: '#4fb3ff', targets: '#ff6b5b', area: '#ff9f43', path: '#ffc457' };
const STEP_MS = 110;
const HIT_MS = 380;

export function heroColor(index: number): string {
  return HERO_COLORS[index % HERO_COLORS.length] as string;
}

export function createBoardViewStub(container: HTMLElement, _opts: BoardViewOptions = {}): BoardView {
  let board: Board | null = null;
  let roomsKey = '';
  let state: GameState | null = null;
  let tokens: BoardToken[] = [];
  let hl: BoardHighlights = {};
  let skipping = false;
  let wake: (() => void) | null = null;
  const hexCbs = new Set<(hex: Hex) => void>();
  const figCbs = new Set<(id: FigureId) => void>();
  let unsubTap: (() => void) | null = null;

  function rebuild(s: GameState): void {
    unsubTap?.();
    board?.dispose();
    const hexes = Object.keys(s.board.tiles).map((k) => parseHexKey(k) as Hex);
    board = createBoard(container, { hexes });
    roomsKey = [...s.board.revealedRooms].sort().join('|');
    unsubTap = board.onHexTap((q, r) => {
      // Same order as the real board: the figure first, then its hex.
      const hex: Hex = [q, r];
      const f = state && figureAt(state, hex);
      if (f) for (const cb of figCbs) cb(f.id);
      for (const cb of hexCbs) cb(hex);
    });
  }

  function draw(): void {
    if (!state) return;
    const key = [...state.board.revealedRooms].sort().join('|');
    if (!board || key !== roomsKey) rebuild(state);
    const b = board as Board;
    const extra: BoardToken[] = [];
    const damage = hl.expectedDamage ?? {};
    const shown = tokens.map((tk) => (tk.id in damage ? { ...tk, label: `${tk.label} (${damage[tk.id]})` } : tk));
    if (hl.path?.length && !hl.area?.length) {
      const end = hl.path[hl.path.length - 1] as Hex;
      extra.push({ id: 'path:end', q: end[0], r: end[1], color: PATH_COLOR, label: `${t('stat.move')} ${hl.path.length}` });
    }
    b.setTokens([...shown, ...extra]);
    if (hl.area?.length) b.setHighlights(hl.area, HL.area);
    else if (hl.targets?.length && state) b.setHighlights(hl.targets.map((id) => state?.figures[id]?.hex).filter((x): x is Hex => !!x), HL.targets);
    else if (hl.reachable?.length) b.setHighlights(hl.reachable.map((r) => r.hex), HL.reachable);
    else if (hl.path?.length) b.setHighlights(hl.path, HL.path);
    else b.setHighlights([]);
  }

  function wait(ms: number): Promise<void> {
    if (skipping) return Promise.resolve();
    return new Promise((resolve) => {
      const id = setTimeout(done, ms);
      function done() {
        clearTimeout(id);
        wake = null;
        resolve();
      }
      wake = done;
    });
  }

  function setToken(id: string, patch: Partial<BoardToken>): void {
    tokens = tokens.map((tk) => (tk.id === id ? { ...tk, ...patch } : tk));
  }

  const view: BoardView = {
    sync(s) {
      state = s;
      tokens = buildTokens(s);
      draw();
    },
    async play(events: GameEvent[], after: GameState, _content: Content) {
      skipping = false;
      for (const e of events) {
        if (skipping) break;
        if (e.type === 'moved' || e.type === 'pushed') {
          for (const hex of e.path) {
            setToken(e.figureId, { q: hex[0], r: hex[1] });
            draw();
            await wait(STEP_MS);
          }
        } else if (e.type === 'attacked' || e.type === 'damaged') {
          const id = e.type === 'attacked' ? e.targetId : e.figureId;
          const amount = e.type === 'attacked' ? e.damage : e.amount;
          const tk = tokens.find((x) => x.id === id);
          if (!tk || (e.type === 'damaged' && amount === 0)) continue;
          const label = tk.label;
          setToken(id, { label: `−${amount}` });
          draw();
          await wait(HIT_MS);
          setToken(id, { label });
        } else if (e.type === 'figureDied') {
          tokens = tokens.filter((x) => x.id !== e.figureId);
          draw();
          await wait(STEP_MS);
        }
      }
      skipping = false;
      view.sync(after, _content);
    },
    skip() {
      skipping = true;
      wake?.();
    },
    highlight(h) {
      hl = h;
      draw();
    },
    clearHighlights() {
      hl = {};
      draw();
    },
    onHexTap(cb) {
      hexCbs.add(cb);
      return () => hexCbs.delete(cb);
    },
    onFigureTap(cb) {
      figCbs.add(cb);
      return () => figCbs.delete(cb);
    },
    onFigureHold() {
      // The token board has no long press; the real board reports it.
      return () => {};
    },
    focus() {
      // The token board has no camera API; double tap re-centres it.
    },
    setQuality(_q: GraphicsQuality) {
      // board.ts follows render/quality.ts by itself.
    },
    dispose() {
      unsubTap?.();
      board?.dispose();
      board = null;
      roomsKey = '';
    },
  };
  return view;
}

function figureAt(s: GameState, hex: Hex): Figure | undefined {
  const key = hexKey(hex);
  return Object.values(s.figures).find((f) => hexKey(f.hex) === key && !(f.kind === 'hero' && f.exhausted));
}

function buildTokens(s: GameState): BoardToken[] {
  const out: BoardToken[] = [];
  const occupied = new Set<string>();
  const heroIds = Object.values(s.figures)
    .filter((f) => f.kind === 'hero')
    .map((f) => f.id);
  for (const f of Object.values(s.figures)) {
    if (f.kind === 'hero' && f.exhausted) continue;
    occupied.add(hexKey(f.hex));
    out.push({ id: f.id, q: f.hex[0], r: f.hex[1], color: colorOf(f, heroIds), label: tokenLabel(f) });
  }
  for (const [k, tile] of Object.entries(s.board.tiles)) {
    if (occupied.has(k)) continue;
    const [q, r] = parseHexKey(k);
    let marker: { color: string; label: string } | null = null;
    if (tile.obstacle) marker = { color: MARKER_COLOR, label: t('game.marker.obstacle') };
    else if (tile.door && !tile.door.open) marker = { color: DOOR_COLOR, label: t('game.marker.door') };
    else if (tile.trap) marker = { color: TRAP_COLOR, label: t('game.marker.trap', { damage: tile.trap.damage }) };
    else if (tile.chest) marker = { color: LOOT_COLOR, label: t('game.marker.chest') };
    else if (tile.coins) marker = { color: LOOT_COLOR, label: t('game.marker.coins', { n: tile.coins }) };
    else if (tile.terrain !== 'normal') marker = { color: MARKER_COLOR, label: t(`terrain.${tile.terrain}`) };
    if (marker) out.push({ id: `marker:${k}`, q, r, ...marker });
  }
  return out;
}

function colorOf(f: Figure, heroIds: string[]): string {
  if (f.kind === 'hero') return f.downed ? DOWNED_COLOR : heroColor(heroIds.indexOf(f.id));
  if (f.kind === 'summon') return SUMMON_COLOR;
  return f.rank === 'normal' ? MONSTER_COLOR : ELITE_COLOR;
}

function tokenLabel(f: Figure): string {
  const hp = `${f.hp}/${f.maxHp}`;
  if (f.kind === 'hero') return `${t(`class.${f.classId}`).slice(0, 3)} ${hp}`;
  if (f.kind === 'monster') return `${f.rank === 'elite' ? t('game.eliteMark') : ''}${f.number} · ${hp}`;
  return `${t(`summon.${f.summonId}`).slice(0, 3)} ${hp}`;
}
