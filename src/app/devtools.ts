// Dev-server-only console helpers for driving the game screen by browser automation: they press
// the same buttons and tap the same cards and hexes a player would. Not in production builds.

import type { Hex } from '../rules/hex';
import type { FigureId, GameState } from '../rules/state';

interface GameHandle {
  game: { state: GameState; exportJson(): string } | null;
  board: { screenPoint?: (target: FigureId | Hex) => { x: number; y: number } | null } | null;
}

function handle(): GameHandle | undefined {
  return (window as unknown as { __game?: GameHandle }).__game;
}

function tapAt(x: number, y: number): string {
  const el = document.elementFromPoint(x, y);
  if (!el) return 'NOTHING AT POINT';
  const opts = { bubbles: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, button: 0, pointerType: 'touch' };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  return el.tagName;
}

function press(el: Element, holdMs = 0): Promise<void> {
  const r = el.getBoundingClientRect();
  const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 9, isPrimary: true, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  return new Promise((resolve) =>
    setTimeout(() => {
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      resolve();
    }, holdMs),
  );
}

export function installGameDevtools(): void {
  const g = {
    /** Clicks the i-th enabled button whose text contains `text`. */
    click(text: string, i = 0): string {
      const list = [...document.querySelectorAll<HTMLButtonElement>('#overlay button')].filter((b) => b.textContent?.includes(text) && !b.disabled);
      const b = list[i];
      b?.click();
      return b ? (b.textContent ?? '') : 'NOT FOUND';
    },
    /** Taps a hand card by its visible name (select phase: toggles it). */
    card(name: string): string {
      const el = [...document.querySelectorAll('.gcard')].find((c) => c.querySelector('.gcard-name')?.textContent === name);
      if (!el) return 'NOT FOUND';
      void press(el);
      return name;
    },
    /** Long-presses a card (enlarges it). */
    hold(name: string): string {
      const el = [...document.querySelectorAll('.gcard')].find((c) => c.querySelector('.gcard-name')?.textContent === name);
      if (!el) return 'NOT FOUND';
      void press(el, 600);
      return name;
    },
    /** Plays a half of a chosen card in the turn panel. */
    half(name: string, half: 'top' | 'bottom'): string {
      const card = [...document.querySelectorAll('.gcard')].find((c) => c.querySelector('.gcard-name')?.textContent === name);
      const b = card?.querySelector<HTMLButtonElement>(`.gcard-${half}`);
      if (!b || b.disabled) return 'NOT AVAILABLE';
      b.click();
      return `${name} ${half}`;
    },
    /** Taps a hex or a figure on the board at its screen point. */
    tap(target: FigureId | Hex): string {
      const p = handle()?.board?.screenPoint?.(target);
      if (!p) return 'NO POINT';
      return tapAt(p.x, p.y);
    },
    sum() {
      const s = handle()?.game?.state;
      if (!s) return null;
      const p = s.pending;
      return {
        round: s.round,
        phase: s.phase,
        pending: p && { kind: p.kind, hero: 'heroId' in p ? p.heroId : 'heroIds' in p ? p.heroIds : null, step: p.kind === 'stepChoice' ? JSON.stringify(p.step) : undefined },
        figs: Object.values(s.figures).map((f) => `${f.id}@${f.hex.join(',')} ${f.hp}/${f.maxHp}${f.kind === 'hero' ? ` hand:${f.hand.length} disc:${f.discard.length} lost:${f.lost.length}${f.exhausted ? ' EXH' : ''}` : ''} ${Object.keys(f.conditions).join(',')}`),
        buttons: [...document.querySelectorAll<HTMLButtonElement>('.gbottom button:not(:disabled), .glayer button:not(:disabled)')].map((b) => b.textContent).slice(0, 30),
        hint: [...document.querySelectorAll('.gside-hint')].map((x) => x.textContent).join(' | '),
        toasts: [...document.querySelectorAll('.gtoast')].map((x) => x.textContent),
      };
    },
    log: () => handle()?.game?.exportJson(),
    /** Visible text of every card on screen. */
    hand: () => [...document.querySelectorAll<HTMLElement>('.gcard')].map((c) => c.innerText.split('\n').join(' | ')),
    /** Waits until the event animations are done, pressing «faster» (a hidden pane never animates). */
    async idle(): Promise<boolean> {
      let calm = 0;
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (document.querySelector('.gbar.is-busy')) {
          calm = 0;
          g.click('Швидше');
          g.click('Faster');
          g.click('Schneller');
        } else if (++calm >= 2) return true;
      }
      return false;
    },
  };
  (window as unknown as Record<string, unknown>).g = g;
}
