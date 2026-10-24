import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BoardCamera } from '../../src/render/boardCamera';
import {
  classifyTwoFinger,
  clampPitch,
  dampAngle,
  dampFactor,
  pinchChange,
  PITCH_HOME,
  PITCH_MAX,
  PITCH_MIN,
  tiltAfterDrag,
  wrapAngle,
} from '../../src/render/cameraGestures';

const deg = (d: number) => (d * Math.PI) / 180;

describe('camera gesture maths', () => {
  it('waits for the slop before deciding', () => {
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 102, y: 304 }, { x: 301, y: 305 })).toBeNull();
  });

  it('two fingers sliding up together tilt', () => {
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 103, y: 250 }, { x: 298, y: 252 })).toBe('tilt');
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 100, y: 360 }, { x: 300, y: 355 })).toBe('tilt');
  });

  it('spreading, twisting or opposite moves pinch', () => {
    // Apart: zoom.
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 60, y: 300 }, { x: 340, y: 300 })).toBe('pinch');
    // Twist: one finger up, the other down.
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 100, y: 330 }, { x: 300, y: 270 })).toBe('pinch');
    // Sideways together: pan.
    expect(classifyTwoFinger({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 150, y: 302 }, { x: 350, y: 301 })).toBe('pinch');
  });

  it('pinch reads zoom, twist and pan', () => {
    const c = pinchChange({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 0, y: 300 }, { x: 400, y: 300 });
    expect(c.distanceScale).toBeCloseTo(0.5);
    expect(c.twist).toBeCloseTo(0);
    const r = pinchChange({ x: 100, y: 300 }, { x: 300, y: 300 }, { x: 200, y: 200 }, { x: 200, y: 400 });
    expect(r.twist).toBeCloseTo(Math.PI / 2);
    expect(r.distanceScale).toBeCloseTo(1);
    expect(r.pan).toEqual({ x: 0, y: 0 });
  });

  it('tilt stays within 35–70°', () => {
    expect(clampPitch(deg(10))).toBeCloseTo(PITCH_MIN);
    expect(clampPitch(deg(89))).toBeCloseTo(PITCH_MAX);
    expect(tiltAfterDrag(PITCH_HOME, -2000, 800)).toBeCloseTo(PITCH_MIN);
    expect(tiltAfterDrag(PITCH_HOME, 2000, 800)).toBeCloseTo(PITCH_MAX);
    // Up flattens the view, down looks from above.
    expect(tiltAfterDrag(PITCH_HOME, -100, 800)).toBeLessThan(PITCH_HOME);
    expect(tiltAfterDrag(PITCH_HOME, 100, 800)).toBeGreaterThan(PITCH_HOME);
  });

  it('damping approaches the goal and turns the short way', () => {
    expect(dampFactor(0)).toBe(0);
    expect(dampFactor(1)).toBeGreaterThan(0.99);
    expect(dampAngle(deg(170), deg(-170), 0.5)).toBeCloseTo(deg(180));
    expect(wrapAngle(deg(370))).toBeCloseTo(deg(10));
  });
});

/** A stand-in element: records listeners so the test can send pointer events. */
function fakeElement(w: number, h: number) {
  const listeners = new Map<string, (e: unknown) => void>();
  const el = {
    addEventListener: (type: string, cb: (e: unknown) => void) => listeners.set(type, cb),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }),
    isConnected: true,
    getClientRects: () => [1],
  };
  let t = 0;
  const send = (type: string, id: number, x: number, y: number, extra: Record<string, unknown> = {}) =>
    listeners.get(type)?.({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: (t += 16), preventDefault() {}, ...extra });
  return { el: el as unknown as HTMLElement, send };
}

function makeCamera() {
  const { el, send } = fakeElement(1024, 768);
  const cam = new BoardCamera(el, { tap() {}, doubleTap() {}, hold() {}, changed() {} });
  cam.resize(1024, 768);
  cam.setBounds(new THREE.Box2(new THREE.Vector2(-6, -5), new THREE.Vector2(6, 5)));
  return { cam, send };
}

