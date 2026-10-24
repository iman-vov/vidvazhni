// Poses for the board's procedural movement: a jump (crouch, take-off, arc, landing squash), a
// flight (rise, glide with a bob, settle) and a push or pull (slide with stumbling steps and a lean).
// Pure functions of the animation progress k (0..1), so the board only applies them to a figure and
// tests can check the shapes. Heights are world units above the figure's normal stance.

export interface MovePose {
  /** Travel along the path, 0 at the start hex and 1 at the end. */
  travel: number;
  /** Lift above the ground. */
  y: number;
  /** Vertical scale of the body (squash < 1 < stretch); the sides keep the volume (1/√s). */
  squash: number;
  /** Lean in the direction of travel, radians (negative leans back). */
  lean: number;
}

/** Share of a jump's time spent crouching before take-off and absorbing the landing. */
export const JUMP_CROUCH = 0.2;
export const JUMP_LAND = 0.18;

/** How high a jump goes: higher for longer jumps, and always over what stands in the way
 *  (`clearance` = the tallest obstacle or figure under the arc, 0 when the way is clear). */
export function jumpHeight(hexes: number, clearance = 0): number {
  const base = Math.min(1.1, 0.32 + 0.18 * Math.max(1, hexes));
  return clearance > 0 ? Math.max(base, Math.min(1.6, clearance + 0.3)) : base;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);
const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/** The jump at progress k: crouch, arc (parabola over `height`), landing squash. */
export function jumpPose(k: number, height: number): MovePose {
  k = clamp01(k);
  const airEnd = 1 - JUMP_LAND;
  if (k < JUMP_CROUCH) {
    const u = k / JUMP_CROUCH;
    // Sink into the knees and lean into the jump; the last few percent spring back up.
    const dip = u < 0.8 ? smooth(u / 0.8) : 1 - smooth((u - 0.8) / 0.2) * 0.6;
    return { travel: 0, y: 0, squash: 1 - 0.2 * dip, lean: 0.22 * smooth(u) };
  }
  if (k < airEnd) {
    const u = (k - JUMP_CROUCH) / (airEnd - JUMP_CROUCH);
    // Stretched as it leaves the ground, round at the top, a little stretched again before landing.
    const stretch = u < 0.5 ? 0.14 * (1 - u / 0.5) ** 2 : 0.06 * ((u - 0.5) / 0.5) ** 2;
    return { travel: u, y: 4 * height * u * (1 - u), squash: 0.92 + 0.08 * Math.min(1, u * 6) + stretch, lean: 0.22 * (1 - u) - 0.12 * u };
  }
  const u = (k - airEnd) / JUMP_LAND;
  // Squash on touch-down, then a small overshoot back to standing.
  const squash = 1 - 0.24 * Math.sin(Math.PI * Math.min(1, u * 1.25)) + 0.04 * Math.sin(Math.PI * clamp01((u - 0.8) / 0.2));
  return { travel: 1, y: 0, squash, lean: -0.12 * (1 - u) };
}

/** Hover height of flying figures (ghosts) and the bob on top of it. */
export const HOVER_HEIGHT = 0.28;
export function hoverBob(time: number, phase = 0): number {
  return 0.06 * Math.sin(time * 2.1 + phase) + 0.025 * Math.sin(time * 3.7 + phase * 1.7);
}

/** A flight at progress k: rises to `height`, glides leaning forward, settles back to the hover. */
export function flyPose(k: number, height: number): MovePose {
  k = clamp01(k);
  const rise = smooth(clamp01(k / 0.3));
  const fall = smooth(clamp01((k - 0.7) / 0.3));
  const travel = smooth(clamp01((k - 0.08) / 0.84));
  return { travel, y: height * (rise - fall), squash: 1, lean: 0.18 * rise * (1 - fall) };
}

/** A push or pull at progress k over `hexes`: a fast slide that slows down, a stumbling step per
 *  hex, the body thrown along the push and catching itself with a little wobble. */
export function slidePose(k: number, hexes: number): MovePose {
  k = clamp01(k);
  const travel = 1 - (1 - k) ** 2.4;
  const steps = Math.max(1, hexes);
  const hop = Math.abs(Math.sin(Math.PI * steps * travel)) * 0.07 * (1 - k * 0.6);
  // Thrown along the push at once, then rocking back past upright and settling.
  const lean = 0.32 * Math.sin(Math.PI * Math.min(1, k * 2.2)) * (1 - k) - 0.1 * Math.sin(Math.PI * clamp01((k - 0.45) / 0.55));
  return { travel, y: hop, squash: 1 - hop * 0.6, lean };
}

/** Splits a lean in a world direction into the body's own pitch and roll for its yaw (rotation
 *  order YXZ: pitch forward is +x, a lean to the figure's right is −z). */
export function leanAngles(lean: number, yaw: number, dirX: number, dirZ: number): { pitch: number; roll: number } {
  if (lean === 0 || (dirX === 0 && dirZ === 0)) return { pitch: 0, roll: 0 };
  const rel = Math.atan2(dirX, dirZ) - yaw;
  return { pitch: lean * Math.cos(rel), roll: -lean * Math.sin(rel) };
}
