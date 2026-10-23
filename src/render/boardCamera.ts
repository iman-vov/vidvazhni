// Camera and gestures of the 3D board: a target point on the ground and a distance along a fixed
// pitch (55°, inside the style guide's 45–60°). One pointer pans, two pinch, the wheel zooms; taps,
// double taps and long presses are reported with screen coordinates for picking. Same behaviour
// as render/board.ts (phase 0), plus long press, focus on a point and bounds that grow with rooms.

import * as THREE from 'three';
import { HEX_SIZE } from './hexLayout';
import { PLATE_HEIGHT } from './boardTiles';

const FOV = 40;
const PITCH = THREE.MathUtils.degToRad(55);
const MIN_DISTANCE = 4 * HEX_SIZE;
const FIT_MARGIN = 0.9;
/** The game UI puts the initiative bar along the top, so the board leaves more room there. */
const FIT_MARGIN_TOP = 0.8;
const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;
const HOLD_MS = 500;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;
const TWEEN_MS = 450;
const FIGURE_TOP = 1.8;

export interface CameraHandlers {
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  hold(x: number, y: number): void;
  changed(): void;
}

interface Tween {
  start: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromDistance: number;
  toDistance: number;
}

export class BoardCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);
  private readonly target = new THREE.Vector3();
  private readonly homeTarget = new THREE.Vector3();
  private distance = 20;
  private fitDistance = 20;
  private maxDistance = 40;
  private userMoved = false;
  private tween: Tween | null = null;
  private bounds = new THREE.Box2(new THREE.Vector2(-3, -3), new THREE.Vector2(3, 3));
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATE_HEIGHT);
  private readonly ndc = new THREE.Vector2();
  private readonly scratch = new THREE.Vector3();
  private width = 1;
  private height = 1;

  // Gestures.
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private mode: 'none' | 'pan' | 'pinch' = 'none';
  private readonly dragAnchor = new THREE.Vector3();
  private pinchStartSpread = 1;
  private pinchStartDistance = 20;
  private tapCandidate: { id: number; x: number; y: number; t: number } | null = null;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private holdTimer = 0;
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
  }

  get animating(): boolean {
    return this.tween !== null;
  }

  /** Sets the board extent (XZ). Refits the home view unless the player moved the camera. */
  setBounds(b: THREE.Box2, animate = false): void {
    const next = b.clone().expandByScalar(HEX_SIZE);
    if (next.equals(this.bounds)) return;
    this.bounds = next;
    if (animate && !this.userMoved) {
      // A room opened: glide out to the new home view instead of jumping.
      this.fitHome(false);
      this.tween = { start: -1, fromTarget: this.target.clone(), toTarget: this.homeTarget.clone(), fromDistance: this.distance, toDistance: this.fitDistance };
      this.on.changed();
    } else this.fitHome(!this.userMoved);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitHome(!this.userMoved);
  }

  private update(): void {
    const t = this.target;
    this.camera.position.set(t.x, t.y + Math.sin(PITCH) * this.distance, t.z + Math.cos(PITCH) * this.distance);
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.bounds.min.x, this.bounds.max.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  private clampDistance(d: number): number {
    return THREE.MathUtils.clamp(d, MIN_DISTANCE, this.maxDistance);
  }

  /** Screen extent of the board in NDC for the current camera: [maxAbsX, minY, maxY]. */
  private projectedExtent(): [number, number, number] {
    const b = this.bounds;
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
      p.set(x, y, z).project(this.camera);
      maxX = Math.max(maxX, Math.abs(p.x));
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return [maxX, minY, maxY];
  }

  /** Finds the view that shows the whole board centred on screen; `apply` moves the camera there. */
  private fitHome(apply: boolean): void {
    const keepTarget = this.target.clone();
    const keepDistance = this.distance;
    const c = this.bounds.getCenter(new THREE.Vector2());
    this.target.set(c.x, 0, c.y);
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5;
      let hi = 500;
      for (let i = 0; i < 30; i++) {
        this.distance = (lo + hi) / 2;
        this.update();
        const [x, minY, maxY] = this.projectedExtent();
        if (x <= FIT_MARGIN && minY >= -FIT_MARGIN && maxY <= FIT_MARGIN_TOP) hi = this.distance;
        else lo = this.distance;
      }
      this.distance = hi;
      this.update();
      const [, minY, maxY] = this.projectedExtent();
      this.raycaster.setFromCamera(this.ndc.set(0, (minY + maxY) / 2), this.camera);
      if (this.raycaster.ray.intersectPlane(this.ground, this.scratch)) this.target.z = this.scratch.z;
    }
    this.homeTarget.copy(this.target);
    this.fitDistance = this.distance;
    this.maxDistance = Math.max(this.fitDistance * 1.6, MIN_DISTANCE);
    if (!apply) {
      this.target.copy(keepTarget);
      this.distance = this.clampDistance(keepDistance);
    }
    this.update();
  }

  /** Smoothly moves to a ground point; `closer` zooms in to a focus distance. */
  focusOn(point: THREE.Vector3, closer = true): void {
    const toDistance = closer ? Math.max(MIN_DISTANCE * 1.4, Math.min(this.distance, this.fitDistance * 0.62)) : this.distance;
    this.tween = { start: -1, fromTarget: this.target.clone(), toTarget: new THREE.Vector3(point.x, 0, point.z), fromDistance: this.distance, toDistance };
    this.userMoved = true;
    this.on.changed();
  }

  recentre(): void {
    this.tween = { start: -1, fromTarget: this.target.clone(), toTarget: this.homeTarget.clone(), fromDistance: this.distance, toDistance: this.fitDistance };
    this.userMoved = false;
    this.on.changed();
  }

  /** Advances the camera tween; call each frame. */
  step(now: number): void {
    const t = this.tween;
    if (!t) return;
    if (t.start < 0) t.start = now;
    const k = Math.min(1, (now - t.start) / TWEEN_MS);
    const e = 1 - (1 - k) ** 3;
    this.target.lerpVectors(t.fromTarget, t.toTarget, e);
    this.distance = THREE.MathUtils.lerp(t.fromDistance, t.toDistance, e);
    this.update();
    if (k >= 1) this.tween = null;
  }

  /** Ray from a screen point (client coordinates). */
  rayAt(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster;
  }

  groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    return this.rayAt(clientX, clientY).ray.intersectPlane(this.ground, out) !== null;
  }

  private dragTo(anchor: THREE.Vector3, x: number, y: number): void {
    if (this.groundAt(x, y, this.scratch)) {
      this.target.add(anchor).sub(this.scratch);
      this.clampTarget();
    }
    this.update();
    this.on.changed();
  }

  private firstTwo(): [{ x: number; y: number }, { x: number; y: number }] | null {
    const it = this.pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  private restartGesture(): void {
    if (this.pointers.size >= 2) {
      const pair = this.firstTwo();
      if (!pair) return;
      const [a, b] = pair;
      this.pinchStartSpread = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      this.pinchStartDistance = this.distance;
      this.mode = this.groundAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.dragAnchor) ? 'pinch' : 'none';
    } else if (this.pointers.size === 1) {
      const p = this.pointers.values().next().value;
      this.mode = p && this.groundAt(p.x, p.y, this.dragAnchor) ? 'pan' : 'none';
    } else this.mode = 'none';
  }

  private cancelHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = 0;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; the gesture works without it.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.tween = null;
    this.held = false;
    this.cancelHold();
    if (this.pointers.size === 1) {
      this.tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
      const { clientX, clientY } = e;
      this.holdTimer = window.setTimeout(() => {
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
    if (this.mode === 'pan' && !this.tapCandidate) {
      this.userMoved = true;
      this.dragTo(this.dragAnchor, e.clientX, e.clientY);
    } else if (this.mode === 'pinch') {
      const pair = this.firstTwo();
      if (!pair) return;
      const [a, b] = pair;
      const spread = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      this.userMoved = true;
      this.distance = this.clampDistance((this.pinchStartDistance * this.pinchStartSpread) / spread);
      this.update();
      this.dragTo(this.dragAnchor, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  };

  private endPointer(e: PointerEvent, cancelled: boolean): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const tap = this.tapCandidate;
    this.tapCandidate = null;
    this.cancelHold();
    if (!cancelled && !this.held && tap && tap.id === e.pointerId && e.timeStamp - tap.t <= TAP_MAX_MS) this.handleTap(e.clientX, e.clientY, e.timeStamp);
    if (this.pointers.size === 0) this.held = false;
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
    this.tween = null;
    this.userMoved = true;
    const step = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0015;
    const hasAnchor = this.groundAt(e.clientX, e.clientY, this.wheelAnchor);
    this.distance = this.clampDistance(this.distance * Math.exp(e.deltaY * step));
    this.update();
    if (hasAnchor) this.dragTo(this.wheelAnchor, e.clientX, e.clientY);
    else this.on.changed();
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  /** Camera state for tests and the dev page. */
  get state(): { target: THREE.Vector3; distance: number; size: [number, number] } {
    return { target: this.target.clone(), distance: this.distance, size: [this.width, this.height] };
  }

  dispose(): void {
    this.cancelHold();
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
  }
}
