/// <reference types="vite-plugin-pwa/client" />
// Entry point. Phase 0 mounts the board; phase 1 adds the debug overlay.
import { registerSW } from 'virtual:pwa-register';
import { createBoard } from './render/board';
import { rectangleHexes } from './render/hexLayout';

const container = document.getElementById('board');
if (container) {
  const board = createBoard(container, { hexes: rectangleHexes(10, 10) });
  board.onHexTap((q, r) => board.setHighlights([[q, r]]));
}

registerSW({ immediate: true });
