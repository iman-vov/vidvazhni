// The tutorial coach: a speech bubble and a glowing ring over the scenario screen. It reads the
// screen (querySelector) and the board (screen point of a hex or figure) to point at things, and
// listens to the game; it never acts for the player. Mounted next to the scenario screen in its own
// layer, so the screen itself knows nothing about it.

import type { BoardView } from '../../render/view';
import type { GameEvent } from '../../rules/state';
import type { Hex } from '../../rules/hex';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import type { GameController } from '../game';
import { richLine } from '../help/texts';
import { CoachScript, SCRIPT, SEL, type CoachTarget, type CoachView, type ScreenProbe } from './steps';
import './tutorial.css';

export interface CoachOptions {
  game: GameController;
  board: BoardView;
  /** The scenario overlay the coach reads. */
  screen: HTMLElement;
  /** The player ended the tutorial early. */
  onSkip: () => void;
}

const TICK_MS = 250;
const ACK = 'tutorial.';

type Pointable = { screenPoint?: (target: string | Hex) => { x: number; y: number } | null };

export function mountCoach(o: CoachOptions): () => void {
  const script = new CoachScript();
  // Steps acknowledged before a reload are kept with the game's shown hints.
  for (const key of o.game.meta.seenHints) if (key.startsWith(ACK)) script.ack(key.slice(ACK.length));
  const ack = (id: string) => {
    script.ack(id);
    o.game.markHint(ACK + id);
  };
  const events: GameEvent[] = [];
  let latest: GameEvent[] = [];
  let shown: string | null = null;
  let minimized = false;
  let askSkip = false;
  let view: CoachView | null = null;

  const rings: HTMLElement[] = [];
  const bubble = h('div', { class: 'tcoach-bubble', role: 'status', 'aria-live': 'polite' });
  const pill = h('button', { class: 'gbtn tcoach-pill', onclick: () => ((minimized = false), (shown = null), tick()) }, icon('hint'), t('tutorial.coach.show'));
  const layer = h('div', { class: 'tcoach' }, bubble, pill);
  document.body.append(layer);

  const probe: ScreenProbe = {
    has: (sel) => !!o.screen.querySelector(sel),
    count: (sel) => o.screen.querySelectorAll(sel).length,
  };

  const unsub = o.game.onChange((evs) => {
    events.push(...evs);
    latest = evs;
    tick();
  });

  function key(v: CoachView | null): string | null {
    if (!v) return null;
    const params = v.step.params?.(ctx()) ?? {};
    return `${v.step.id}|${JSON.stringify(params)}|${askSkip}`;
  }

  function ctx() {
    return { s: o.game.state, heroId: o.game.heroes()[0]?.id ?? '', events, latest, screen: probe, acked: script.acked };
  }

  function renderBubble(): void {
    if (!view) {
      bubble.replaceChildren();
      return;
    }
    const { step, tip } = view;
    const params = step.params?.(ctx()) ?? {};
    const pos = SCRIPT.indexOf(step);
    const foot = askSkip
      ? h(
          'div',
          { class: 'tcoach-foot' },
          h('p', { class: 'tcoach-ask' }, t('tutorial.coach.skipSure')),
          h('button', { class: 'gbtn', onclick: () => ((askSkip = false), (shown = null), tick()) }, t('tutorial.coach.skipNo')),
          h('button', { class: 'gbtn gbtn-primary', onclick: () => o.onSkip() }, t('tutorial.coach.skipYes')),
        )
      : h(
          'div',
          { class: 'tcoach-foot' },
          h('button', { class: 'gbtn gbtn-small tcoach-skip', onclick: () => ((askSkip = true), (shown = null), tick()) }, t('tutorial.coach.skip')),
          step.info
            ? h(
                'button',
                {
                  class: 'gbtn gbtn-primary tcoach-next',
                  onclick: () => {
                    ack(step.id);
                    shown = null;
                    tick();
                  },
                },
                t(tip ? 'tutorial.coach.ok' : 'tutorial.coach.next'),
                icon('right'),
              )
            : null,
        );
    bubble.replaceChildren(
      h(
        'div',
        { class: 'tcoach-head' },
        h('span', { class: 'tcoach-face' }, icon('hint')),
        h('small', null, t('tutorial.coach.name'), !tip && pos >= 0 ? ` · ${pos + 1}/${SCRIPT.length}` : ''),
        h('button', { class: 'gbtn gbtn-icon gbtn-small', 'aria-label': t('tutorial.coach.hide'), onclick: () => ((minimized = true), tick()) }, icon('down')),
      ),
      h('b', { class: 'tcoach-title' }, t(`tutorial.step.${step.id}.title`)),
      h('p', { class: 'tcoach-text' }, richLine(t(`tutorial.step.${step.id}.text`, params))),
      foot,
    );
  }

  /** Screen boxes of the target: the first match, every match (`all`), or a spot on the board. */
  function targetRects(target: CoachTarget): DOMRect[] {
    if (!target) return [];
    if ('selector' in target) {
      const all = [...o.screen.querySelectorAll(target.selector)];
      const els = target.all ? all : [target.text ? (all.flatMap((x) => [x, ...x.querySelectorAll('button')]).find((x) => x.textContent?.includes(target.text as string)) ?? all[0]) : all[0]];
      return els.map((el) => el?.getBoundingClientRect()).filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);
    }
    const board = o.board as unknown as Pointable;
    const p = board.screenPoint?.('hex' in target ? target.hex : target.figure);
    if (!p) return [];
    const size = 'hex' in target ? 64 : 84;
    return [new DOMRect(p.x - size / 2, p.y - size / 2, size, size)];
  }

  function place(rects: DOMRect[], round: boolean): void {
    const shownRects = minimized ? [] : rects;
    while (rings.length < shownRects.length) {
      const r = h('div', { class: 'tcoach-ring', 'aria-hidden': 'true' });
      rings.push(r);
      layer.prepend(r);
    }
    rings.forEach((ring, i) => {
      const rect = shownRects[i];
      ring.style.display = rect ? 'block' : 'none';
      if (!rect) return;
      ring.classList.toggle('is-round', round);
      const pad = 6;
      Object.assign(ring.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
    });
    const rect = shownRects.length ? shownRects.reduce((a, b) => new DOMRect(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right) - Math.min(a.left, b.left), Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top))) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = Math.min(380, vw - 24);
    bubble.style.width = `${bw}px`;
    const bh = bubble.offsetHeight || 160;
    let left = (vw - bw) / 2;
    let top = 12;
    if (rect) {
      left = Math.max(12, Math.min(vw - bw - 12, rect.left + rect.width / 2 - bw / 2));
      const above = rect.top - bh - 16;
      const below = rect.bottom + 16;
      if (rect.top + rect.height / 2 > vh / 2 && above >= 8) top = above;
      else if (below + bh <= vh - 8) top = below;
      else if (above >= 8) top = above;
      else {
        // The target fills the screen (the hand): put the bubble beside it at the top.
        top = 12;
        left = vw - bw - 12;
      }
    }
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function tick(): void {
    view = script.update({ s: o.game.state, heroId: o.game.heroes()[0]?.id ?? '', events, latest, screen: probe });
    const k = key(view);
    if (k !== shown) {
      shown = k;
      renderBubble();
    }
    // A stat card, an enlarged card, a keyword popover or the reference is open: step aside.
    const reading = probe.has(SEL.reading) || !!document.querySelector('.hhelp-modal, .hpop');
    const visible = !!view && !minimized && !reading;
    bubble.style.display = visible ? 'flex' : 'none';
    pill.style.display = view && minimized && !reading ? 'flex' : 'none';
    const target = visible && view ? (view.step.target?.(ctx()) ?? null) : null;
    place(visible ? targetRects(target) : [], !!target && !('selector' in target));
  }

  const timer = window.setInterval(tick, TICK_MS);
  window.addEventListener('resize', tick);
  tick();

  return () => {
    window.clearInterval(timer);
    window.removeEventListener('resize', tick);
    unsub();
    layer.remove();
  };
}
