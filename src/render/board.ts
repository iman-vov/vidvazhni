// Three.js view of the hex board. It only shows state handed to it and reports taps;
// all game logic lives in src/rules. Rendering is on demand: a frame is drawn only when
// the camera, highlights or tokens change, so an idle board costs nothing.

import * as THREE from 'three';
import { HEX_SIZE, hexKey, hexToWorld, worldToHex } from './hexLayout';
import { onGraphicsQualityChange, rendererPreset } from './quality';

export type Hex = [number, number];

export interface BoardToken {
  id: string;
  q: number;
  r: number;
  color: string;
  label: string;
}

export interface BoardOptions {
  hexes: Hex[];
}

export interface Board {
  /** Calls cb with the axial coordinates of every tapped board hex. Returns an unsubscribe function. */
  onHexTap(cb: (q: number, r: number) => void): () => void;
  /** Replaces the highlighted set. An empty array clears it. */
  setHighlights(hexes: Hex[], color?: string): void;
  /** Replaces the token set; tokens are matched by id, so moves reuse their meshes. */
  setTokens(tokens: BoardToken[]): void;
  dispose(): void;
}

const PLATE_HEIGHT = 0.22 * HEX_SIZE;
const PLATE_RADIUS = 0.94 * HEX_SIZE;
const PLATE_COLORS = ['#56647a', '#5d6c83', '#515f74'];
const DEFAULT_HIGHLIGHT = '#ffc457';
const BACKGROUND = '#1d2433';

const TOKEN_RADIUS = 0.42 * HEX_SIZE;
const TOKEN_HEIGHT = 0.5 * HEX_SIZE;
const LABEL_HEIGHT = 0.36 * HEX_SIZE;

const FOV = 40;
const PITCH = THREE.MathUtils.degToRad(55); // camera angle below the horizon
const MIN_DISTANCE = 4 * HEX_SIZE;
const FIT_MARGIN = 0.94; // fraction of the viewport the home view may fill

const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 350;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;
const RECENTRE_MS = 300;

interface TokenView {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  sprite: THREE.Sprite;
  color: string;
  label: string;
}

interface Tween {
  start: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromDistance: number;
  toDistance: number;
}

