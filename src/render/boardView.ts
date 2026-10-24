// The phase-2 3D board (contract: render/view.ts). It shows a GameState — tiles, walls, props,
// figures with health and conditions, orbs — and plays the engine's events as animations one after
// another. The rules never wait for it: play() only paints what already happened, and always ends
// in the same picture as sync(stateAfter). Rendering is on demand; frames run continuously only
// while something moves.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ConditionId, Content, OrbId } from '../rules/content';
import { hexKey, parseHexKey, type Hex } from '../rules/hex';
import type { Figure, FigureId, GameEvent, GameState } from '../rules/state';
import { Animator, easeOut, linear } from './animator';
import { planAnimation, TIMING, type AnimStep } from './animPlan';
import { BoardCamera } from './boardCamera';
import { BoardEffects, ELEMENT_COLORS } from './boardEffects';
import { BoardEnvironment, type EnvironmentStats } from './environment';
import { BoardOverlay, CONDITION_ICONS, FigureBadge, type OverlayItem } from './boardOverlay';
import { PLATE_HEIGHT, TileLayer } from './boardTiles';
import { isFogCreature, lookOf, PROJECTILE } from './figureLook';
import { animateGlows, createFigureParts, disposeFigureParts, FigureView } from './figureView';

import { activeFigure, CELL_COLORS, planHighlights, type HighlightPlan } from './highlightPlan';
import { HEX_SIZE, hexToWorld, worldToHex } from './hexLayout';
import { flyPose, JUMP_CROUCH, JUMP_LAND, jumpHeight, jumpPose, leanAngles, slidePose, type MovePose } from './motion';
import { listModels } from './models';
import { castsShadow, getGraphicsQuality, onGraphicsQualityChange, rendererPreset, type GraphicsQuality } from './quality';
import type { BoardHighlights, BoardView, BoardViewOptions } from './view';
import { iconSvg } from '../ui/icons/svg';

const BACKGROUND = '#1b1d27';
/** Frame rate while only the rings under figures move. */
const RING_FPS = 24;
/** Frame rate of the idle board while the location lives (flames, dust, fog): low on tablets. */
const AMBIENT_FPS: Record<GraphicsQuality, number> = { low: 15, medium: 24, high: 30 };

/** Floating words and the reset button's label; everything else on the board is digits or icons. */
const LABELS: Record<'uk' | 'de' | 'en', { miss: string; shield: string; resetView: string }> = {
  uk: { miss: 'Промах', shield: 'Щит', resetView: 'Повернути огляд' },
  de: { miss: 'Daneben', shield: 'Schild', resetView: 'Ansicht zurücksetzen' },
  en: { miss: 'Miss', shield: 'Shield', resetView: 'Reset view' },
};

/** Extra handles for the dev page and tests; not part of the BoardView contract. */
export interface BoardViewDebug {
  /** Frames per second over the last second of continuous rendering (0 when idle). */
  stats(): { fps: number; calls: number; triangles: number; quality: GraphicsQuality; animating: boolean };
  readonly speed: number;
  setSpeed(speed: number): void;
  /** Screen point (client px) of a figure's feet or a hex centre, for automated taps. */
  screenPoint(target: FigureId | Hex): { x: number; y: number } | null;
  /** Advances animations by `seconds` of real time in fixed frames, rendering each (for checks in
   *  a background tab where requestAnimationFrame is throttled). */
  advance(seconds: number, fps?: number): Promise<void>;
  /** Stops time for real frames (advance() still moves it): for screenshots of a moment. */
  freeze(on: boolean): void;
  /** Renders `frames` frames back to back (waiting for the GPU) and returns ms per frame. */
  benchmark(frames: number): number;
  /** What the environment around the board is built of. */
  environment(): EnvironmentStats;
  readonly scene: THREE.Scene;
  /** The camera's goal pose (yaw/pitch in radians) and the pose drawn now. */
  camera(): BoardCamera['state'];
  /** Figures on the board with their model state. */
  figures(): { id: FigureId; model: string | null; clip: string | null; hex: Hex; visible: boolean }[];
}

interface Job {
  events: GameEvent[];
  after: GameState;
  content: Content;
  cancelled: boolean;
  resolve: () => void;
}

/** Per-job bookkeeping shared by the steps of one play() call. */
interface JobCtx {
  job: Job;
  gen: number;
  pending: Promise<void>[];
  lastHit: FigureId | null;
  actor: FigureId | null;
  /** Coins and chests that are gone in the state after the events: [prop key, hex]. */
  lootGone: { key: string; hex: Hex; chest: boolean }[];
  orbOwner: Partial<Record<OrbId, FigureId>>;
  /** Resolves when a running attack lands on this figure: its damage, conditions and death wait
   *  for it, so numbers never show before the blow or the arrow arrives. */
  impacts: Map<FigureId, Promise<void>>;
}

/** The figure a step happens to, for steps that must wait for an attack to land. */
function stepTarget(step: AnimStep): FigureId | null {
  switch (step.kind) {
    case 'damage':
    case 'condition':
    case 'death':
    case 'downed':
    case 'slide':
    case 'heal':
      return step.figureId;
    default:
      return null;
  }
}

