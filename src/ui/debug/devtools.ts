// Dev-server-only console helpers for driving and inspecting the debug overlay
// (used when testing the overlay through browser automation). Not part of production builds.

interface DbgHandle {
  session: { state: import('../../rules/state').GameState } | null;
}

export function installDevtools(): void {
  const w = window as unknown as Record<string, unknown> & { __dbg?: DbgHandle };
  /** Clicks the i-th enabled button whose text contains `text`; returns its text. */
  w.ct = (text: string, i = 0): string => {
    const list = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes(text) && !b.disabled);
    const b = list[i];
    b?.click();
    return b ? (b.textContent ?? '') : 'NOT FOUND';
  };
  /** Answers every pending avoid-damage question with «take damage». */
  w.take = (): number => {
    let n = 0;
    while (w.__dbg?.session?.state.pending?.kind === 'avoidDamage' && n++ < 20) (w.ct as (t: string) => string)('Прийняти шкоду');
    return n;
  };
  /** Plays a half of a selected card by its visible name: 'top' | 'bottom' | 'basicTop' | 'basicBottom'. */
  w.play = (name: string, half: string): string => {
    const card = [...document.querySelectorAll<HTMLElement>('.dbg-actions .dbg-card')].find((c) => c.querySelector('.dbg-card-head b')?.textContent === name);
    const buttons = card ? [...card.querySelectorAll<HTMLButtonElement>('button')] : [];
    const b = buttons[['top', 'bottom', 'basicTop', 'basicBottom'].indexOf(half)];
    if (!b || b.disabled) return 'NOT AVAILABLE';
    b.click();
    return b.textContent ?? '';
  };
  /** Compact state summary. */
  w.sum = () => {
    const s = w.__dbg?.session?.state;
    if (!s) return null;
    const figs = Object.values(s.figures).map((x) => {
      let line = `${x.id}@${x.hex.join(',')} ${x.hp}/${x.maxHp}`;
      if (x.kind === 'hero') line += ` hand:${x.hand.length} disc:${x.discard.length} lost:${x.lost.length}${x.exhausted ? ' EXH' : ''}${x.downed ? ' DOWN' : ''} mom:${x.momentum}`;
      const c = Object.keys(x.conditions);
      return c.length ? `${line} [${c.join(',')}]` : line;
    });
    const p = s.pending;
    return {
      round: s.round,
      phase: s.phase,
      pending: p && { kind: p.kind, hero: 'heroId' in p ? p.heroId : 'heroIds' in p ? p.heroIds : null, step: p.kind === 'stepChoice' ? JSON.stringify(p.step) : undefined },
      figs,
      orbs: s.variants.orbs ? JSON.stringify(s.orbs) : JSON.stringify(s.elements),
      prompt: document.querySelector('.dbg-prompt')?.textContent,
      notice: document.querySelector('.dbg-error')?.textContent,
      buttons: [...document.querySelectorAll<HTMLButtonElement>('.dbg-actions button:not(:disabled)')].map((b) => b.textContent).slice(0, 40),
    };
  };
  /** Text of the hand cards shown in the left panel. */
  w.cards = () => [...document.querySelectorAll<HTMLElement>('.dbg-left .dbg-cards .dbg-card')].map((c) => c.innerText.replace(/\n/g, ' | ')).join('\n');
  /** Newest log entries as text. */
  w.logs = (n = 3) => [...document.querySelectorAll<HTMLElement>('.dbg-log-entry')].slice(0, n).map((e) => e.innerText).join('\n---\n');
}