export function createBoard(container: HTMLElement, opts: BoardOptions): Board {
  // Graphics quality preset (render/quality.ts). Antialiasing is fixed when the WebGL context is
  // created, so a change of it applies to the next board; pixel ratio and shadows apply at once.
  const renderer = new THREE.WebGLRenderer({ antialias: rendererPreset().antialias });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.add(new THREE.HemisphereLight('#dfe7ff', '#262d3d', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 500);

  // --- Hex plates: one instanced mesh, per-instance colour for highlights.

  const hexes = opts.hexes;
  const plateGeometry = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_HEIGHT, 6, 1, false, Math.PI / 2);
  plateGeometry.translate(0, PLATE_HEIGHT / 2, 0);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });
  const plates = new THREE.InstancedMesh(plateGeometry, plateMaterial, Math.max(hexes.length, 1));
  plates.count = hexes.length;

  const indexByKey = new Map<string, number>();
  const baseColors: THREE.Color[] = [];
  const bounds = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
  const matrix = new THREE.Matrix4();
  hexes.forEach(([q, r], i) => {
    const { x, z } = hexToWorld(q, r);
    matrix.makeTranslation(x, 0, z);
    plates.setMatrixAt(i, matrix);
    const color = new THREE.Color(PLATE_COLORS[(((q - r) % 3) + 3) % 3]);
    baseColors.push(color);
    plates.setColorAt(i, color);
    indexByKey.set(hexKey(q, r), i);
    bounds.expandByPoint(new THREE.Vector2(x, z));
  });
  if (hexes.length === 0) bounds.set(new THREE.Vector2(0, 0), new THREE.Vector2(0, 0));
  bounds.expandByScalar(HEX_SIZE);
  plates.receiveShadow = true;
  scene.add(plates);

  const boardCentre = new THREE.Vector3();
  {
    const c = bounds.getCenter(new THREE.Vector2());
    boardCentre.set(c.x, 0, c.y);
  }

  // The sun keeps its direction but follows the board, so its shadow camera can cover the board.
  sun.target.position.copy(boardCentre);
  sun.position.copy(boardCentre).add(new THREE.Vector3(-4, 10, 6));
  {
    const half = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 2 + 2 * HEX_SIZE;
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
  }

  function applyQuality(): void {
    const preset = rendererPreset();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
    const shadows = preset.shadows !== 'none';
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      scene.traverse((o) => {
        const material = (o as THREE.Mesh).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true;
      });
    }
    sun.castShadow = shadows;
    if (shadows && sun.shadow.mapSize.x !== preset.shadowMapSize) {
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }
  applyQuality();

  // --- Camera state: a target on the ground, a distance along a fixed pitch.

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATE_HEIGHT); // plate tops
  const ndc = new THREE.Vector2();
  const scratch = new THREE.Vector3();

  const target = boardCentre.clone();
  const homeTarget = boardCentre.clone();
  let distance = 20;
  let fitDistance = 20;
  let maxDistance = 40;
  let userMoved = false;
  let tween: Tween | null = null;

  function updateCamera(): void {
    camera.position.set(target.x, target.y + Math.sin(PITCH) * distance, target.z + Math.cos(PITCH) * distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function clampTarget(): void {
    target.x = THREE.MathUtils.clamp(target.x, bounds.min.x, bounds.max.x);
    target.z = THREE.MathUtils.clamp(target.z, bounds.min.y, bounds.max.y);
  }

  function clampDistance(d: number): number {
    return THREE.MathUtils.clamp(d, MIN_DISTANCE, maxDistance);
  }

  const boundCorners = [
    new THREE.Vector3(bounds.min.x, PLATE_HEIGHT, bounds.min.y),
    new THREE.Vector3(bounds.max.x, PLATE_HEIGHT, bounds.min.y),
    new THREE.Vector3(bounds.min.x, PLATE_HEIGHT, bounds.max.y),
    new THREE.Vector3(bounds.max.x, PLATE_HEIGHT, bounds.max.y),
  ];
  const projected = new THREE.Vector3();

  /** Screen extent of the board in NDC for the current camera: [maxAbsX, minY, maxY]. */
  function projectedExtent(): [number, number, number] {
    let maxX = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of boundCorners) {
      projected.copy(c).project(camera);
      maxX = Math.max(maxX, Math.abs(projected.x));
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
    }
    return [maxX, minY, maxY];
  }

  /**
   * Finds the view that shows the whole board, centred on screen. Perspective makes the near edge
   * larger than the far one, so this projects the board corners instead of using a closed formula.
   * Leaves target/distance at the result.
   */
  function fitHome(): void {
    target.copy(boardCentre);
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5;
      let hi = 500;
      for (let i = 0; i < 30; i++) {
        distance = (lo + hi) / 2;
        updateCamera();
        const [x, minY, maxY] = projectedExtent();
        if (x <= FIT_MARGIN && minY >= -FIT_MARGIN && maxY <= FIT_MARGIN) hi = distance;
        else lo = distance;
      }
      distance = hi;
      updateCamera();
      // Shift the target so the board's projection is vertically centred.
      const [, minY, maxY] = projectedExtent();
      raycaster.setFromCamera(ndc.set(0, (minY + maxY) / 2), camera);
      if (raycaster.ray.intersectPlane(groundPlane, scratch)) target.z = scratch.z;
    }
    homeTarget.copy(target);
    fitDistance = distance;
  }

  // --- On-demand rendering.

  let frame = 0;
  let disposed = false;

  function requestRender(): void {
    if (!frame && !disposed) frame = requestAnimationFrame(renderFrame);
  }

  function renderFrame(now: number): void {
    frame = 0;
    if (tween) stepTween(now);
    renderer.render(scene, camera);
  }

  function stepTween(now: number): void {
    const t = tween;
    if (!t) return;
    if (t.start < 0) t.start = now;
    const k = Math.min(1, (now - t.start) / RECENTRE_MS);
    const e = 1 - (1 - k) ** 3;
    target.lerpVectors(t.fromTarget, t.toTarget, e);
    distance = THREE.MathUtils.lerp(t.fromDistance, t.toDistance, e);
    updateCamera();
    if (k < 1) requestRender();
    else tween = null;
  }

  function recentre(): void {
    tween = {
      start: -1,
      fromTarget: target.clone(),
      toTarget: homeTarget.clone(),
      fromDistance: distance,
      toDistance: fitDistance,
    };
    userMoved = false;
    requestRender();
  }

  function resize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const keepTarget = target.clone();
    const keepDistance = distance;
    fitHome();
    maxDistance = Math.max(fitDistance * 1.6, MIN_DISTANCE);
    if (userMoved) {
      target.copy(keepTarget);
      distance = clampDistance(keepDistance);
      updateCamera();
    }
    // setSize clears the canvas, so draw now rather than next frame to avoid a blank flash.
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const stopQuality = onGraphicsQualityChange(() => {
    applyQuality();
    resize();
  });

  // --- Picking: intersect the plate tops' plane, then snap to the nearest hex.

  function groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, out) !== null;
  }

  /** Moves the camera so that the world point `anchor` sits under the given screen point. */
  function dragTo(anchor: THREE.Vector3, clientX: number, clientY: number): void {
    if (groundAt(clientX, clientY, scratch)) {
      target.add(anchor).sub(scratch);
      clampTarget();
    }
    updateCamera();
    requestRender();
  }

  // --- Gestures: one pointer pans, two pinch (zoom + pan), wheel zooms, tap picks, double tap recentres.

  const tapListeners = new Set<(q: number, r: number) => void>();
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'none' | 'pan' | 'pinch' = 'none';
  const dragAnchor = new THREE.Vector3();
  let pinchStartSpread = 1;
  let pinchStartDistance = distance;
  let tapCandidate: { id: number; x: number; y: number; t: number } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;

  function firstTwo(): [{ x: number; y: number }, { x: number; y: number }] | null {
    const it = pointers.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  function startPan(x: number, y: number): void {
    mode = groundAt(x, y, dragAnchor) ? 'pan' : 'none';
  }

  function startPinch(): void {
    const pair = firstTwo();
    if (!pair) return;
    const [a, b] = pair;
    pinchStartSpread = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
    pinchStartDistance = distance;
    mode = groundAt((a.x + b.x) / 2, (a.y + b.y) / 2, dragAnchor) ? 'pinch' : 'none';
  }

  function restartGesture(): void {
    if (pointers.size >= 2) startPinch();
    else if (pointers.size === 1) {
      const p = pointers.values().next().value;
      if (p) startPan(p.x, p.y);
    } else mode = 'none';
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the gesture still works without it.
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween = null;
    userMoved = true;
    tapCandidate = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    restartGesture();
  }

  function onPointerMove(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (tapCandidate && Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > TAP_SLOP_PX) {
      tapCandidate = null;
    }
    if (mode === 'pan') {
      dragTo(dragAnchor, e.clientX, e.clientY);
    } else if (mode === 'pinch') {
      const pair = firstTwo();
      if (!pair) return;
      const [a, b] = pair;
      const spread = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      distance = clampDistance((pinchStartDistance * pinchStartSpread) / spread);
      updateCamera();
      dragTo(dragAnchor, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  }

  function endPointer(e: PointerEvent, cancelled: boolean): void {
    if (!pointers.delete(e.pointerId)) return;
    const tap = tapCandidate;
    tapCandidate = null;
    if (!cancelled && tap && tap.id === e.pointerId && e.timeStamp - tap.t <= TAP_MAX_MS) {
      handleTap(e.clientX, e.clientY, e.timeStamp);
    }
    restartGesture();
  }

  const onPointerUp = (e: PointerEvent) => endPointer(e, false);
  const onPointerCancel = (e: PointerEvent) => endPointer(e, true);

  function handleTap(x: number, y: number, t: number): void {
    if (lastTap && t - lastTap.t <= DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) <= DOUBLE_TAP_SLOP_PX) {
      lastTap = null;
      recentre();
      return;
    }
    lastTap = { x, y, t };
    if (!groundAt(x, y, scratch)) return;
    const [q, r] = worldToHex(scratch.x, scratch.z);
    if (!indexByKey.has(hexKey(q, r))) return;
    for (const cb of tapListeners) cb(q, r);
  }

  const wheelAnchor = new THREE.Vector3();

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    tween = null;
    userMoved = true;
    const step = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.05 : 0.0015;
    const hasAnchor = groundAt(e.clientX, e.clientY, wheelAnchor);
    distance = clampDistance(distance * Math.exp(e.deltaY * step));
    updateCamera();
    if (hasAnchor) dragTo(wheelAnchor, e.clientX, e.clientY);
    else requestRender();
  }

  const onContextMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  // --- Highlights.

  let highlighted: number[] = [];
  const highlightColor = new THREE.Color();

  function setHighlights(list: Hex[], color = DEFAULT_HIGHLIGHT): void {
    for (const i of highlighted) {
      const base = baseColors[i];
      if (base) plates.setColorAt(i, base);
    }
    highlightColor.set(color);
    highlighted = [];
    for (const [q, r] of list) {
      const i = indexByKey.get(hexKey(q, r));
      if (i === undefined) continue;
      plates.setColorAt(i, highlightColor);
      highlighted.push(i);
    }
    if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
    requestRender();
  }

  // --- Tokens.

  const tokenGeometry = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 24);
  tokenGeometry.translate(0, TOKEN_HEIGHT / 2, 0);
  const tokens = new Map<string, TokenView>();

  function makeLabel(text: string): THREE.Sprite {
    const fontPx = 48;
    const pad = 16;
    const font = `600 ${fontPx}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return new THREE.Sprite();
    ctx.font = font;
    c.width = Math.ceil(Math.max(ctx.measureText(text).width + pad * 2, fontPx * 1.5));
    c.height = Math.ceil(fontPx * 1.5);
    ctx.font = font; // resizing the canvas resets the context state
    ctx.fillStyle = 'rgba(20, 26, 38, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, c.height / 2);
    ctx.fill();
    ctx.fillStyle = '#eef1f6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);

    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set((LABEL_HEIGHT * c.width) / c.height, LABEL_HEIGHT, 1);
    sprite.position.y = PLATE_HEIGHT + TOKEN_HEIGHT + LABEL_HEIGHT * 1.2;
    sprite.renderOrder = 10;
    return sprite;
  }

  function disposeSprite(sprite: THREE.Sprite): void {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  }

  function setTokens(list: BoardToken[]): void {
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.id);
      let view = tokens.get(t.id);
      if (!view) {
        const material = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.6 });
        const body = new THREE.Mesh(tokenGeometry, material);
        body.position.y = PLATE_HEIGHT;
        const sprite = makeLabel(t.label);
        const group = new THREE.Group();
        group.add(body, sprite);
        scene.add(group);
        view = { group, material, sprite, color: t.color, label: t.label };
        tokens.set(t.id, view);
      }
      if (view.color !== t.color) {
        view.material.color.set(t.color);
        view.color = t.color;
      }
      if (view.label !== t.label) {
        view.group.remove(view.sprite);
        disposeSprite(view.sprite);
        view.sprite = makeLabel(t.label);
        view.group.add(view.sprite);
        view.label = t.label;
      }
      const { x, z } = hexToWorld(t.q, t.r);
      view.group.position.set(x, 0, z);
    }
    for (const [id, view] of tokens) {
      if (seen.has(id)) continue;
      scene.remove(view.group);
      view.material.dispose();
      disposeSprite(view.sprite);
      tokens.delete(id);
    }
    requestRender();
  }

  function dispose(): void {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    resizeObserver.disconnect();
    stopQuality();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    setTokens([]);
    tokenGeometry.dispose();
    plateGeometry.dispose();
    plateMaterial.dispose();
    plates.dispose();
    renderer.dispose();
    canvas.remove();
    tapListeners.clear();
  }

  return {
    onHexTap(cb) {
      tapListeners.add(cb);
      return () => tapListeners.delete(cb);
    },
    setHighlights,
    setTokens,
    dispose,
  };
}
