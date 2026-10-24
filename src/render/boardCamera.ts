// Camera and gestures of the 3D board: a target point on the ground, a distance, a yaw around the
// target and a pitch (home 55°, the player may tilt within 35–70°). Gestures move a goal camera;
// the shown camera follows it with smooth damping. Touch: one finger pans, two fingers pinch-zoom,
// twist to turn the view and pan together, or slide up/down together to tilt. Mouse: left (or
// middle, or shift+left) drag pans, right drag turns and tilts, the wheel zooms; Q/E turn the view.
// Taps, double taps and long presses are reported with screen coordinates for picking. Bounds keep
// the view centre over the board, so the board never leaves the screen.

import * as THREE from 'three';
import { HEX_SIZE } from './hexLayout';
import { PLATE_HEIGHT } from './boardTiles';
import {
  classifyTwoFinger,
  clampPitch,
  dampAngle,
  dampFactor,
  fingerFrame,
  KEY_YAW_STEP,
  PITCH_HOME,
  pinchChange,
  tiltAfterDrag,
  wrapAngle,
  yawAfterDrag,
  type Pt,
  type TwoFingerMode,
} from './cameraGestures';

const FOV = 40;
const MIN_DISTANCE = 4 * HEX_SIZE;
const FIT_MARGIN = 0.9;
/** The game UI puts the initiative bar along the top, so the board leaves more room there. */
const FIT_MARGIN_TOP = 0.8;
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;
const HOLD_MS = 500;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;
const FIGURE_TOP = 1.8;
/** The farthest home view still comfortable to tap on a tablet: about 12 hex columns by 7 rows.
 *  A bigger board gets a home view on its active area; the whole board is the overview. */
const COMFORT_COLS = 12;
const COMFORT_ROWS = 7;

export interface CameraHandlers {
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  hold(x: number, y: number): void;
  changed(): void;
}

/** Where the camera is: what it looks at, from how far, turned and tilted how much. */
export interface CameraPose {
  target: THREE.Vector3;
  distance: number;
  yaw: number;
  pitch: number;
}

/** Puts a camera at a pose: it sits `distance` from the target, `pitch` above the ground, turned by
 *  `yaw` around the vertical axis (yaw 0 looks toward −Z, as the home view). */
export function placeCamera(camera: THREE.Camera, p: CameraPose): void {
  const flat = Math.cos(p.pitch) * p.distance;
  camera.position.set(p.target.x + Math.sin(p.yaw) * flat, p.target.y + Math.sin(p.pitch) * p.distance, p.target.z + Math.cos(p.yaw) * flat);
  camera.lookAt(p.target);
  camera.updateMatrixWorld();
}

interface TwoFinger {
  a0: Pt;
  b0: Pt;
  mode: TwoFingerMode | null;
  distance: number;
  yaw: number;
  pitch: number;
  /** Ground point under the fingers' midpoint at the start (stays under it while pinching). */
  anchor: THREE.Vector3 | null;
}

