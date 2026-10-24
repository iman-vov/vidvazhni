// The game app: main menu → new game → scenario → scenario end, plus settings. One board is
// created when the first scenario opens and kept for later ones.

import { applyScenarioResult, newCampaign } from '../rules/campaign';
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
import { campScreen } from './screens/camp';
import { endScreen } from './screens/end';
import { menuBackdrop, menuScreen } from './screens/menu';
import { newGameScreen } from './screens/newGame';
import { settingsPanel } from './screens/settings';
import { settings } from './settings';
import { campaignStorage, gameStorage, type CampaignStorage, type GameStorage } from './storage';
import { helpBrowser, openHelpModal, type HelpRules } from './help/helpView';
import { installKeywordLinks } from './help/keywords';
import { mountCoach } from './tutorial/coach';
import { isTutorial, tutorialContent, tutorialPlayers, tutorialSetup, tutorialStorage } from './tutorial/scenario';
import { saveTutorialProgress, shouldOfferTutorial, tutorialEnd, tutorialOffer } from './tutorial/screens';

type Screen = 'menu' | 'newGame' | 'newCampaign' | 'camp' | 'settings' | 'scenario' | 'end' | 'help' | 'tutorialOffer' | 'tutorialEnd';

export function mountApp(boardEl: HTMLElement, overlay: HTMLElement, storage: GameStorage = gameStorage(), campaigns: CampaignStorage = campaignStorage()): void {
  const content = loadContent();
  let screen: Screen = 'menu';
  let game: GameController | null = null;
  let board: BoardView | null = null;
  let unmountScenario: (() => void) | null = null;
  let unmountCoach: (() => void) | null = null;
  document.documentElement.lang = getLang();

  if (import.meta.env.DEV) Object.defineProperty(window, '__game', { get: () => ({ game, board, screen, go }), configurable: true });

  const rulesOf = (g: GameController | null): HelpRules | null => (g ? { orbs: g.state.variants.orbs, fork: Object.values(g.state.variants).some(Boolean) } : null);
  const openHelp = (topic?: string | null) => openHelpModal({ rules: screen === 'scenario' ? rulesOf(game) : null, topic: topic ?? null });
  installKeywordLinks(overlay, { orbs: () => game?.state.variants.orbs ?? true, openTopic: (id) => openHelp(id) });

  onLangChange(() => {
    document.documentElement.lang = getLang();
    if (screen !== 'scenario') render();
  });

  function go(next: Screen): void {
    if (screen === 'scenario' && next !== 'scenario') {
      unmountScenario?.();
      unmountScenario = null;
      unmountCoach?.();
      unmountCoach = null;
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

  function startNew(setup: GameSetup, players: PlayerInfo[], campaign = false): void {
    void openScenario(GameController.start(setup, players, storage, content, { campaign }));
  }

  /** The party from the New Game steps becomes a campaign; the camp comes before s1. */
  function startCampaign(setup: GameSetup, players: PlayerInfo[]): void {
    const state = newCampaign(content, { players: players.map((p) => p.id), heroes: setup.heroes, difficulty: setup.difficulty, firstScenario: setup.scenarioId });
    campaigns.save(state, players);
    go('camp');
  }

  /** «До табору»: the result goes into the saved campaign (once per game). */
  function backToCamp(): void {
    const saved = campaigns.load();
    if (game && saved) {
      const r = applyScenarioResult(content, saved.campaign, game.scenarioResult());
      if (r.ok) campaigns.save(r.state, saved.players);
    }
    go('camp');
  }

  /** Resumes an unfinished tutorial unless `fresh`. */
  function startTutorial(fresh = false): void {
    const tStorage = tutorialStorage();
    const saved = fresh ? null : tStorage.load();
    const tContent = tutorialContent(content);
    void openScenario(saved ? GameController.restore(saved, tStorage, tContent) : GameController.start(tutorialSetup(), tutorialPlayers(t('tutorial.player')), tStorage, tContent));
  }

  function continueSaved(): void {
    const saved = storage.load();
    if (!saved) return render();
    void openScenario(GameController.restore(saved, storage, content));
  }

  function render(): void {
    switch (screen) {
      case 'menu':
        overlay.replaceChildren(
          menuScreen({
            content,
            saved: storage.load(),
            onContinue: continueSaved,
            onNewGame: () => go(shouldOfferTutorial() ? 'tutorialOffer' : 'newGame'),
            onSettings: () => go('settings'),
            campaign: campaigns.load(),
            onCampaign: () => go(campaigns.load() ? 'camp' : 'newCampaign'),
            onHelp: () => go('help'),
            onTutorial: () => startTutorial(),
          }),
        );
        break;
      case 'help':
        overlay.replaceChildren(h('div', { class: 'gpage is-art' }, menuBackdrop(true), helpBrowser({ onClose: () => go('menu') })));
        break;
      case 'tutorialOffer':
        overlay.replaceChildren(tutorialOffer({ onStart: () => startTutorial(true), onSkip: () => go('newGame'), onBack: () => go('menu') }));
        break;
      case 'tutorialEnd':
        overlay.replaceChildren(tutorialEnd({ won: game?.state.phase === 'won', onNewGame: () => go('newGame'), onAgain: () => startTutorial(true), onHelp: () => go('help'), onMenu: () => go('menu') }));
        break;
      case 'newGame':
        overlay.replaceChildren(newGameScreen({ content, onStart: startNew, onBack: () => go('menu') }));
        break;
      case 'newCampaign':
        overlay.replaceChildren(newGameScreen({ content, campaign: true, onStart: startCampaign, onBack: () => go('menu') }));
        break;
      case 'camp': {
        const saved = campaigns.load();
        if (!saved) return go('menu');
        overlay.replaceChildren(
          campScreen({
            content,
            saved,
            onSave: (state) => campaigns.save(state, saved.players),
            onMission: (setup) => startNew(setup, saved.players, true),
            onNewCampaign: () => (campaigns.clear(), go('newCampaign')),
            onMenu: () => go('menu'),
          }),
        );
        break;
      }
      case 'settings':
        overlay.replaceChildren(
          h(
            'div',
            { class: 'gpage is-art' },
            menuBackdrop(true),
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
          onHelp: openHelp,
          onEnd: () => {
            if (game && isTutorial(game.setup.scenarioId)) {
              if (game.state.phase === 'won') saveTutorialProgress({ done: true });
              tutorialStorage().clear();
              return go('tutorialEnd');
            }
            storage.clear();
            go('end');
          },
        });
        unmountCoach?.();
        unmountCoach = isTutorial(game.setup.scenarioId)
          ? mountCoach({
              game,
              board,
              screen: overlay,
              onSkip: () => {
                saveTutorialProgress({ dismissed: true });
                tutorialStorage().clear();
                go('menu');
              },
            })
          : null;
        break;
      case 'end':
        if (!game) return go('menu');
        overlay.replaceChildren(
          endScreen({
            game,
            onCamp: game.meta.campaign && campaigns.load() ? backToCamp : undefined,
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
