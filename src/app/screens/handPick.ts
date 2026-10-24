// «Карти на місію» before a scenario: after «Почати» on the campaign map or in New Game and before
// the board, every hero whose deck is larger than the hand picks the hand. The whole deck as full
// cards in 2–3 rows (digital GH style); a tap toggles a card. The camp's pick (setup hand) is the
// default. The game starts with the hands set, so the battle never asks for them.

import { availableCards, createGame, recommendedHand } from '../../rules/setup';
import type { LoadedContent } from '../../rules/load';
import type { GameSetup, HeroState } from '../../rules/state';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { cardView } from '../../ui/game/card';
import { icon } from '../../ui/game/icons';
import { portrait } from '../../ui/game/panels';
import { figureName } from '../../ui/game/text';
import { artButton, menuBackdrop } from './menu';
import './handPick.css';

type SetupHero = GameSetup['heroes'][number];

/** Heroes that have more cards than the hand holds (the others take the whole deck). */
export function heroesToPick(setup: GameSetup, content: LoadedContent): SetupHero[] {
  return setup.heroes.filter((x) => {
    const cls = content.heroes[x.classId];
    return !!cls && availableCards(cls, x.level, x.cards).length > cls.handSize;
  });
}

export interface HandPickOptions {
  content: LoadedContent;
  setup: GameSetup;
  /** The setup with every hand set; `hands` per class for the campaign save. */
  onDone: (setup: GameSetup, hands: Record<string, string[]>) => void;
  onBack: () => void;
}

export function handPickScreen(o: HandPickOptions): HTMLElement {
  const { content, setup } = o;
  const pickers = heroesToPick(setup, content).flatMap((x) => {
    const cls = content.heroes[x.classId];
    return cls ? [{ x, cls, pool: availableCards(cls, x.level, x.cards) }] : [];
  });
  // A preview state for the card faces (variants, frames); its hands are not used.
  const preview = createGame({ ...setup, heroes: setup.heroes.map((x) => ({ ...x, hand: undefined })) }, content);
  const hands: Record<string, string[]> = {};
  for (const { x, cls, pool } of pickers) {
    const camp = (x.hand ?? []).filter((id) => pool.includes(id));
    // No hand kept from the camp yet: start from the class's recommended hand.
    hands[x.classId] = (camp.length ? camp : recommendedHand(cls, pool)).slice(0, cls.handSize);
  }
  let at = 0;
  const root = h('div', { class: 'gpage is-art ghp' });

  const sizeOf = (classId: string) => content.heroes[classId]?.handSize ?? 0;
  const full = (classId: string) => (hands[classId]?.length ?? 0) === sizeOf(classId);

  function finish(): void {
    o.onDone({ ...setup, heroes: setup.heroes.map((x) => {
      const hand = hands[x.classId];
      return hand ? { ...x, hand: [...hand] } : x;
    }) }, hands);
  }

  function render(): void {
    const cur = pickers[at];
    if (!cur) return void queueMicrotask(finish);
    const { x, cls, pool } = cur;
    const id = `hero:${x.classId}`;
    const hero = preview.figures[id] as HeroState;
    const color = cls.color;
    const picked = hands[x.classId] ?? [];
    const need = cls.handSize;
    const grid = h(
      'div',
      { class: 'ghp-grid', role: 'list' },
      pool.map((cardId) => {
        const on = picked.includes(cardId);
        const el = cardView({ s: preview, content, hero, cardId, full: true, accent: color, picked: on });
        el.setAttribute('role', 'listitem');
        el.setAttribute('aria-pressed', String(on));
        el.tabIndex = 0;
        if (on) el.append(h('span', { class: 'gsel-badge' }, icon('check')));
        const toggle = () => {
          hands[x.classId] = on ? picked.filter((c) => c !== cardId) : picked.length < need ? [...picked, cardId] : picked;
          render();
        };
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()));
        return el;
      }),
    );
    fit(grid, pool.length);
    const last = at === pickers.length - 1;
    root.replaceChildren(
      menuBackdrop(true),
      h(
        'header',
        { class: 'ghp-head gpanel' },
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: () => (at > 0 ? ((at -= 1), render()) : o.onBack()) }, icon('left')),
        h('h1', null, icon('hand'), ' ', t('camp.hand.title')),
        pickers.length > 1
          ? h(
              'div',
              { class: 'ghp-heroes' },
              pickers.map(({ x: p }, k) =>
                h(
                  'button',
                  { class: `ghp-hero${k === at ? ' is-on' : ''}${full(p.classId) ? ' is-done' : ''}`, title: figureName(`hero:${p.classId}`), onclick: () => ((at = k), render()) },
                  portrait(`hero:${p.classId}`, content.heroes[p.classId]?.color ?? '#888', 'sm'),
                ),
              ),
            )
          : null,
        h('div', { class: 'ghp-who' }, portrait(id, color, 'md'), h('b', null, figureName(id))),
      ),
      grid,
      h(
        'footer',
        { class: 'ghp-foot' },
        h('span', { class: 'ghp-sum' }, t('game.chooseHand', { n: need, picked: picked.length })),
        last
          ? artButton('check', t('game.ready'), finish, { cls: 'is-go', disabled: !pickers.every((p) => full(p.x.classId)) })
          : artButton('right', t('story.next'), () => ((at += 1), render()), { cls: 'is-go', disabled: picked.length !== need }),
      ),
    );
  }

  render();
  return root;
}

/** Card width so the deck fits in the grid without scrolling, 2–3 rows on a landscape tablet. */
function fit(el: HTMLElement, n: number): void {
  const ASPECT = 0.727; // card frame width / height (cardFrames.json)
  const GAP = 12;
  const run = () => {
    const w = el.clientWidth - 24;
    const hgt = el.clientHeight - 20;
    if (w <= 0 || hgt <= 0 || n === 0) return;
    let best = 0;
    for (let rows = 1; rows <= n; rows++) {
      const cols = Math.ceil(n / rows);
      best = Math.max(best, Math.min((w - (cols - 1) * GAP) / cols, ((hgt - (rows - 1) * GAP) / rows) * ASPECT));
    }
    el.style.setProperty('--hp-w', `${Math.floor(Math.min(best, 300))}px`);
  };
  new ResizeObserver(run).observe(el);
}