export function createBoardView(container: HTMLElement, opts: BoardViewOptions = {}): BoardView & BoardViewDebug {
  let quality: GraphicsQuality = opts.quality ?? getGraphicsQuality();
  const lang = opts.lang ?? 'uk';
  const available = new Set(listModels());

  // --- DOM: a root that holds the canvas and the HTML overlay; gestures listen on the root, so the
  // canvas can be replaced when antialiasing changes.
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;';
  container.appendChild(root);

  let renderer = makeRenderer(quality);
  root.appendChild(renderer.domElement);
  const overlay = new BoardOverlay(root);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const hemi = new THREE.HemisphereLight('#fff3dc', '#2c2836', 1.15);
  const sun = new THREE.DirectionalLight('#fff1d8', 2.1);
  scene.add(hemi, sun, sun.target);
  let envTexture: THREE.Texture | null = null;

  const tiles = new TileLayer(quality);
  const environment = new BoardEnvironment(quality);
  const anim = new Animator();
  anim.speed = opts.speed ?? 1;
  const effects = new BoardEffects(anim);
  const parts = createFigureParts();
  scene.add(environment.root, tiles.root, effects.root);

  // Highlights: hex fills and frames (instanced), path dots.
  const fillGeo = new THREE.CircleGeometry(0.86 * HEX_SIZE, 6, Math.PI / 6).rotateX(-Math.PI / 2);
  // CircleGeometry's first vertex is at +X; flat-top hexes need a corner at +X, so no extra turn.
  fillGeo.rotateY(-Math.PI / 6);
  const frameGeo = new THREE.RingGeometry(0.78 * HEX_SIZE, 0.9 * HEX_SIZE, 6, 1, 0).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
  const frameMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
  const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
  let fills: THREE.InstancedMesh | null = null;
  let frames: THREE.InstancedMesh | null = null;
  let dots: THREE.InstancedMesh | null = null;
  let highlightLabels: OverlayItem[] = [];
  let highlights: BoardHighlights = {};
  let highlightPlan: HighlightPlan = { cells: [], targets: [], path: [] };

  const figures = new Map<FigureId, FigureView>();
  let state: GameState | null = null;
  let content: Content | null = null;

  const camera = new BoardCamera(root, {
    tap: (x, y) => onTap(x, y),
    doubleTap: (x, y) => onDoubleTap(x, y),
    hold: (x, y) => onHold(x, y),
    changed: () => requestRender(),
  });

  // «Reset view»: shown only while the camera is away from home.
  let resetButton: HTMLButtonElement | null = null;
  if (opts.resetButton !== false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bv-reset';
    b.title = b.ariaLabel = LABELS[lang].resetView;
    b.innerHTML = iconSvg('compass', { size: 24 });
    b.hidden = true;
    // Keep the press away from the board's gestures (no pan, no tap through to a hex).
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => resetCamera());
    root.appendChild(b);
    resetButton = b;
  }

  function resetCamera(): void {
    camera.recentre();
  }

  // ─── Renderer & quality ─────────────────────────────────────────────────

  function makeRenderer(q: GraphicsQuality): THREE.WebGLRenderer {
    const preset = rendererPreset(q);
    const r = new THREE.WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' });
    r.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const c = r.domElement;
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    return r;
  }

  function buildEnvironment(): void {
    envTexture?.dispose();
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = envTexture;
    // Metal armour reads as metal with a little room light; the board stays lit by sun and sky.
    scene.environmentIntensity = 0.45;
  }

  function applyQuality(): void {
    const preset = rendererPreset(quality);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio));
    const shadows = preset.shadows !== 'none';
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    if (shadows && sun.shadow.mapSize.x !== preset.shadowMapSize) {
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    tiles.setCastShadows(castsShadow(preset, 'prop'));
    for (const fv of figures.values()) fv.setCastShadow(castsShadow(preset, fv.look.kind === 'hero' ? 'hero' : 'monster'));
    scene.traverse((o) => {
      const material = (o as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true;
    });
  }

  function setQuality(q: GraphicsQuality): void {
    if (q === quality) return;
    const oldAA = rendererPreset(quality).antialias;
    quality = q;
    if (rendererPreset(q).antialias !== oldAA) {
      // WebGL fixes antialiasing when the context is created: swap in a new renderer.
      const old = renderer;
      renderer = makeRenderer(q);
      root.insertBefore(renderer.domElement, old.domElement);
      old.domElement.remove();
      old.dispose();
      buildEnvironment();
      resize();
    }
    applyQuality();
    environment.setQuality(q);
    tiles.setLook(q);
    for (const fv of figures.values()) void fv.loadModel(q, available, figureCastsShadow(fv));
    requestRender();
  }

  function figureCastsShadow(fv: FigureView): boolean {
    return castsShadow(rendererPreset(quality), fv.look.kind === 'hero' ? 'hero' : 'monster');
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  let frame = 0;
  let disposed = false;
  let lastTime = 0;
  let settleUntil = 0;
  let playing = false;
  let frozen = false;
  let fpsFrames = 0;
  let fpsStart = 0;
  let fps = 0;
  const orbAnchor = new THREE.Vector3();
  let ringTimer: ReturnType<typeof setTimeout> | 0 = 0;

  function requestRender(): void {
    if (!frame && !disposed) frame = requestAnimationFrame(renderFrame);
  }

  /** Keeps frames coming for a little while (cross-fades into idle). */
  function settle(seconds = 0.45): void {
    settleUntil = Math.max(settleUntil, performance.now() + (seconds * 1000) / anim.speed);
    requestRender();
  }

  function drawFrame(now: number, dt: number): void {
    camera.step(now);
    anim.tick(dt);
    const animDt = dt * anim.speed;
    overlay.time += animDt;
    environment.update(now / 1000);
    const t = now / 1000;
    animateGlows(parts, t);
    for (const fv of figures.values()) {
      fv.update(animDt);
      fv.spinGlow(t);
    }
    if (effects.hasOrbs) effects.placeOrbs((id) => orbPoint(id), animDt, movingOrbs);
    renderer.render(scene, camera.camera);
    overlay.update(camera.camera, root.clientWidth, root.clientHeight);
    if (resetButton) resetButton.hidden = camera.atHome;
  }

  function renderFrame(now: number): void {
    frame = 0;
    const continuous = lastTime > 0;
    const dt = frozen ? 0 : continuous ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    drawFrame(now, dt);

    if (continuous) {
      fpsFrames++;
      if (now - fpsStart >= 1000) {
        fps = (fpsFrames * 1000) / (now - fpsStart);
        fpsFrames = 0;
        fpsStart = now;
      }
    } else {
      fpsFrames = 0;
      fpsStart = now;
    }
    // Frozen (screenshots of a moment): hold the last frame; advance() still draws.
    const busy = !frozen && (anim.busy || camera.animating || playing || overlay.hasTimed || now < settleUntil);
    if (busy) frame = requestAnimationFrame(renderFrame);
    else {
      lastTime = 0;
      fps = 0;
      // A turning ring under the active figure or a living location: keep drawing, but slowly
      // (saves the tablet's battery).
      const idleFps = Math.max([...figures.values()].some((fv) => fv.glowing) ? RING_FPS : 0, environment.animated ? AMBIENT_FPS[quality] : 0);
      if (!frozen && !ringTimer && idleFps > 0 && !document.hidden) {
        ringTimer = setTimeout(() => {
          ringTimer = 0;
          requestRender();
        }, 1000 / idleFps);
      }
    }
  }

  function resize(): void {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.resize(w, h);
    renderer.render(scene, camera.camera);
    overlay.update(camera.camera, w, h);
  }

  buildEnvironment();
  applyQuality();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  // The idle loop stops in a hidden tab; pick it up again when the tab is shown.
  const onVisibility = () => {
    if (!document.hidden) requestRender();
  };
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  tiles.onChange = requestRender;
  environment.onChange = requestRender;
  tiles.obstacleFactory = (model) => environment.makeObstacle(model);
  tiles.propModel = (key, height) => environment.propModel(key, height);
  tiles.propGlow = (key, height) => environment.propGlow(key, height);
  tiles.boundaryFactory = (kind, frames, low) => environment.boundary(kind, frames, low);
  tiles.pieceFactory = (id) => environment.makePiece(id);
  // Blender kit pieces arrive after the first build: rebuild door bodies and obstacles with them.
  environment.onKit = () => {
    tiles.resetProps();
    if (state) tiles.syncProps(state);
  };

  const stopQuality = onGraphicsQualityChange((q) => setQuality(q));

  function updateBounds(animate = false): void {
    const b = tiles.bounds();
    if (!b) return;
    camera.setBounds(b, animate);
    const c = b.getCenter(new THREE.Vector2());
    // Walls stand a hex ring outside the board: keep their shadows inside the shadow camera.
    const half = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2 + 3 * HEX_SIZE;
    sun.target.position.set(c.x, 0, c.y);
    sun.position.set(c.x - 5, 12, c.y + 7);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -half * 1.3;
    cam.right = cam.top = half * 1.3;
    cam.near = 0.5;
    cam.far = 50;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }

  // ─── Figures ─────────────────────────────────────────────────────────────

  function shownInState(f: Figure): boolean {
    return !(f.kind === 'hero' && f.exhausted);
  }

  function shieldOf(f: Figure): number {
    return f.shields.reduce((sum, s) => sum + s.value, 0);
  }

  function ensureFigure(f: Figure, c: Content): FigureView {
    const look = lookOf(f, c);
    let fv = figures.get(f.id);
    if (fv && !fv.sameLook(look)) {
      removeFigure(fv);
      fv = undefined;
    }
    if (!fv) {
      fv = new FigureView(f, look, parts);
      fv.onChange = () => {
        settle(0.3);
      };
      const badge = new FigureBadge(look.kind);
      fv.badge = badge;
      const view = fv;
      fv.badgeItem = overlay.add(badge.el, () => (view.root.visible ? view.headPoint() : null));
      scene.add(fv.root);
      figures.set(f.id, fv);
      void fv.loadModel(quality, available, figureCastsShadow(fv));
    }
    return fv;
  }

  /** New figures look at the nearest figure of the other side (heroes at monsters and back). */
  function faceNearestFoe(fv: FigureView): void {
    const hero = !isFogCreature(fv.id);
    let best: FigureView | null = null;
    let bestD = Infinity;
    for (const o of figures.values()) {
      if (o === fv || !isFogCreature(o.id) === hero) continue;
      const d = o.root.position.distanceToSquared(fv.root.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) fv.setYaw(fv.yawTo(best.root.position.x, best.root.position.z));
  }

  function removeFigure(fv: FigureView): void {
    overlay.remove(fv.badgeItem);
    fv.dispose();
    figures.delete(fv.id);
  }

  function applyFigureState(fv: FigureView, f: Figure, pop = false): void {
    fv.hp = f.hp;
    fv.maxHp = f.maxHp;
    fv.conditions = Object.keys(f.conditions) as ConditionId[];
    fv.shield = shieldOf(f);
    fv.badge?.setHp(f.hp, f.maxHp);
    fv.badge?.setConditions(fv.conditions, fv.shield, pop);
    const downed = f.kind === 'hero' && f.downed;
    if (downed !== fv.downed) {
      fv.downed = downed;
      fv.setGrey(downed);
      if (downed) fv.holdDeath();
      else fv.playClip('idle', { crossFade: 0 });
    }
    fv.badge?.setDim(downed);
  }

  // ─── sync ────────────────────────────────────────────────────────────────

  /** Bumped by sync(): a queue cancelled by a sync must not paint its own end state afterwards. */
  let syncVersion = 0;

  function sync(s: GameState, c: Content): void {
    cancelJobs();
    syncVersion++;
    syncNow(s, c);
  }

  function syncNow(s: GameState, c: Content): void {
    state = s;
    content = c;
    const scenario = c.scenarios[s.scenarioId];
    if (scenario) {
      environment.build(scenario, s.board.revealedRooms);
      environment.applyLighting(scene, hemi, sun);
      tiles.setSurroundings(environment.footprint, environment.innerWallColor, environment.def?.surface ?? null, environment.defaultBoundary);
    }
    tiles.syncRooms(s, c);
    for (const id of tiles.revealed) tiles.setRoomRise(id, 1, null);
    tiles.syncProps(s);
    const seen = new Set<FigureId>();
    const created: FigureView[] = [];
    for (const f of Object.values(s.figures)) {
      if (!shownInState(f)) continue;
      seen.add(f.id);
      if (!figures.has(f.id)) created.push(ensureFigure(f, c));
      const fv = ensureFigure(f, c);
      fv.gone = false;
      fv.placeAt(f.hex);
      fv.root.position.y = 0;
      fv.body.position.set(0, 0, 0);
      fv.body.rotation.set(0, fv.body.rotation.y, 0);
      fv.root.scale.setScalar(1);
      fv.setSquash(1);
      fv.setOpacity(1);
      fv.setYaw(fv.yaw);
      applyFigureState(fv, f);
      if (!fv.downed && fv.model && fv.model.current !== 'idle') fv.playClip('idle', { crossFade: 0 });
    }
    for (const fv of [...figures.values()]) if (!seen.has(fv.id)) removeFigure(fv);
    for (const fv of created) faceNearestFoe(fv);
    effects.syncOrbs(s.orbs);
    updateBounds();
    applyHighlights();
    settle(0.2);
  }

  /** Where an orb floats: above its owner, over its hex, or over the board centre. */
  function orbPoint(id: OrbId): THREE.Vector3 | null {
    const ownerId = playState ? playState.orbOwner[id] : state?.orbs[id]?.ownerId;
    const fv = ownerId ? figures.get(ownerId) : undefined;
    if (fv && fv.root.visible) return fv.headPoint(orbAnchor);
    const hex = state?.orbs[id]?.hex;
    if (hex) {
      const { x, z } = hexToWorld(hex[0], hex[1]);
      return orbAnchor.set(x, PLATE_HEIGHT + 0.9, z);
    }
    return null;
  }
  const movingOrbs = new Set<OrbId>();

  // ─── play ────────────────────────────────────────────────────────────────

  const jobs: Job[] = [];
  let running = false;
  let current: Job | null = null;
  let playState: JobCtx | null = null;

  function play(events: GameEvent[], after: GameState, c: Content): Promise<void> {
    return new Promise((resolve) => {
      jobs.push({ events, after, content: c, cancelled: false, resolve });
      if (!running) void runJobs();
    });
  }

  async function runJobs(): Promise<void> {
    running = true;
    while (jobs.length) {
      const job = jobs.shift()!;
      current = job;
      const version = syncVersion;
      try {
        if (!job.cancelled && state && content) await runJob(job);
      } catch (err) {
        console.error('board animation failed', err);
      }
      current = null;
      playState = null;
      if (!disposed && version === syncVersion) syncNow(job.after, job.content);
      job.resolve();
    }
    running = false;
    playing = false;
  }

  function cancelJobs(): void {
    for (const j of jobs) j.cancelled = true;
    if (current) current.cancelled = true;
    anim.cancelAll();
    overlay.clearFloats();
    effects.clear();
    movingOrbs.clear();
  }

  function skip(): void {
    if (!current && !jobs.length) return;
    cancelJobs();
  }

  async function runJob(job: Job): Promise<void> {
    const before = state!;
    const positions: Record<FigureId, Hex> = {};
    for (const fv of figures.values()) positions[fv.id] = fv.hex;
    const steps = planAnimation(job.events, positions, {
      spawnHex: (id) => job.after.figures[id]?.hex,
      // Ranged monsters shoot even at a neighbour; heroes use a projectile only from afar.
      isRanged: (id) => {
        const f = before.figures[id] ?? job.after.figures[id];
        return !!f && f.kind === 'monster' && !!PROJECTILE[lookOf(f, job.content).modelId];
      },
      windup: (id) => figures.get(id)?.attackWindup(TIMING.attackWindup) ?? TIMING.attackWindup,
    });
    if (!steps.length) return;
    const ctx: JobCtx = {
      job,
      gen: anim.generation,
      pending: [],
      lastHit: null,
      actor: null,
      lootGone: lootGone(before, job.after),
      orbOwner: {},
      impacts: new Map(),
    };
    for (const [id, o] of Object.entries(before.orbs)) if (o) ctx.orbOwner[id as OrbId] = o.ownerId;
    playState = ctx;
    playing = true;
    requestRender();
    for (const step of steps) {
      if (!alive(ctx)) break;
      const target = stepTarget(step);
      const impact = target ? ctx.impacts.get(target) : undefined;
      if (impact) {
        await impact;
        ctx.impacts.delete(target!);
        if (!alive(ctx)) break;
      }
      const done = runStep(step, ctx).catch((err: unknown) => console.error('board step failed', step.kind, err));
      ctx.pending.push(done);
      await anim.wait(step.wait);
    }
    if (alive(ctx)) await Promise.all(ctx.pending);
    playing = false;
    settle(0.5);
  }

  function alive(ctx: JobCtx): boolean {
    return !ctx.job.cancelled && ctx.gen === anim.generation && !disposed;
  }

  function lootGone(before: GameState, after: GameState): JobCtx['lootGone'] {
    const out: JobCtx['lootGone'] = [];
    for (const [k, t] of Object.entries(before.board.tiles)) {
      const a = after.board.tiles[k];
      if (t.coins && !a?.coins) out.push({ key: `${k}:coins`, hex: parseHexKey(k), chest: false });
      if (t.chest && !a?.chest) out.push({ key: `${k}:chest`, hex: parseHexKey(k), chest: true });
    }
    return out;
  }

  async function runStep(step: AnimStep, ctx: JobCtx): Promise<void> {
    switch (step.kind) {
      case 'walk':
        return walk(step.figureId, step.path, ctx);
      case 'jump':
        return jump(step.figureId, step.path, step.fly, step.duration);
      case 'slide':
        return slide(step.figureId, step.path, step.duration);
      case 'attack':
        return attack(step, ctx);
      case 'damage': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        if (step.amount > 0) overlay.float(`−${step.amount}`, 'dmg', () => fv.headPoint(), TIMING.floatLabel);
        fv.hp = Math.max(0, fv.hp - step.amount);
        fv.badge?.setHp(fv.hp, fv.maxHp);
        if (ctx.lastHit !== step.figureId && step.amount > 0) await hitReaction(fv, null);
        ctx.lastHit = null;
        return;
      }
      case 'heal': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        overlay.float(`+${step.amount}`, 'heal', () => fv.headPoint(), TIMING.floatLabel);
        fv.hp = Math.min(fv.maxHp, fv.hp + step.amount);
        fv.conditions = fv.conditions.filter((c) => !step.removed.includes(c));
        fv.badge?.setHp(fv.hp, fv.maxHp);
        fv.badge?.setConditions(fv.conditions, fv.shield, true);
        await effects.puff(fv.chestPoint(), '#9cf08a', { count: 7, size: 0.35, additive: true, seconds: 0.9, rise: 1 });
        return;
      }
      case 'condition': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        if (step.added) {
          if (!fv.conditions.includes(step.condition)) fv.conditions = [...fv.conditions, step.condition];
          void effects.puff(fv.chestPoint(), CONDITION_ICONS[step.condition].color, { count: 6, size: 0.3, additive: true, seconds: 0.6 });
        } else fv.conditions = fv.conditions.filter((c) => c !== step.condition);
        fv.badge?.setConditions(fv.conditions, fv.shield, true);
        settle(0.5);
        return;
      }
      case 'shield': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        fv.shield += step.value;
        fv.badge?.setConditions(fv.conditions, fv.shield, true);
        overlay.float(`${LABELS[lang].shield} ${step.value}`, 'shield', () => fv.headPoint(), TIMING.floatLabel);
        await effects.puff(fv.chestPoint(), '#a9c6ff', { count: 6, size: 0.45, additive: true, seconds: 0.6, rise: 0.2 });
        return;
      }
      case 'retaliate': {
        const fv = figures.get(step.figureId);
        const target = figures.get(step.targetId);
        if (!fv) return;
        if (target) await effects.projectile('thorn', fv.chestPoint(), target.chestPoint(), 0.25);
        ctx.lastHit = null;
        return;
      }
      case 'death':
        return death(step.figureId, step.fog, ctx);
      case 'downed': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        fv.downed = true;
        fv.badge?.setDim(true);
        const seconds = fv.playClip('death', { then: null }) || TIMING.death;
        if (!fv.hasModel) await tipOver(fv, seconds);
        else await anim.wait(seconds * 0.8);
        fv.setGrey(true);
        return;
      }
      case 'revived': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        fv.downed = false;
        fv.setGrey(false);
        fv.badge?.setDim(false);
        const raised = ctx.job.after.figures[step.figureId];
        if (raised) {
          fv.hp = raised.hp;
          fv.badge?.setHp(raised.hp, raised.maxHp);
          overlay.float(`+${raised.hp}`, 'heal', () => fv.headPoint(), TIMING.floatLabel);
        }
        fv.body.rotation.x = 0;
        fv.playClip('idle', { crossFade: 0.5 });
        settle(0.8);
        await effects.puff(fv.chestPoint(), '#ffe680', { count: 10, size: 0.45, additive: true, seconds: 0.9, rise: 1.2 });
        return;
      }
      case 'element': {
        const fv = step.actorId ? figures.get(step.actorId) : undefined;
        if (!fv) return;
        await effects.puff(fv.chestPoint(), ELEMENT_COLORS[step.element] ?? '#ffffff', { count: 10, size: 0.5, additive: true, seconds: 0.9, rise: 1.2 });
        return;
      }
      case 'orb':
        return orb(step, ctx);
      case 'room':
        return revealRoom(step.roomId, ctx);
      case 'spawn':
        return spawn(step.figureId, ctx);
      case 'loot':
        return loot(step.heroId, step.coins, ctx);
      case 'trap': {
        const fv = figures.get(step.figureId);
        if (!fv) return;
        const key = `${hexKey(fv.hex)}:trap`;
        const p = tiles.prop(key);
        if (p) {
          await anim.tween(TIMING.trap, (k) => p.object.scale.set(1 + Math.sin(k * Math.PI) * 0.5, 1 - k * 0.6, 1 + Math.sin(k * Math.PI) * 0.5));
          tiles.removeProp(key);
        }
        void effects.puff(fv.root.position.clone().setY(PLATE_HEIGHT + 0.15), '#8a8f99', { count: 6, size: 0.35, seconds: 0.6, rise: 0.3 });
        return;
      }
      case 'trapPlaced': {
        const { x, z } = hexToWorld(step.hex[0], step.hex[1]);
        await effects.puff(new THREE.Vector3(x, PLATE_HEIGHT + 0.1, z), '#c8a27a', { count: 6, size: 0.35, seconds: 0.5, rise: 0.2 });
        return;
      }
    }
  }

  function turnTo(fv: FigureView, yaw: number, seconds: number): Promise<void> {
    const from = fv.yaw;
    let delta = yaw - from;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) < 0.01) return Promise.resolve();
    return anim.tween(seconds, (k) => fv.setYaw(from + delta * k));
  }

  async function walk(id: FigureId, path: Hex[], ctx: JobCtx): Promise<void> {
    const fv = figures.get(id);
    if (!fv || path.length < 2) return;
    const pts = path.map(([q, r]) => hexToWorld(q, r));
    const segs = pts.length - 1;
    fv.playClip('walk');
    let seg = -1;
    let yawFrom = fv.yaw;
    let yawDelta = 0;
    await anim.tween(
      TIMING.walkPerHex * segs,
      (k) => {
        const t = Math.min(segs - 1e-6, k * segs);
        const i = Math.floor(t);
        const u = t - i;
        const a = pts[i]!;
        const b = pts[i + 1]!;
        if (i !== seg) {
          seg = i;
          yawFrom = fv.yaw;
          const want = Math.atan2(b.x - a.x, b.z - a.z);
          yawDelta = Math.atan2(Math.sin(want - yawFrom), Math.cos(want - yawFrom));
        }
        fv.root.position.set(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u);
        fv.setYaw(yawFrom + yawDelta * Math.min(1, u * 3));
        if (!fv.hasModel) fv.body.position.y = Math.abs(Math.sin(u * Math.PI)) * 0.12;
        if (k >= 1) fv.root.position.set(pts[segs]!.x, 0, pts[segs]!.z);
      },
      { ease: linear },
    );
    fv.hex = path[path.length - 1]!;
    fv.body.position.y = 0;
    if (alive(ctx)) fv.playClip('idle', { crossFade: 0.2 });
    settle();
  }

  /** Puts a figure at a pose at (x, z), leaning toward `dir`. Only the body leaves the ground: the
   *  painted base slides along underneath like the mini's shadow. */
  function applyPose(fv: FigureView, p: MovePose, x: number, z: number, dirX: number, dirZ: number, squash = true): void {
    fv.root.position.set(x, 0, z);
    fv.body.position.y = p.y;
    if (squash) fv.setSquash(p.squash);
    const { pitch, roll } = leanAngles(p.lean, fv.body.rotation.y, dirX, dirZ);
    fv.body.rotation.x = pitch;
    fv.body.rotation.z = roll;
  }

  function endPose(fv: FigureView, hex: Hex): void {
    fv.placeAt(hex);
    fv.body.position.y = 0;
    fv.setSquash(1);
    fv.body.rotation.x = 0;
    fv.body.rotation.z = 0;
  }

  /** The tallest thing a jump from a to b passes over (obstacles and figures between the ends). */
  function clearanceAlong(id: FigureId, path: Hex[]): number {
    const a = hexToWorld(path[0]![0], path[0]![1]);
    const b = hexToWorld(path[path.length - 1]![0], path[path.length - 1]![1]);
    const ends = new Set([hexKey(path[0]!), hexKey(path[path.length - 1]!)]);
    const under = new Set<string>(path.slice(1, -1).map((h) => hexKey(h)));
    for (let t = 0.1; t < 0.95; t += 0.1) under.add(hexKey(worldToHex(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)));
    let top = 0;
    for (const k of under) {
      if (ends.has(k)) continue;
      if (state?.board.tiles[k]?.obstacle) top = Math.max(top, 1.0);
      for (const o of figures.values()) if (o.id !== id && o.root.visible && hexKey(o.hex) === k) top = Math.max(top, Math.min(1.2, o.height * 0.75));
    }
    return top;
  }

  async function jump(id: FigureId, path: Hex[], fly: boolean, seconds: number): Promise<void> {
    const fv = figures.get(id);
    if (!fv || path.length < 2) return;
    const last = path[path.length - 1]!;
    const a = hexToWorld(path[0]![0], path[0]![1]);
    const b = hexToWorld(last[0], last[1]);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    await turnTo(fv, Math.atan2(dx, dz), 0.12);
    const hexes = path.length - 1;
    if (fly || fv.look.flying) {
      // Glide: rise, float across with the hover bob going on, settle onto the new hex.
      const height = (fv.look.flying ? 0.45 : 0.85) + 0.05 * Math.min(6, hexes);
      if (!fv.look.flying && fv.playClip('walk', { crossFade: 0.2 })) fv.setClipSpeed(0.45);
      await anim.tween(seconds, (k) => {
        const p = flyPose(k, height);
        applyPose(fv, p, a.x + dx * p.travel, a.z + dz * p.travel, dx, dz, false);
      }, { ease: linear });
      endPose(fv, last);
      if (!fv.look.flying) fv.playClip('idle', { crossFade: 0.25 });
      settle();
      return;
    }
    // Jump: crouch, take off, arc over whatever is in the way, land with a squash and a puff of dust.
    const clip = fv.hasClip('jump');
    const height = jumpHeight(hexes, clearanceAlong(id, path)) * (clip ? 0.6 : 1);
    if (clip) fv.playClip('jump', { seconds, crossFade: 0.1 });
    let phase: 'crouch' | 'air' | 'land' = 'crouch';
    await anim.tween(seconds, (k) => {
      const p = jumpPose(k, height);
      applyPose(fv, p, a.x + dx * p.travel, a.z + dz * p.travel, dx, dz, !clip);
      if (phase === 'crouch' && k >= JUMP_CROUCH) {
        phase = 'air';
        // No jump clip: a slowed stride while airborne reads as a leap rather than a hop in place.
        if (!clip && fv.playClip(fv.hasClip('run') ? 'run' : 'walk', { crossFade: 0.08 })) fv.setClipSpeed(0.35);
      } else if (phase === 'air' && k >= 1 - JUMP_LAND) {
        phase = 'land';
        fv.playClip('idle', { crossFade: 0.18 });
        void effects.puff(new THREE.Vector3(b.x, PLATE_HEIGHT + 0.08, b.z), '#cdbb9e', { count: 6, size: 0.4, seconds: 0.55, rise: 0.15 });
      }
    }, { ease: linear });
    endPose(fv, last);
    if ((phase as string) !== 'land') fv.playClip('idle', { crossFade: 0.18 });
    settle();
  }

  async function slide(id: FigureId, path: Hex[], seconds: number): Promise<void> {
    const fv = figures.get(id);
    if (!fv || path.length < 2) return;
    const pts = path.map(([q, r]) => hexToWorld(q, r));
    const segs = pts.length - 1;
    const dx = pts[segs]!.x - pts[0]!.x;
    const dz = pts[segs]!.z - pts[0]!.z;
    fv.playClip('hit');
    await anim.tween(
      seconds,
      (k) => {
        // Shoved (or yanked) along the path: stumbling steps, the body thrown along and catching itself.
        const p = slidePose(k, segs);
        const t = Math.min(segs - 1e-6, p.travel * segs);
        const i = Math.floor(t);
        const u = t - i;
        const a = pts[i]!;
        const b = pts[i + 1]!;
        applyPose(fv, p, a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, dx, dz);
      },
      { ease: linear },
    );
    endPose(fv, path[path.length - 1]!);
    void effects.puff(new THREE.Vector3(pts[segs]!.x, PLATE_HEIGHT + 0.06, pts[segs]!.z), '#cdbb9e', { count: 4, size: 0.32, seconds: 0.45, rise: 0.1 });
    settle();
  }

  /** Clip-less lunge for standees and models without an attack clip. */
  function lunge(fv: FigureView, toward: THREE.Vector3, seconds: number): Promise<void> {
    const dir = toward.clone().sub(fv.root.position).setY(0).normalize();
    return anim.tween(seconds, (k) => {
      const s = Math.sin(k * Math.PI) * 0.32;
      fv.body.position.set(dir.x * s, Math.sin(k * Math.PI) * 0.05, dir.z * s);
    });
  }

  async function hitReaction(fv: FigureView, from: FigureView | null): Promise<void> {
    if (from && fv.hasModel) void turnTo(fv, fv.yawTo(from.root.position.x, from.root.position.z), 0.12);
    const seconds = fv.downed ? 0 : fv.playClip('hit');
    settle(seconds + 0.3);
    if (!fv.hasModel || !seconds) {
      // Shake: a few quick side-steps of the body.
      await anim.tween(0.35, (k) => {
        fv.body.position.x = Math.sin(k * Math.PI * 6) * 0.06 * (1 - k);
      });
    }
  }

  async function attack(step: Extract<AnimStep, { kind: 'attack' }>, ctx: JobCtx): Promise<void> {
    let landed = () => {};
    ctx.impacts.set(step.targetId, new Promise<void>((resolve) => (landed = resolve)));
    try {
      await strike(step, ctx, () => landed());
    } finally {
      landed();
    }
  }

  async function strike(step: Extract<AnimStep, { kind: 'attack' }>, ctx: JobCtx, landed: () => void): Promise<void> {
    const a = figures.get(step.attackerId);
    const t = figures.get(step.targetId);
    if (!a || !t) return;
    const face = a.yawTo(t.root.position.x, t.root.position.z);
    await turnTo(a, face + (a.hasClip('attack') ? a.look.attackYaw : 0), TIMING.turn);
    if (!alive(ctx)) return;
    const windup = a.attackWindup(TIMING.attackWindup);
    const clipSeconds = a.playClip('attack');
    settle(clipSeconds + 0.3);
    const lungeDone = clipSeconds ? null : lunge(a, t.root.position, step.ranged ? 0.35 : TIMING.attack * 0.6);
    await anim.wait(step.ranged ? windup : Math.min(windup, step.impact - TIMING.turn));
    if (!alive(ctx)) return;
    if (step.ranged) {
      const flight = Math.max(0.2, step.impact - TIMING.turn - TIMING.attackWindup);
      await effects.projectile(a.look.projectile, a.chestPoint().add(new THREE.Vector3(0, 0.1, 0)), t.chestPoint(), flight);
      if (!alive(ctx)) return;
    }
    ctx.lastHit = t.id;
    landed();
    const head = () => t.headPoint();
    if (step.label === 'miss') overlay.float(LABELS[lang].miss, 'miss', head, TIMING.floatLabel);
    else if (step.label === 'x2') overlay.float('×2', 'x2', () => t.headPoint().add(new THREE.Vector3(0, 0.35, 0)), TIMING.floatLabel);
    if (step.shield > 0 && step.label !== 'miss') overlay.float(`${step.shield}`, 'shield', () => t.headPoint().add(new THREE.Vector3(0.45, 0.1, 0)), TIMING.floatLabel, 'shield');
    if (step.label !== 'miss' && step.damage > 0) await hitReaction(t, a);
    else if (step.label !== 'miss') await effects.puff(t.chestPoint(), '#a9c6ff', { count: 5, size: 0.35, additive: true, seconds: 0.45, rise: 0.2 });
    await lungeDone;
    if (a.hasClip('attack') && a.look.attackYaw) void turnTo(a, face, 0.25);
  }

  /** Clip-less fall for standees. */
  function tipOver(fv: FigureView, seconds: number): Promise<void> {
    return anim.tween(seconds, (k) => {
      fv.body.rotation.x = -k * (Math.PI / 2.2);
    });
  }

  async function death(id: FigureId, fog: boolean, ctx: JobCtx): Promise<void> {
    const fv = figures.get(id);
    if (!fv) return;
    fv.gone = true;
    const seconds = fv.playClip('death', { then: null });
    settle(seconds + 0.4);
    if (!seconds) await tipOver(fv, TIMING.death * 0.6);
    else await anim.wait(Math.min(seconds, TIMING.death) * 0.7);
    if (!alive(ctx)) return;
    overlay.remove(fv.badgeItem);
    fv.badgeItem = null;
    const at = fv.chestPoint();
    // «Розвіюють туман»: the grey fog lifts off the creature in a soft puff, no gore.
    const puff = fog
      ? effects.puff(at, '#b9bfcc', { count: 14, size: 1.2, seconds: 1.3, rise: 0.9 })
      : effects.puff(at, '#fff2c8', { count: 8, size: 0.5, additive: true, seconds: 1.0, rise: 1.4 });
    fv.setGlow(null);
    await anim.tween(0.6, (k) => fv.setOpacity(1 - k));
    await puff;
    if (fv.gone && figures.get(id) === fv && alive(ctx)) removeFigure(fv);
  }

  async function spawn(id: FigureId, ctx: JobCtx): Promise<void> {
    const f = ctx.job.after.figures[id];
    if (!f || figures.has(id)) return;
    const fv = ensureFigure(f, ctx.job.content);
    applyFigureState(fv, f);
    faceNearestFoe(fv);
    fv.setOpacity(0);
    if (isFogCreature(id)) void effects.puff(fv.chestPoint(), '#aab0bd', { count: 8, size: 0.8, seconds: 0.9, rise: 0.4 });
    await anim.tween(TIMING.spawn, (k) => {
      fv.setOpacity(k);
      fv.root.scale.setScalar(0.4 + 0.6 * k);
    }, { ease: easeOut });
    fv.root.scale.setScalar(1);
  }

  async function revealRoom(roomId: string, ctx: JobCtx): Promise<void> {
    const after = ctx.job.after;
    const c = ctx.job.content;
    tiles.syncRooms(after, c, roomId);
    tiles.syncProps(after, roomId);
    tiles.setRoomRise(roomId, 0, null);
    updateBounds(true);
    // Doors into the new room swing open first; the room rises from where the door is.
    let origin: THREE.Vector3 | null = null;
    const doors: ReturnType<typeof tiles.prop>[] = [];
    for (const [k, t] of Object.entries(after.board.tiles)) {
      if (t.door?.to !== roomId) continue;
      const p = tiles.prop(`${k}:door`);
      if (!p) continue;
      doors.push(p);
      origin = p.object.position.clone();
    }
    if (doors.length) {
      await anim.tween(0.35, (k) => {
        for (const p of doors) if (p) tiles.setDoorOpen(p, true, true, k);
      });
    }
    await anim.tween(
      TIMING.room - 0.35,
      (k) => {
        tiles.setRoomRise(roomId, k, origin);
        environment.revealRoom(roomId, k);
      },
      { ease: linear },
    );
    environment.revealRoom(roomId, 1);
    tiles.setRoomRise(roomId, 1, origin);
  }

  async function loot(heroId: FigureId, coins: number, ctx: JobCtx): Promise<void> {
    const hero = figures.get(heroId);
    if (!hero) return;
    // The nearest coin or chest that is gone after the events.
    let best = -1;
    let bestD = Infinity;
    ctx.lootGone.forEach((l, i) => {
      const w = hexToWorld(l.hex[0], l.hex[1]);
      const d = Math.hypot(w.x - hero.root.position.x, w.z - hero.root.position.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const pick = best >= 0 ? ctx.lootGone.splice(best, 1)[0] : undefined;
    const label = () => hero.headPoint().add(new THREE.Vector3(0, 0.3, 0));
    if (pick) {
      const p = tiles.prop(pick.key);
      const from = p ? p.object.position.clone().setY(PLATE_HEIGHT + 0.2) : hero.chestPoint();
      if (pick.chest && p?.lid) {
        const lid = p.lid;
        await anim.tween(0.35, (k) => (lid.rotation.x = -k * 1.9));
        void effects.puff(from.clone().setY(PLATE_HEIGHT + 0.45), '#ffe27a', { count: 10, size: 0.4, additive: true, seconds: 0.9, rise: 1.4 });
      } else if (p) tiles.removeProp(pick.key);
      if (coins > 0) await effects.coin(from, hero.chestPoint(), TIMING.loot * 0.7);
    }
    if (coins > 0) overlay.float(`+${coins}`, 'coin', label, TIMING.floatLabel, 'coin');
  }

  async function orb(step: Extract<AnimStep, { kind: 'orb' }>, ctx: JobCtx): Promise<void> {
    const id = step.orb;
    if (step.change === 'infused') {
      if (step.ownerId) ctx.orbOwner[id] = step.ownerId;
      effects.syncOrbs({ ...currentOrbs(), [id]: { age: 0 } });
      const mesh = effects.orbMesh(id);
      if (mesh) await anim.tween(TIMING.orb, (k) => mesh.scale.setScalar(0.2 + 0.8 * k), { ease: easeOut });
      return;
    }
    const mesh = effects.orbMesh(id);
    if (step.change === 'dimmed') {
      effects.setOrbAge(id, 1);
      settle(0.3);
      return;
    }
    if (!mesh) return;
    if (step.change === 'consumed') {
      const to = step.byId ? figures.get(step.byId) : undefined;
      movingOrbs.add(id);
      const from = mesh.position.clone();
      const target = to ? to.chestPoint() : from.clone().setY(from.y + 1);
      await anim.tween(TIMING.orb + 0.1, (k) => {
        mesh.position.lerpVectors(from, target, k);
        mesh.position.y += Math.sin(k * Math.PI) * 0.4;
        mesh.scale.setScalar(1 - k * 0.6);
      });
      movingOrbs.delete(id);
      if (to) void effects.puff(target, mesh.material instanceof THREE.MeshStandardMaterial ? `#${mesh.material.color.getHexString()}` : '#fff', { count: 8, size: 0.45, additive: true, seconds: 0.7 });
    } else {
      await anim.tween(0.35, (k) => mesh.scale.setScalar(1 - k));
    }
    delete ctx.orbOwner[id];
    const rest = currentOrbs();
    delete rest[id];
    effects.syncOrbs(rest);
  }

  function currentOrbs(): Partial<Record<OrbId, { age: 0 | 1 }>> {
    const out: Partial<Record<OrbId, { age: 0 | 1 }>> = {};
    for (const id of ['fire', 'earth', 'air'] as OrbId[]) {
      const mesh = effects.orbMesh(id);
      if (mesh) out[id] = { age: mesh.scale.x < 0.9 ? 1 : 0 };
    }
    return out;
  }

  // ─── Highlights ──────────────────────────────────────────────────────────

  function highlight(h: BoardHighlights): void {
    highlights = h;
    applyHighlights();
  }

  function clearHighlights(): void {
    highlight({});
  }

  function applyHighlights(): void {
    highlightPlan = planHighlights(highlights);
    for (const m of [fills, frames, dots]) {
      if (!m) continue;
      scene.remove(m);
      m.dispose();
    }
    fills = frames = dots = null;
    for (const item of highlightLabels) overlay.remove(item);
    highlightLabels = [];
    // Only hexes of revealed rooms (a stale highlight must not float over the dark).
    const onBoard = tiles.hexKeys();
    const cells = highlightPlan.cells.filter((c) => onBoard.has(hexKey(c.hex)));
    if (cells.length) {
      fills = new THREE.InstancedMesh(fillGeo, fillMat, cells.length);
      frames = new THREE.InstancedMesh(frameGeo, frameMat, cells.length);
      const m = new THREE.Matrix4();
      const color = new THREE.Color();
      cells.forEach((cell, i) => {
        const { x, z } = hexToWorld(cell.hex[0], cell.hex[1]);
        m.makeTranslation(x, PLATE_HEIGHT + 0.015, z);
        fills!.setMatrixAt(i, m);
        frames!.setMatrixAt(i, m);
        color.set(CELL_COLORS[cell.kind]);
        fills!.setColorAt(i, color);
        frames!.setColorAt(i, color);
        if (cell.cost !== undefined) {
          const el = document.createElement('div');
          el.className = 'bv-cost';
          el.textContent = String(cell.cost);
          const p = new THREE.Vector3(x, PLATE_HEIGHT + 0.02, z + 0.45);
          highlightLabels.push(overlay.add(el, () => p));
        }
      });
      fills.renderOrder = frames.renderOrder = 1;
      scene.add(fills, frames);
    }
    const path = highlightPlan.path.filter((h) => onBoard.has(hexKey(h)));
    if (path.length) {
      dots = new THREE.InstancedMesh(dotGeo, dotMat, path.length);
      const m = new THREE.Matrix4();
      path.forEach(([q, r], i) => {
        const { x, z } = hexToWorld(q, r);
        m.makeScale(i === path.length - 1 ? 1.6 : 1, 1, i === path.length - 1 ? 1.6 : 1).setPosition(x, PLATE_HEIGHT + 0.02, z);
        dots!.setMatrixAt(i, m);
      });
      dots.renderOrder = 2;
      scene.add(dots);
    }
    const targeted = new Set(highlights.targets ?? []);
    const active = highlights.active !== undefined ? highlights.active : state ? activeFigure(state) : null;
    const selected = highlights.selected ?? null;
    for (const fv of figures.values()) {
      const target = targeted.has(fv.id);
      fv.setTargeted(target);
      fv.setGlow(fv.gone ? null : target ? 'target' : fv.id === selected ? 'selected' : fv.id === active ? 'active' : null);
    }
    for (const mark of highlightPlan.targets) {
      if (mark.expectedDamage === undefined) continue;
      const fv = figures.get(mark.figureId);
      if (!fv) continue;
      const el = document.createElement('div');
      el.className = 'bv-exp';
      el.innerHTML = `${iconSvg('attack')} ${mark.expectedDamage}`;
      highlightLabels.push(overlay.add(el, () => (fv.root.visible ? fv.headPoint().add(new THREE.Vector3(0, 0.42, 0)) : null)));
    }
    requestRender();
  }

  // ─── Input ───────────────────────────────────────────────────────────────

  const hexListeners = new Set<(hex: Hex) => void>();
  const figureListeners = new Set<(id: FigureId) => void>();
  const holdListeners = new Set<(id: FigureId) => void>();
  const ground = new THREE.Vector3();

  function pickFigure(x: number, y: number): FigureView | null {
    const ray = camera.rayAt(x, y);
    const proxies = [...figures.values()].filter((f) => f.root.visible && !f.gone).map((f) => f.proxy);
    const hit = ray.intersectObjects(proxies, false)[0];
    const id = hit?.object.userData['figureId'] as FigureId | undefined;
    return id ? (figures.get(id) ?? null) : null;
  }

  function pickHex(x: number, y: number): Hex | null {
    if (!camera.groundAt(x, y, ground)) return null;
    const [q, r] = worldToHex(ground.x, ground.z);
    return tiles.hexKeys().has(hexKey([q, r])) ? [q, r] : null;
  }

  function onTap(x: number, y: number): void {
    const fv = pickFigure(x, y);
    if (fv) {
      for (const cb of figureListeners) cb(fv.id);
      for (const cb of hexListeners) cb([fv.hex[0], fv.hex[1]]);
      return;
    }
    const hex = pickHex(x, y);
    if (hex) for (const cb of hexListeners) cb(hex);
  }

  function onHold(x: number, y: number): void {
    const fv = pickFigure(x, y);
    if (fv) for (const cb of holdListeners) cb(fv.id);
  }

  function isOwnHero(id: FigureId): boolean {
    if (!id.startsWith('hero:')) return false;
    return !opts.ownHeroes || opts.ownHeroes.includes(id);
  }

  function onDoubleTap(x: number, y: number): void {
    const fv = pickFigure(x, y);
    if (fv && isOwnHero(fv.id)) focus(fv.id);
    else camera.recentre();
  }

  function focus(id: FigureId): void {
    const fv = figures.get(id);
    if (fv) camera.focusOn(fv.root.position);
  }

  function subscribe<T>(set: Set<T>, cb: T): () => void {
    set.add(cb);
    return () => set.delete(cb);
  }

  // ─── Debug helpers ───────────────────────────────────────────────────────

  function screenPoint(t: FigureId | Hex): { x: number; y: number } | null {
    let p: THREE.Vector3;
    if (typeof t === 'string') {
      const fv = figures.get(t);
      if (!fv) return null;
      p = fv.chestPoint();
    } else {
      const { x, z } = hexToWorld(t[0], t[1]);
      p = new THREE.Vector3(x, PLATE_HEIGHT, z);
    }
    p.project(camera.camera);
    const rect = root.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  function dispose(): void {
    if (disposed) return;
    cancelJobs();
    for (const j of jobs.splice(0)) j.resolve();
    current?.resolve();
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (ringTimer) clearTimeout(ringTimer);
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    stopQuality();
    camera.dispose();
    for (const fv of [...figures.values()]) removeFigure(fv);
    for (const m of [fills, frames, dots]) m?.dispose();
    for (const x of [fillGeo, frameGeo, dotGeo, fillMat, frameMat, dotMat]) x.dispose();
    tiles.dispose();
    environment.dispose();
    effects.dispose();
    disposeFigureParts(parts);
    envTexture?.dispose();
    overlay.dispose();
    renderer.dispose();
    root.remove();
    hexListeners.clear();
    figureListeners.clear();
    holdListeners.clear();
  }

  return {
    sync,
    play,
    skip,
    highlight,
    clearHighlights,
    onHexTap: (cb) => subscribe(hexListeners, cb),
    onFigureTap: (cb) => subscribe(figureListeners, cb),
    onFigureHold: (cb) => subscribe(holdListeners, cb),
    focus,
    resetCamera,
    setQuality,
    dispose,
    get speed() {
      return anim.speed;
    },
    setSpeed(speed: number) {
      anim.speed = Math.max(0.25, Math.min(4, speed));
    },
    stats() {
      const info = renderer.info.render;
      return { fps: Math.round(fps * 10) / 10, calls: info.calls, triangles: info.triangles, quality, animating: playing || anim.busy };
    },
    screenPoint,
    async advance(seconds: number, rate = 30) {
      const n = Math.max(1, Math.round(seconds * rate));
      let now = performance.now();
      for (let i = 0; i < n; i++) {
        now += 1000 / rate;
        drawFrame(now, 1 / rate);
        // Let the queue's promise chains move on to the next step between frames.
        for (let k = 0; k < 12; k++) await Promise.resolve();
      }
    },
    freeze(on: boolean) {
      frozen = on;
      if (!on) requestRender();
    },
    benchmark(n: number) {
      const gl = renderer.getContext();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        drawFrame(t0 + i * 16, 1 / 60);
        gl.finish();
      }
      return (performance.now() - t0) / n;
    },
    environment: () => environment.stats(),
    camera: () => camera.state,
    scene,
    figures: () =>
      [...figures.values()].map((fv) => ({ id: fv.id, model: fv.model ? `${fv.model.id}@${fv.model.quality}` : null, clip: fv.model?.current ?? null, hex: fv.hex, visible: fv.root.visible })),
  };
}
