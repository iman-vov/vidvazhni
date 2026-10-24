// The game app: main menu → new game → scenario → scenario end, plus settings. One board is
// created when the first scenario opens and kept for later ones.

import { loadContent } from '../rules/load';
import type { GameSetup } from '../rules/state';
import type { BoardView } from '../render/view';
import { getGraphicsQuality } from '../render/quality';
import { h } from '../ui/dom';
import { getLang, onLangChange, t } from '../ui/i18n';
import { icon } from '../ui/game/icons';
import { createGameBoard } from './board';
import { GameController, type PlayerInfo } from './game';
import { mountScenario } from './scenarioScreen';
import { endScreen } from './screens/end';
import { menuScreen } from './screens/menu';
import { newGameScreen } from './screens/newGame';
import { settingsPanel } from './screens/settings';
import { settings } from './settings';
import { gameStorage, type GameStorage } from './storage';

type Screen = 'menu' | 'newGame' | 'settings' | 'scenario' | 'end';

export function mountApp(boardEl: HTMLElement, overlay: HTMLElement, storage: GameStorage = gameStorage()): void {
  const content = loadContent();
  let screen: Screen = 'menu';
  let game: GameController | null = null;
  let board: BoardView | null = null;
  let unmountScenario: (() => void) | null = null;
  document.documentElement.lang = getLang();

  if (import.meta.env.DEV) Object.defineProperty(window, '__game', { get: () => ({ game, board, screen, go }), configurable: true });

  onLangChange(() => {
    document.documentElement.lang = getLang();
    if (screen !== 'scenario') render();
  });

  function go(next: Screen): void {
    if (screen === 'scenario' && next !== 'scenario') {
      unmountScenario?.();
      unmountScenario = null;
    }
    screen = next;
    boardEl.style.visibility = next === 'scenario' ? 'visible' : 'hidden';
    render();
  }

  async function openScenario(g: GameController): Promise<void> {
    game = g;
    board ??= await createGameBoard(boardEl, { quality: getGraphicsQuality(), lang: getLang(), speed: settings.get().speed });
    go('scenario');
  }

  function startNew(setup: GameSetup, players: PlayerInfo[]): void {
    void openScenario(GameController.start(setup, players, storage, content));
  }

  function continueSaved(): void {
    const saved = storage.load();
    if (!saved) return render();
    void openScenario(GameController.restore(saved, storage, content));
  }

  function render(): void {
    switch (screen) {
      case 'menu':
        overlay.replaceChildren(menuScreen({ content, saved: storage.load(), onContinue: continueSaved, onNewGame: () => go('newGame'), onSettings: () => go('settings') }));
        break;
      case 'newGame':
        overlay.replaceChildren(newGameScreen({ content, onStart: startNew, onBack: () => go('menu') }));
        break;
      case 'settings':
        overlay.replaceChildren(
          h(
            'div',
            { class: 'gpage' },
            h('header', { class: 'gpage-head' }, h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: () => go('menu') }, icon('left')), h('h1', null, t('ui.settings'))),
            settingsPanel({ onQuality: (q) => board?.setQuality(q), onSpeed: (n) => board?.setSpeed?.(n) }),
          ),
        );
        break;
      case 'scenario':
        if (!game || !board) return go('menu');
        unmountScenario?.();
        unmountScenario = mountScenario({
          overlay,
          game,
          board,
          onExit: () => go('menu'),
          onEnd: () => {
            storage.clear();
            go('end');
          },
        });
        break;
      case 'end':
        if (!game) return go('menu');
        overlay.replaceChildren(
          endScreen({
            game,
            onMenu: () => go('menu'),
            onAgain: () => {
              const g = game as GameController;
              startNew({ ...g.setup, seed: Math.floor(Math.random() * 1_000_000_000) }, g.meta.players);
            },
          }),
        );
        break;
    }
  }

  go('menu');
}