export class BoardCamera {
  /** The camera that is drawn; it eases toward the goal pose. */
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  /** Where gestures put the camera; rays for gestures are cast from here, so fingers stay glued. */
  private readonly goalCamera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  private readonly shown: CameraPose = { target: new THREE.Vector3(), distance: 20, yaw: 0, pitch: PITCH_HOME };
  private readonly goal: CameraPose = { target: new THREE.Vector3(), distance: 20, yaw: 0, pitch: PITCH_HOME };
  private readonly homeTarget = new THREE.Vector3();
  private fitDistance = 20;
  /** The whole board (the overview), when it is farther than the comfortable home view. */
  private readonly overviewTarget = new THREE.Vector3();
  private overviewDistance = 20;
  /** The active area (figures in play); the home view centres on it when the board is too big. */
  private focusBox: THREE.Box2 | null = null;
  private maxDistance = 40;
  private userMoved = false;
  private lastStep = 0;
  private bounds = new THREE.Box2(new THREE.Vector2(-3, -3), new THREE.Vector2(3, 3));
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATE_HEIGHT);
  private readonly ndc = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();
  private width = 1;
  private height = 1;

  // Gestures.
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private mode: 'none' | 'pan' | 'two' | 'orbit' = 'none';
  private readonly dragAnchor = new THREE.Vector3();
  private two: TwoFinger | null = null;
  private orbitStart: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private tapCandidate: { id: number; x: number; y: number; t: number } | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private held = false;
  private readonly wheelAnchor = new THREE.Vector3();

  constructor(
    private readonly el: HTMLElement,
    private readonly on: CameraHandlers,
  ) {
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKeyDown);
  }

  /** Whether the shown camera is still easing toward the goal. */
  get animating(): boolean {
    const s = this.shown;
    const g = this.goal;
    return (
      s.target.distanceToSquared(g.target) > 1e-6 ||
      Math.abs(s.distance - g.distance) > 1e-3 ||
      Math.abs(wrapAngle(s.yaw - g.yaw)) > 1e-4 ||
      Math.abs(s.pitch - g.pitch) > 1e-4
    );
  }

  /** Whether the view is (or is heading back to) the home view: nothing to reset. */
  get atHome(): boolean {
    const g = this.goal;
    return (
      Math.abs(wrapAngle(g.yaw)) < 0.02 &&
      Math.abs(g.pitch - PITCH_HOME) < 0.02 &&
      Math.abs(g.distance / this.fitDistance - 1) < 0.08 &&
      g.target.distanceTo(this.homeTarget) < 0.6 * HEX_SIZE
    );
  }

  /** Whether the whole board is bigger than the home view, so an overview is worth offering. */
  get hasOverview(): boolean {
    return this.overviewDistance > this.fitDistance * 1.08;
  }

  /** Whether the view is (or is heading to) the overview of the whole board. */
  get atOverview(): boolean {
    const g = this.goal;
    return this.hasOverview && Math.abs(wrapAngle(g.yaw)) < 0.02 && Math.abs(g.distance / this.overviewDistance - 1) < 0.08 && g.target.distanceTo(this.overviewTarget) < 0.6 * HEX_SIZE;
  }

  /** Sets the board extent (XZ) and the active area (figures in play) the home view keeps in a
   *  comfortable zoom. Refits the home view unless the player moved the camera. */
  setBounds(b: THREE.Box2, animate = false, focus: THREE.Box2 | null = null): void {
    const next = b.clone().expandByScalar(HEX_SIZE);
    // The active area is taken with the board (a room opened), not on every move.
    if (next.equals(this.bounds)) return;
    this.bounds = next;
    this.focusBox = focus && !focus.isEmpty() ? focus.clone().expandByScalar(HEX_SIZE) : null;
    if (animate && !this.userMoved) {
      // A room opened: glide out to the new home view instead of jumping.
      this.fitHome();
      this.goHome();
      this.on.changed();
    } else {
      this.fitHome();
      if (!this.userMoved) this.jumpHome();
      else this.clampGoal();
    }
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    for (const c of [this.camera, this.goalCamera]) {
      c.aspect = w / h;
      c.updateProjectionMatrix();
    }
    this.fitHome();
    if (!this.userMoved) this.jumpHome();
    else this.update();
  }

  private update(): void {
    placeCamera(this.camera, this.shown);
    placeCamera(this.goalCamera, this.goal);
  }

  private clampGoal(): void {
    const t = this.goal.target;
    t.x = THREE.MathUtils.clamp(t.x, this.bounds.min.x, this.bounds.max.x);
    t.z = THREE.MathUtils.clamp(t.z, this.bounds.min.y, this.bounds.max.y);
    this.goal.distance = this.clampDistance(this.goal.distance);
    this.goal.pitch = clampPitch(this.goal.pitch);
    placeCamera(this.goalCamera, this.goal);
  }

  private clampDistance(d: number): number {
    return THREE.MathUtils.clamp(d, MIN_DISTANCE, this.maxDistance);
  }

  /** Screen extent of a box (default the board) in NDC for a camera: [maxAbsX, minY, maxY]. */
  private projectedExtent(camera: THREE.Camera, b: THREE.Box2 = this.bounds): [number, number, number] {
    let maxX = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    const p = this.scratch;
    // Figures on the far row stand up to ~1.5 above the plates: keep their heads and badges in view.
    for (const [x, y, z] of [
      [b.min.x, PLATE_HEIGHT, b.min.y],
      [b.max.x, PLATE_HEIGHT, b.min.y],
      [b.min.x, PLATE_HEIGHT, b.max.y],
      [b.max.x, PLATE_HEIGHT, b.max.y],
      [b.min.x, FIGURE_TOP, b.min.y + HEX_SIZE],
      [b.max.x, FIGURE_TOP, b.min.y + HEX_SIZE],
    ] as const) {
      p.set(x, y, z).project(camera);
      maxX = Math.max(maxX, Math.abs(p.x));
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return [maxX, minY, maxY];
  }

  /** Finds the home view (yaw 0, pitch 55°): the whole board centred on screen, or, when that is
   *  farther than the comfortable distance, the active area at no more than that distance. */
  private fitHome(): void {
    const all = this.fitBox(this.bounds);
    const c = this.bounds.getCenter(new THREE.Vector2());
    const hex = HEX_SIZE;
    const comfortBox = new THREE.Box2(new THREE.Vector2(c.x - (COMFORT_COLS * 0.75 * hex), c.y - (COMFORT_ROWS * 0.866 * hex)), new THREE.Vector2(c.x + COMFORT_COLS * 0.75 * hex, c.y + COMFORT_ROWS * 0.866 * hex));
    const comfort = this.fitBox(comfortBox).distance;
    this.overviewTarget.copy(all.target);
    this.overviewDistance = all.distance;
    let home = all;
    if (all.distance > comfort * 1.02) {
      home = this.focusBox ? this.fitBox(this.focusBox) : all;
      if (home.distance > comfort) {
        home.distance = comfort;
        // Keep the view centre over the board.
        home.target.x = THREE.MathUtils.clamp(home.target.x, this.bounds.min.x, this.bounds.max.x);
        home.target.z = THREE.MathUtils.clamp(home.target.z, this.bounds.min.y, this.bounds.max.y);
      }
    }
    this.homeTarget.copy(home.target);
    this.fitDistance = home.distance;
    this.maxDistance = Math.max(this.fitDistance * 1.6, this.overviewDistance * 1.1, MIN_DISTANCE);
  }

  /** The yaw-0 home-tilt pose that shows a box centred on screen. */
  private fitBox(box: THREE.Box2): CameraPose {
    const cam = new THREE.PerspectiveCamera(FOV, this.width / this.height, 0.1, 500);
    const c = box.getCenter(new THREE.Vector2());
    const pose: CameraPose = { target: new THREE.Vector3(c.x, 0, c.y), distance: 20, yaw: 0, pitch: PITCH_HOME };
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5;
      let hi = 500;
      for (let i = 0; i < 30; i++) {
        pose.distance = (lo + hi) / 2;
        placeCamera(cam, pose);
        const [x, minY, maxY] = this.projectedExtent(cam, box);
        if (x <= FIT_MARGIN && minY >= -FIT_MARGIN && maxY <= FIT_MARGIN_TOP) hi = pose.distance;
        else lo = pose.distance;
      }
      pose.distance = hi;
      placeCamera(cam, pose);
      const [, minY, maxY] = this.projectedExtent(cam, box);
      this.raycaster.setFromCamera(this.ndc.set(0, (minY + maxY) / 2), cam);
      if (this.raycaster.ray.intersectPlane(this.ground, this.scratch)) pose.target.z = this.scratch.z;
    }
    return pose;
  }

  private setGoalHome(): void {
    this.goal.target.copy(this.homeTarget);
    this.goal.distance = this.fitDistance;
    this.goal.yaw = this.shown.yaw - wrapAngle(this.shown.yaw); // the nearest full turn: no spin
    this.goal.pitch = PITCH_HOME;
    placeCamera(this.goalCamera, this.goal);
  }

  /** Home view at once (first layout, resize before the player touched the camera). */
  private jumpHome(): void {
    this.setGoalHome();
    this.shown.target.copy(this.goal.target);
    this.shown.distance = this.goal.distance;
    this.shown.yaw = this.goal.yaw;
    this.shown.pitch = this.goal.pitch;
    this.update();
  }

  /** Eases back to the home view. */
  private goHome(): void {
    this.setGoalHome();
    this.lastStep = 0;
  }

  /** Smoothly moves to a ground point; `closer` zooms in to a focus distance. */
  focusOn(point: THREE.Vector3, closer = true): void {
    if (closer) this.goal.distance = Math.max(MIN_DISTANCE * 1.4, Math.min(this.goal.distance, this.fitDistance * 0.62));
    this.goal.target.set(point.x, 0, point.z);
    this.clampGoal();
    this.userMoved = true;
    this.lastStep = 0;
    this.on.changed();
  }

  /** The whole board at once (on demand, when the home view shows only the active area). */
  overview(): void {
    this.goal.target.copy(this.overviewTarget);
    this.goal.distance = this.overviewDistance;
    this.goal.yaw = this.shown.yaw - wrapAngle(this.shown.yaw);
    this.goal.pitch = PITCH_HOME;
    placeCamera(this.goalCamera, this.goal);
    this.userMoved = true;
    this.lastStep = 0;
    this.on.changed();
  }

  /** Back to the home view: the whole board (or its active area), unturned, at the home tilt. */
  recentre(): void {
    this.goHome();
    this.userMoved = false;
    this.on.changed();
  }

  /** Eases the shown camera toward the goal; call each frame. */
  step(now: number): void {
    const dt = this.lastStep ? Math.min(0.1, (now - this.lastStep) / 1000) : 1 / 60;
    this.lastStep = now;
    if (!this.animating) {
      this.lastStep = 0;
      return;
    }
    const k = dampFactor(dt);
    const s = this.shown;
    const g = this.goal;
    s.target.lerp(g.target, k);
    s.distance += (g.distance - s.distance) * k;
    s.yaw = dampAngle(s.yaw, g.yaw, k);
    s.pitch += (g.pitch - s.pitch) * k;
    if (!this.animating) {
      s.target.copy(g.target);
      s.distance = g.distance;
      s.yaw = g.yaw;
      s.pitch = g.pitch;
    }
    placeCamera(this.camera, s);
  }

  /** Ray from a screen point (client coordinates) through the shown camera (for picking). */
  rayAt(clientX: number, clientY: number): THREE.Raycaster {
    return this.rayFrom(this.camera, clientX, clientY);
  }

  private rayFrom(camera: THREE.Camera, clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycaster;
  }

  groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    return this.rayAt(clientX, clientY).ray.intersectPlane(this.ground, out) !== null;
  }

  /** Ground point under a screen point for the goal camera (gestures). */
  private goalGroundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    return this.rayFrom(this.goalCamera, clientX, clientY).ray.intersectPlane(this.ground, out) !== null;
  }

  /** Moves the goal so the ground point `anchor` sits under the screen point (x, y). */
  private dragTo(anchor: THREE.Vector3, x: number, y: number): void {
    placeCamera(this.goalCamera, this.goal);
    if (this.goalGroundAt(x, y, this.scratch)) {
      this.goal.target.add(anchor).sub(this.scratch);
      this.clampGoal();
    }
    this.on.changed();
  }

  private firstTwo(): [Pt, Pt] | null {
    const it = this.pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  private restartGesture(): void {
    this.two = null;
    if (this.mode === 'orbit' && this.pointers.size === 1) return;
    this.orbitStart = null;
    if (this.pointers.size >= 2) {
      const pair = this.firstTwo();
      if (!pair) return;
      const [a, b] = pair;
      const mid = fingerFrame(a, b).mid;
      const anchor = new THREE.Vector3();
      this.two = {
        a0: { ...a },
        b0: { ...b },
        mode: null,
        distance: this.goal.distance,
        yaw: this.goal.yaw,
        pitch: this.goal.pitch,
        anchor: this.goalGroundAt(mid.x, mid.y, anchor) ? anchor : null,
      };
      this.mode = 'two';
    } else if (this.pointers.size === 1) {
      const p = this.pointers.values().next().value;
      this.mode = p && this.goalGroundAt(p.x, p.y, this.dragAnchor) ? 'pan' : 'none';
    } else this.mode = 'none';
  }

  private cancelHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = 0;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    if (mouse && e.button === 1) e.preventDefault(); // no autoscroll
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; the gesture works without it.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.held = false;
    this.cancelHold();
    if (mouse && e.button === 2) {
      // Right drag turns and tilts the view; it never taps.
      this.tapCandidate = null;
      this.mode = 'orbit';
      this.orbitStart = { x: e.clientX, y: e.clientY, yaw: this.goal.yaw, pitch: this.goal.pitch };
      return;
    }
    if (this.pointers.size === 1 && !(mouse && e.button === 1)) {
      this.tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
      const { clientX, clientY } = e;
      this.holdTimer = setTimeout(() => {
        this.holdTimer = 0;
        if (!this.tapCandidate) return;
        this.held = true;
        this.tapCandidate = null;
        this.on.hold(clientX, clientY);
      }, HOLD_MS);
    } else this.tapCandidate = null;
    this.restartGesture();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const c = this.tapCandidate;
    if (c && Math.hypot(e.clientX - c.x, e.clientY - c.y) > TAP_SLOP_PX) {
      this.tapCandidate = null;
      this.cancelHold();
    }
    if (this.held) return;
    if (this.mode === 'orbit' && this.orbitStart) {
      const o = this.orbitStart;
      this.userMoved = true;
      this.goal.yaw = yawAfterDrag(o.yaw, e.clientX - o.x, this.width);
      this.goal.pitch = tiltAfterDrag(o.pitch, e.clientY - o.y, this.height);
      placeCamera(this.goalCamera, this.goal);
      this.on.changed();
    } else if (this.mode === 'pan' && !this.tapCandidate) {
      this.userMoved = true;
      this.dragTo(this.dragAnchor, e.clientX, e.clientY);
    } else if (this.mode === 'two' && this.two) {
      const pair = this.firstTwo();
      if (pair) this.twoFingers(this.two, pair[0], pair[1]);
    }
  };

  private twoFingers(t: TwoFinger, a: Pt, b: Pt): void {
    t.mode ??= classifyTwoFinger(t.a0, t.b0, a, b);
    if (!t.mode) return;
    this.userMoved = true;
    if (t.mode === 'tilt') {
      const dy = (a.y - t.a0.y + (b.y - t.b0.y)) / 2;
      this.goal.pitch = tiltAfterDrag(t.pitch, dy, this.height);
      placeCamera(this.goalCamera, this.goal);
      this.on.changed();
      return;
    }
    const change = pinchChange(t.a0, t.b0, a, b);
    this.goal.distance = this.clampDistance(t.distance * change.distanceScale);
    // The board turns with the fingers: a clockwise twist on screen turns the view the other way.
    this.goal.yaw = t.yaw + change.twist;
    const mid = fingerFrame(a, b).mid;
    if (t.anchor) this.dragTo(t.anchor, mid.x, mid.y);
    else {
      placeCamera(this.goalCamera, this.goal);
      this.on.changed();
    }
  }

  private endPointer(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const tap = this.tapCandidate;
    this.tapCandidate = null;
    this.cancelHold();
    if (!cancelled && !this.held && tap && tap.id === e.pointerId && e.timeStamp - tap.t <= TAP_MAX_MS) this.handleTap(e.clientX, e.clientY, e.timeStamp);
    if (this.pointers.size === 0) {
      this.held = false;
      if (this.mode === 'orbit') this.mode = 'none';
    }
    this.restartGesture();
  }

  private readonly onPointerUp = (e: PointerEvent): void => this.endPointer(e, false);
  private readonly onPointerCancel = (e: PointerEvent): void => this.endPointer(e, true);

  private handleTap(x: number, y: number, t: number): void {
    const last = this.lastTap;
    if (last && t - last.t <= DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) <= DOUBLE_TAP_SLOP_PX) {
      this.lastTap = null;
      this.on.doubleTap(x, y);
      return;
    }
    this.lastTap = { x, y, t };
    this.on.tap(x, y);
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.userMoved = true;
    const step = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0015;
    const hasAnchor = this.goalGroundAt(e.clientX, e.clientY, this.wheelAnchor);
    this.goal.distance = this.clampDistance(this.goal.distance * Math.exp(e.deltaY * step));
    if (hasAnchor) this.dragTo(this.wheelAnchor, e.clientX, e.clientY);
    else {
      placeCamera(this.goalCamera, this.goal);
      this.on.changed();
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== 'q' && key !== 'e') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    // Only the board that is on screen.
    if (!this.el.isConnected || this.el.getClientRects().length === 0) return;
    this.rotateBy(key === 'q' ? -KEY_YAW_STEP : KEY_YAW_STEP);
  };

  /** Turns the view around its centre by `radians` (eased). */
  rotateBy(radians: number): void {
    this.userMoved = true;
    this.goal.yaw += radians;
    placeCamera(this.goalCamera, this.goal);
    this.on.changed();
  }

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  /** Camera state for tests and the dev page (the goal pose; `shown` is what is drawn now). */
  get state(): { target: THREE.Vector3; distance: number; yaw: number; pitch: number; size: [number, number]; shown: CameraPose } {
    const g = this.goal;
    const s = this.shown;
    return {
      target: g.target.clone(),
      distance: g.distance,
      yaw: g.yaw,
      pitch: g.pitch,
      size: [this.width, this.height],
      shown: { target: s.target.clone(), distance: s.distance, yaw: s.yaw, pitch: s.pitch },
    };
  }

  dispose(): void {
    this.cancelHold();
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKeyDown);
  }
}
