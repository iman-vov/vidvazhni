// Dev-only page (dev/weapons.html): the six heroes side by side with their weapons, sized for the
// board (figureLook heights), frozen at one moment of a clip, to check how the weapons sit in hand.
// Renders once everything has loaded (no animation loop, so it also works in a hidden tab).
//   ?clip=idle       clip to pose: idle, walk, attack, ...
//   &t=0.3           moment of the clip, as a fraction of its length
//   &quality=medium  model tier
//   &view=board      the board's camera pitch instead of the front view
//   &hero=rogue      only this hero, close up

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { figureHeight, modelScale, WEAPONS } from './figureLook';
import { attachWeapon, loadModel } from './models';
import { GRAPHICS_QUALITIES } from './quality';

const ALL_HEROES = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const SPACING = 1.25;

const params = new URLSearchParams(location.search);
const HEROES = params.get('hero') ? [params.get('hero')!] : ALL_HEROES;
const quality = GRAPHICS_QUALITIES.find((q) => q === params.get('quality')) ?? 'medium';
const clip = params.get('clip') ?? 'idle';
const t = Number(params.get('t') ?? 0.3);
const view = document.getElementById('view')!;
const info = document.getElementById('info')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(view.clientWidth, view.clientHeight);
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d2433');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
scene.add(new THREE.HemisphereLight('#dfe7ff', '#262d3d', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.8);
sun.position.set(-4, 10, 6);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: '#56647a', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const width = (HEROES.length - 1) * SPACING;
const camera = new THREE.PerspectiveCamera(30, view.clientWidth / view.clientHeight, 0.05, 100);
if (params.get('view') === 'board') {
  camera.position.set(0, 7.2, 5.0);
  camera.lookAt(0, 0.4, 0);
} else {
  camera.position.set(0, 1.0, Math.max(3.2, width * 1.02));
  camera.lookAt(0, 0.62, 0);
}

async function main(): Promise<void> {
  const lines: string[] = [];
  for (const [i, id] of HEROES.entries()) {
    const model = await loadModel(id, { quality });
    const box = new THREE.Box3();
    model.scene.updateMatrixWorld(true);
    model.scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.skeleton.update();
      sm.computeBoundingBox();
      box.union(sm.boundingBox!.clone().applyMatrix4(sm.matrixWorld));
    });
    model.scene.scale.setScalar(modelScale(figureHeight(id, 'hero'), box.max.y - Math.min(0, box.min.y)));
    model.scene.position.x = i * SPACING - width / 2;
    scene.add(model.scene);
    for (const w of WEAPONS[id] ?? []) await attachWeapon(model, w).catch(() => lines.push(`${id}: no ${w}`));
    const action = model.play(clip, { crossFade: 0 }) ?? model.play('idle', { crossFade: 0 });
    if (action) model.mixer.setTime(action.getClip().duration * t);
    lines.push(`${id} ${(WEAPONS[id] ?? []).join(' ') || '(no weapon)'}`);
  }
  info.textContent = `${quality} · ${clip} @ ${t}\n${lines.join('\n')}`;
  const render = (): void => renderer.render(scene, camera);
  render();
  Object.assign(window, { renderGallery: render }); // for browser automation
  document.body.dataset['ready'] = '1';
}

void main();
