// Pure maths of the board's camera gestures (no three.js), so they are unit-tested: how two
// fingers are read as pinch + twist + pan or as a tilt, how far a drag tilts or turns the view,
// the pitch limits and the damping that eases the camera toward where a gesture put it.

export interface Pt {
  x: number;
  y: number;
}

/** Camera pitch (angle of the view above the ground): home 55°, the player may tilt within 35–70°. */
export const PITCH_HOME = (55 * Math.PI) / 180;
export const PITCH_MIN = (35 * Math.PI) / 180;
export const PITCH_MAX = (70 * Math.PI) / 180;
/** Q/E turn the view by this much per press. */
export const KEY_YAW_STEP = (15 * Math.PI) / 180;
/** Two fingers must move this far (px) before the gesture is read as a pinch or a tilt. */
export const GESTURE_SLOP_PX = 10;
/** Exponential approach rate (1/s) of the shown camera toward the gesture's camera. */
export const DAMPING = 16;

export type TwoFingerMode = 'pinch' | 'tilt';

export function clampPitch(p: number): number {
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
}

/** Angle wrapped to (−π, π]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Midpoint, finger spread (px) and screen angle of the line from a to b (y down, radians). */
export function fingerFrame(a: Pt, b: Pt): { mid: Pt; spread: number; angle: number } {
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/**
 * Reads two fingers that moved from (a0, b0) to (a1, b1): a tilt when both slide the same way
 * mostly up or down while keeping their spread and angle, otherwise a pinch (zoom, twist and pan
 * at once). Null until the fingers have moved past the slop, so a gesture is not decided by jitter.
 */
export function classifyTwoFinger(a0: Pt, b0: Pt, a1: Pt, b1: Pt): TwoFingerMode | null {
  const da = { x: a1.x - a0.x, y: a1.y - a0.y };
  const db = { x: b1.x - b0.x, y: b1.y - b0.y };
  const ma = Math.hypot(da.x, da.y);
  const mb = Math.hypot(db.x, db.y);
  if (Math.max(ma, mb) < GESTURE_SLOP_PX) return null;
  // Touch moves arrive one finger at a time: wait for the other one unless this one went far alone.
  if (Math.min(ma, mb) < GESTURE_SLOP_PX * 0.6 && Math.max(ma, mb) < GESTURE_SLOP_PX * 4) return null;
  const f0 = fingerFrame(a0, b0);
  const f1 = fingerFrame(a1, b1);
  const spreadChange = Math.abs(f1.spread / f0.spread - 1);
  const twist = Math.abs(wrapAngle(f1.angle - f0.angle));
  const vertical = (d: Pt) => Math.abs(d.y) > 1.5 * Math.abs(d.x) && Math.abs(d.y) > GESTURE_SLOP_PX * 0.5;
  const together = Math.sign(da.y) === Math.sign(db.y);
  if (vertical(da) && vertical(db) && together && spreadChange < 0.15 && twist < (12 * Math.PI) / 180) return 'tilt';
  return 'pinch';
}

/** Zoom factor for the camera distance (fingers apart → closer) and the twist since the start. */
export function pinchChange(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { distanceScale: number; twist: number; pan: Pt } {
  const f0 = fingerFrame(a0, b0);
  const f1 = fingerFrame(a1, b1);
  return { distanceScale: f0.spread / f1.spread, twist: wrapAngle(f1.angle - f0.angle), pan: { x: f1.mid.x - f0.mid.x, y: f1.mid.y - f0.mid.y } };
}

/** Pitch after a vertical drag of `dy` px on a view `height` px tall: up flattens the view toward
 *  the horizon (like a map app), down looks more from above. A full-height drag spans the range. */
export function tiltAfterDrag(startPitch: number, dy: number, height: number): number {
  return clampPitch(startPitch + (dy / Math.max(1, height)) * (PITCH_MAX - PITCH_MIN) * 1.6);
}

/** Yaw after a horizontal mouse drag (right button): a full-width drag turns the view half round. */
export function yawAfterDrag(startYaw: number, dx: number, width: number): number {
  return startYaw - (dx / Math.max(1, width)) * Math.PI;
}

/** Fraction of the way to the goal after `dt` seconds of exponential damping. */
export function dampFactor(dt: number, rate = DAMPING): number {
  return 1 - Math.exp(-rate * Math.max(0, dt));
}

/** Shortest-way step of an angle toward a goal by fraction k. */
export function dampAngle(current: number, goal: number, k: number): number {
  return current + wrapAngle(goal - current) * k;
}