/** Lets the shown camera settle on the goal. */
function settle(cam: BoardCamera): void {
  for (let i = 1; i <= 120; i++) cam.step(i * 16);
}

/** Screen point of a world point for the shown camera. */
function screenOf(cam: BoardCamera, p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(cam.camera);
  return { x: ((v.x + 1) / 2) * 1024, y: ((1 - v.y) / 2) * 768 };
}

describe('BoardCamera gestures', () => {
  it('a twist turns the board with the fingers (ground under each finger stays under it)', () => {
    const { cam, send } = makeCamera();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    cam.groundAt(412, 400, a);
    cam.groundAt(612, 400, b);
    send('pointerdown', 1, 412, 400);
    send('pointerdown', 2, 612, 400);
    // Quarter turn clockwise on screen, in small steps.
    for (let i = 1; i <= 10; i++) {
      const ang = (i / 10) * (Math.PI / 4);
      send('pointermove', 1, 512 - 100 * Math.cos(ang), 400 - 100 * Math.sin(ang));
      send('pointermove', 2, 512 + 100 * Math.cos(ang), 400 + 100 * Math.sin(ang));
    }
    settle(cam);
    expect(Math.abs(wrapAngle(cam.state.yaw))).toBeGreaterThan(deg(20));
    const fa = screenOf(cam, a);
    const fb = screenOf(cam, b);
    const ang = Math.PI / 4;
    // Perspective makes it approximate; the fingers are 200 px apart.
    expect(Math.hypot(fa.x - (512 - 100 * Math.cos(ang)), fa.y - (400 - 100 * Math.sin(ang)))).toBeLessThan(30);
    expect(Math.hypot(fb.x - (512 + 100 * Math.cos(ang)), fb.y - (400 + 100 * Math.sin(ang)))).toBeLessThan(30);
  });

  it('pinching apart zooms in; two fingers sliding up tilt, clamped', () => {
    const { cam, send } = makeCamera();
    const d0 = cam.state.distance;
    send('pointerdown', 1, 412, 400);
    send('pointerdown', 2, 612, 400);
    send('pointermove', 1, 362, 400);
    send('pointermove', 2, 662, 400);
    send('pointerup', 1, 362, 400);
    send('pointerup', 2, 662, 400);
    expect(cam.state.distance).toBeLessThan(d0 * 0.8);

    send('pointerdown', 3, 412, 500);
    send('pointerdown', 4, 612, 500);
    for (let i = 1; i <= 100; i++) {
      send('pointermove', 3, 412, 500 - i * 8);
      send('pointermove', 4, 612, 500 - i * 8);
    }
    expect(cam.state.pitch).toBeCloseTo(PITCH_MIN);
    expect(cam.state.distance).toBeLessThan(d0 * 0.8); // tilt leaves the zoom alone
  });

  it('one finger pans but the view centre stays over the board', () => {
    const { cam, send } = makeCamera();
    send('pointerdown', 1, 500, 400);
    for (let i = 1; i <= 30; i++) send('pointermove', 1, 500 + i * 60, 400 + i * 30);
    const t = cam.state.target;
    expect(t.x).toBeGreaterThanOrEqual(-7.001);
    expect(t.x).toBeLessThanOrEqual(7.001);
    expect(t.z).toBeGreaterThanOrEqual(-6.001);
    expect(t.z).toBeLessThanOrEqual(6.001);
  });

  it('recentre goes back home: unturned, home tilt, nearest full turn', () => {
    const { cam } = makeCamera();
    expect(cam.atHome).toBe(true);
    cam.rotateBy(deg(300));
    settle(cam);
    expect(cam.atHome).toBe(false);
    cam.recentre();
    expect(cam.atHome).toBe(true);
    settle(cam);
    expect(Math.abs(cam.state.shown.yaw - cam.state.yaw)).toBeLessThan(1e-3);
    // From 300° the nearest home is 360°, not a 300° spin back.
    expect(cam.state.yaw).toBeCloseTo(2 * Math.PI);
    expect(cam.state.pitch).toBeCloseTo(PITCH_HOME);
  });
});
