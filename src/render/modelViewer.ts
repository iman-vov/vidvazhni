// Dev-only page (dev/models.html) for checking optimized models: shows one model standing on a
// patch of board hexes under the board's lights and camera pitch, and cycles its clips.
//   ?model=warden          model id (default: first model in the build)
//   &clip=attack           play only this clip instead of cycling
//   &view=close            close-up from the front instead of the game camera
//   &hand=right            put a marker box on that hand bone (checks attachToBone)
//   &weapon=warden-shield  attach a weapon model with attachWeapon (several: comma-separated)
//   &scale=0.8             model scale on the board
//   &quality=low           model tier: low, medium or high (default: the device's graphics quality)
//   &compare=raw           raw Meshy file (art/meshy-source) on the left, same lights; idle only
//   &compare=low           another tier on the left, playing the same clips
//   &env=1                 add a room environment map (metal looks dark without one)
//   &sheet=1               contact sheet instead of the live view: idle, attack mid-frame and walk,
//                          front and from the weapon side, close up (window.sheet holds a JPEG data URL)
//   ?styles=brass-automaton,mist-queen   contact sheet of restyled monsters (figureLook RESTYLES):
//                          the base model, then the restyle from the front and from behind

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import { attachToBone, attachWeapon, listModels, loadModel, MODEL_CACHE, prefetchModels, type Model } from './models';
import { GRAPHICS_QUALITIES, type GraphicsQuality } from './quality';
import { MODEL_HEIGHT, RESTYLES } from './figureLook';
import { applyRestyle, restyledScale } from './restyle';
import type { IconName } from '../ui/icons/names';
import { iconSvg } from '../ui/icons/svg';

// Same look as render/board.ts so the check shows the model as it will appear in the game.
const BACKGROUND = '#1d2433';
const PLATE_COLORS = ['#56647a', '#5d6c83', '#515f74'];
const PLATE_HEIGHT = 0.22 * HEX_SIZE;
const PLATE_RADIUS = 0.94 * HEX_SIZE;
const PITCH = THREE.MathUtils.degToRad(55);
const CYCLE = ['idle', 'walk', 'run', 'attack', 'hit', 'cast', 'death'];

