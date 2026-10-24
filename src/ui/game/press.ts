// Tap vs long press on one element, touch and mouse alike. Moving the finger (scrolling the hand
// strip) cancels both. The handlers decide what to re-render; the element itself must survive
// until the finger lifts.

const HOLD_MS = 450;
const SLOP_PX = 12;

export interface PressHandlers {
  tap?: () => void;
  /** Finger down (before we know whether it is a tap or a hold). */
  down?: () => void;
  /** Held for HOLD_MS without moving. */
  hold?: () => void;
  /** Finger up or cancelled, after `down`. */
  up?: () => void;
}

export function onPress(el: HTMLElement, on: PressHandlers): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; id: number } | null = null;
  let held = false;
  const end = (tap: boolean) => {
    if (timer) clearTimeout(timer);
    timer = null;
    const wasDown = start !== null;
    start = null;
    if (wasDown) on.up?.();
    if (tap && !held) on.tap?.();
    held = false;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    held = false;
    on.down?.();
    timer = setTimeout(() => {
      timer = null;
      held = true;
      on.hold?.();
    }, HOLD_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) {
      held = true; // a drag is neither a tap nor a hold
      end(false);
    }
  });
  el.addEventListener('pointerup', (e) => {
    if (start && e.pointerId === start.id) end(true);
  });
  el.addEventListener('pointercancel', () => end(false));
  el.addEventListener('pointerleave', () => {
    if (start) end(false);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
