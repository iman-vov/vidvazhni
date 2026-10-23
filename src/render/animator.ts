// A small tween clock for the board. Time advances only while the board renders a frame, scaled by
// the speed setting (1× or 2×). `cancelAll` resolves every pending wait at once, which is how
// skip() ends an animation queue: the caller then syncs to the final state.

export interface TweenOptions {
  /** Easing applied to k before update. Default: smoothstep. */
  ease?: (k: number) => number;
  /** Called once when the tween ends or is cancelled. */
  done?: () => void;
}

interface Tween {
  elapsed: number;
  duration: number;
  update: ((k: number, dt: number) => void) | null;
  ease: (k: number) => number;
  resolve: () => void;
  done?: () => void;
}

export const easeInOut = (k: number): number => k * k * (3 - 2 * k);
export const easeOut = (k: number): number => 1 - (1 - k) ** 3;
export const linear = (k: number): number => k;

export class Animator {
  speed = 1;
  private readonly tweens = new Set<Tween>();
  /** Increments on cancelAll so long-running steps can notice they were skipped. */
  generation = 0;

  get busy(): boolean {
    return this.tweens.size > 0;
  }

  /** Runs `update(k)` with k from 0 to 1 over `seconds` of board time. */
  tween(seconds: number, update: (k: number, dt: number) => void, opts: TweenOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      const t: Tween = { elapsed: 0, duration: Math.max(seconds, 1e-4), update, ease: opts.ease ?? easeInOut, resolve, ...(opts.done ? { done: opts.done } : {}) };
      this.tweens.add(t);
      update(0, 0);
    });
  }

  wait(seconds: number): Promise<void> {
    if (seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.tweens.add({ elapsed: 0, duration: seconds, update: null, ease: linear, resolve });
    });
  }

  /** Advances every tween by `dt` real seconds (times the speed). */
  tick(dt: number): void {
    const step = dt * this.speed;
    for (const t of [...this.tweens]) {
      t.elapsed += step;
      const k = Math.min(1, t.elapsed / t.duration);
      t.update?.(t.ease(k), step);
      if (k >= 1) this.finish(t);
    }
  }

  /** Ends every tween now: updates jump to k = 1 and all waits resolve. */
  cancelAll(): void {
    this.generation++;
    for (const t of [...this.tweens]) {
      try {
        t.update?.(1, 0);
      } catch {
        // A step whose objects were already removed; the final sync puts things right.
      }
      this.finish(t);
    }
  }

  private finish(t: Tween): void {
    if (!this.tweens.delete(t)) return;
    t.done?.();
    t.resolve();
  }
}