const params = new URLSearchParams(location.search);
const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const info = document.getElementById('info')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);
scene.add(new THREE.HemisphereLight('#dfe7ff', '#262d3d', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 1.8);
sun.position.set(-4, 10, 6);
scene.add(sun);

const plateGeometry = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_HEIGHT, 6, 1, false, Math.PI / 2);
plateGeometry.translate(0, PLATE_HEIGHT / 2, 0);
const plateMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });
for (const [q, r] of [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) {
  const mesh = new THREE.Mesh(plateGeometry, plateMaterial.clone());
  (mesh.material as THREE.MeshStandardMaterial).color.set(PLATE_COLORS[(((q - r) % 3) + 3) % 3]!);
  const { x, z } = hexToWorld(q, r);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
}

if (params.get('env')) scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const compare = params.get('compare');
const asQuality = (v: string | null): GraphicsQuality | undefined =>
  GRAPHICS_QUALITIES.find((q) => q === v);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
let close = params.get('view') === 'close';
function placeCamera(): void {
  if (close) {
    camera.position.set(0, 1.3, compare ? 4.6 : 3.6);
    camera.lookAt(0, 1.0, 0);
  } else {
    const distance = 7;
    camera.position.set(0, PLATE_HEIGHT + Math.sin(PITCH) * distance, Math.cos(PITCH) * distance);
    camera.lookAt(0, PLATE_HEIGHT + 0.6, 0);
  }
}

function resize(): void {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function button(label: string, onClick: () => void, icon?: IconName): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (icon) b.insertAdjacentHTML('afterbegin', `${iconSvg(icon)} `);
  b.addEventListener('click', onClick);
  panel.appendChild(b);
  return b;
}

async function main(): Promise<void> {
  const styles = params.get('styles');
  if (styles) {
    await renderLineup(styles.split(','));
    return;
  }
  const ids = listModels();
  const id = params.get('model') ?? ids[0];
  if (!id) {
    info.textContent = 'No optimized models; run npm run models';
    return;
  }

  const picker = document.createElement('select');
  for (const m of ids) picker.add(new Option(m, m, false, m === id));
  picker.addEventListener('change', () => {
    params.set('model', picker.value);
    location.search = params.toString();
  });
  panel.appendChild(picker);

  const model: Model = await loadModel(id, { quality: asQuality(params.get('quality')) });
  model.scene.scale.setScalar(Number(params.get('scale') ?? 1));
  model.scene.position.y = PLATE_HEIGHT;
  scene.add(model.scene);
  Object.assign(window, { viewerModel: model, prefetchModels, MODEL_CACHE }); // for browser automation

  let raw: THREE.AnimationMixer | null = null;
  let other: Model | null = null;
  const otherQuality = asQuality(compare);
  if (otherQuality) {
    other = await loadModel(id, { quality: otherQuality });
    other.scene.position.set(-0.8, PLATE_HEIGHT, 0);
    other.scene.scale.copy(model.scene.scale);
    model.scene.position.x = 0.8;
    scene.add(other.scene);
    Object.assign(window, { viewerOther: other });
  } else if (compare) {
    // Vite's dev server serves the raw download straight from art/meshy-source (dev only).
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}art/meshy-source/${id}/${id}.glb`);
    gltf.scene.position.set(-0.8, PLATE_HEIGHT, 0);
    gltf.scene.scale.copy(model.scene.scale);
    model.scene.position.x = 0.8;
    scene.add(gltf.scene);
    raw = new THREE.AnimationMixer(gltf.scene);
    const idle = gltf.animations.find((c) => /idle/i.test(c.name));
    if (idle) raw.clipAction(idle).play();
  }

  const hand = params.get('hand');
  if (hand) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: '#ffc457' }));
    attachToBone(model, marker, hand === 'left' ? 'mixamorig:LeftHand' : 'mixamorig:RightHand');
  }
  const weapon = params.get('weapon');
  for (const w of weapon?.split(',') ?? []) await attachWeapon(model, w);

  let triangles = 0;
  const textures = new Set<string>();
  model.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const m = o.material as THREE.MeshStandardMaterial;
    for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap]) {
      const img = t?.image as { width?: number; height?: number } | undefined;
      if (t && img?.width) textures.add(`${img.width}×${img.height}`);
    }
  });

  if (params.get('sheet')) {
    renderSheet(model, weapon ? `${id} + ${weapon}` : id);
    return;
  }

  const names = CYCLE.filter((c) => model.clips[c]).concat(Object.keys(model.clips).filter((c) => !CYCLE.includes(c)));
  const only = params.get('clip');
  let cycling = !only;
  const buttons = new Map<string, HTMLButtonElement>();
  for (const name of names) {
    buttons.set(
      name,
      button(name, () => {
        cycling = false;
        start(name);
      }),
    );
  }
  button('всі', () => {
    cycling = true;
    start(names[0]!);
  }, 'right');
  button('камера', () => {
    close = !close;
    placeCamera();
  });

  let clipEnds = 0;
  function start(name: string): void {
    model.play(name, { then: cycling ? null : undefined });
    other?.play(name, { then: cycling ? null : undefined });
    const duration = model.clips[name]?.duration ?? 1;
    // Loops get two passes before the cycle moves on; one-shots hold their last frame briefly.
    clipEnds = clock.elapsedTime + (['idle', 'walk', 'run'].includes(name) ? duration * 2 : duration + 0.6);
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === name));
  }

  const clock = new THREE.Clock();
  placeCamera();
  resize();
  start(only && model.clips[only] ? only : names[0] ?? 'idle');

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (cycling && clock.elapsedTime > clipEnds && names.length) {
      const next = names[(names.indexOf(model.current ?? '') + 1) % names.length]!;
      start(next);
    }
    model.update(dt);
    raw?.update(dt);
    other?.update(dt);
    renderer.render(scene, camera);
    info.textContent =
      `${id} (${model.meta.kind}, ${model.quality}${other ? ` vs ${other.quality} on the left` : ''})  clip: ${model.current}  ${(model.mixer.time % 100).toFixed(1)} s\n` +
      `${triangles} tris, textures ${[...textures].join(', ') || 'none'}, clips ${Object.keys(model.clips).join(' ')}`;
  });
}

/** Poses the model at a few frames and draws each from two sides onto one canvas. */
function renderSheet(model: Model, title: string): void {
  const frames = (
    [
      ['idle', 0.3],
      ['attack', 0.35],
      ['attack', 0.55],
      ['walk', 0.5],
    ] as const
  ).filter(([clip]) => model.clips[clip]);
  const tile = 380;
  const views = 3;
  const canvas = document.createElement('canvas');
  canvas.width = tile * frames.length;
  canvas.height = tile * views + 28;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf4';
  ctx.fillText(title, 8, 19);
  renderer.setPixelRatio(1);
  renderer.setSize(tile, tile, false);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const box = new THREE.Box3();
  // Some raw rigs are a centimetre tall (the board scales them by figureLook's height): bring every
  // figure to hero height, measured the way figureView does.
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      sm.computeBoundingBox();
    }
  });
  box.setFromObject(model.scene);
  const measured = box.max.y - Math.max(PLATE_HEIGHT, box.min.y);
  if (measured > 1e-6) model.scene.scale.multiplyScalar(1.3 / measured);
  frames.forEach(([clip, at], col) => {
    model.mixer.stopAllAction();
    const action = model.mixer.clipAction(model.clips[clip]!);
    action.reset().play();
    action.time = at * model.clips[clip]!.duration;
    model.mixer.update(0);
    model.scene.updateMatrixWorld(true);
    // Framed by the posed bones (the skinned meshes' boxes are far off on some rigs), padded a little.
    box.makeEmpty();
    model.scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
    });
    if (box.isEmpty()) box.setFromObject(model.scene);
    box.expandByVector(box.getSize(new THREE.Vector3()).multiplyScalar(0.12));
    box.min.y = Math.min(box.min.y, PLATE_HEIGHT);
    const h = Math.max(box.max.y - PLATE_HEIGHT, 0.2);
    const centre = box.getCenter(new THREE.Vector3());
    const y = PLATE_HEIGHT + h * 0.6;
    // Front, from the figure's right (where most weapons are), from its left; whole figure in each.
    const shots: [number, number][] = [[0, 1], [-1, 0.35], [1, 0.35]];
    shots.forEach(([x, z], row) => {
      const dir = new THREE.Vector3(x, 0.15, z).normalize();
      cam.position.set(centre.x, y, centre.z).addScaledVector(dir, h * 2.4);
      cam.lookAt(centre.x, y - h * 0.08, centre.z);
      renderer.render(scene, cam);
      ctx.drawImage(renderer.domElement, col * tile, 28 + row * tile);
    });
    ctx.fillText(`${clip} ${Math.round(at * 100)}%`, col * tile + 8, 28 + 18);
  });
  canvas.style.cssText = 'position:absolute;inset:0;max-width:100%;max-height:100%;margin:auto';
  document.body.appendChild(canvas);
  Object.assign(window, { sheet: canvas.toDataURL('image/jpeg', 0.85) });
}

/** One column per restyled monster: its base model, then the restyle from the front and from behind
 *  (idle), each framed on its own; the board height is in the caption. */
async function renderLineup(ids: string[]): Promise<void> {
  const tile = 360;
  const canvas = document.createElement('canvas');
  canvas.width = tile * ids.length;
  canvas.height = tile * 3 + 28;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '15px system-ui, sans-serif';
  renderer.setPixelRatio(1);
  renderer.setSize(tile, tile, false);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  for (const [col, id] of ids.entries()) {
    const style = RESTYLES[id];
    if (!style) continue;
    const base = await loadModel(style.model, { quality: asQuality(params.get('quality')) });
    const styled = await loadModel(style.model, { quality: asQuality(params.get('quality')) });
    styled.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone();
    });
    applyRestyle(styled, style);
    // The base at its board height, the restyle at its own, both against the same 1.3 frame unit.
    const box = new THREE.Box3().setFromObject(base.scene);
    const h0 = Math.max(box.max.y - Math.min(0, box.min.y), 1e-6);
    const baseH = MODEL_HEIGHT[style.model] ?? 1;
    base.scene.scale.setScalar(baseH / h0);
    styled.scene.scale.copy(restyledScale(style, (baseH * style.scale) / h0));
    const rows: [Model, [number, number]][] = [[base, [0.35, 1]], [styled, [0.35, 1]], [styled, [-0.7, -0.8]]];
    for (const [row, [m, [x, z]]] of rows.entries()) {
      for (const other of [base, styled]) other.scene.removeFromParent();
      scene.add(m.scene);
      m.scene.position.y = PLATE_HEIGHT;
      if (m.clips['idle']) {
        m.mixer.stopAllAction();
        const action = m.mixer.clipAction(m.clips['idle']);
        action.reset().play();
        action.time = 0.3 * m.clips['idle'].duration;
        m.mixer.update(0);
      }
      m.scene.updateMatrixWorld(true);
      box.setFromObject(m.scene);
      const h = Math.max(box.max.y - PLATE_HEIGHT, 0.2);
      const r = Math.max(h, box.max.x - box.min.x, box.max.z - box.min.z);
      const centre = box.getCenter(new THREE.Vector3());
      const dir = new THREE.Vector3(x, 0.35, z).normalize();
      cam.position.copy(centre).addScaledVector(dir, r * 2.1);
      cam.lookAt(centre);
      renderer.render(scene, cam);
      ctx.drawImage(renderer.domElement, col * tile, 28 + row * tile);
    }
    scene.remove(styled.scene);
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(`${id} from ${style.model}  (${(baseH * style.scale).toFixed(2)} vs ${baseH})`, col * tile + 8, 19);
  }
  canvas.style.cssText = 'position:absolute;inset:0;max-width:100%;max-height:100%;margin:auto';
  document.body.appendChild(canvas);
  Object.assign(window, { sheet: canvas.toDataURL('image/jpeg', 0.88) });
}

main().catch((err: unknown) => {
  info.textContent = String(err);
  console.error(err);
});
