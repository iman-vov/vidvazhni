// Picks the board for the game screen: the real 3D BoardView from render/boardView.ts when that
// file exists (session phase2-board), else the token stub. `?stub` in the URL forces the stub.

import type { BoardView, BoardViewOptions } from '../render/view';
import { createBoardViewStub } from './boardViewStub';

type BoardModule = { createBoardView?: (container: HTMLElement, opts: BoardViewOptions) => BoardView };

// A glob, not an import, so the game builds whether or not the file exists yet.
const realBoard = import.meta.glob<BoardModule>('../render/boardView.ts');

export async function createGameBoard(container: HTMLElement, opts: BoardViewOptions): Promise<BoardView> {
  const forceStub = new URLSearchParams(location.search).has('stub');
  const load = Object.values(realBoard)[0];
  if (load && !forceStub) {
    try {
      const mod = await load();
      if (mod.createBoardView) return mod.createBoardView(container, opts);
    } catch (e) {
      console.warn('3D board failed, using the token board', e);
    }
  }
  return createBoardViewStub(container, opts);
}
