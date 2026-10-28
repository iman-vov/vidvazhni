// Draws a monster that has no Meshy model of its own as an existing model, recoloured and reshaped
// (figureLook.ts `RESTYLES`): the texture's brightness goes through a three-colour ramp in the
// shader, the lower body may take a belly colour, and a few simple pieces (a wind-up key, eyes,
// crystals, a heart, a crown) ride the nearest bones.

import * as THREE from 'three';
import type { Restyle, RestyleAccessory } from './figureLook';
import type { Model } from './models';

/** What the restyle made and the caller must dispose of with the figure. */
export interface RestyleParts {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/** Restyles the model's (already per-figure) materials in place and adds the accessories. Call it
 *  while the model's scene still has scale 1, then scale it by `restyledScale`. */
export function applyRestyle(model: Model, style: Restyle): RestyleParts {
  const parts: RestyleParts = { materials: [], geometries: [] };
  const scene = model.scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      sm.computeBoundingBox();
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) restyleMaterial(m as THREE.MeshStandardMaterial, style, mesh.geometry);
  });
  for (const a of style.accessories ?? []) {
    for (const side of a.mirror ? [1, -1] : [1]) {
      const object = accessory(a, box, parts);
      const size = box.getSize(new THREE.Vector3());
      object.position.set(box.min.x + (0.5 + a.at[0] * side) * size.x, box.min.y + a.at[1] * size.y, box.min.z + (0.5 + a.at[2]) * size.z);
      if (side < 0) object.scale.x *= -1;
      boneFor(scene, object.position, a.bone)?.attach(object) ?? scene.add(object);
    }
  }
  if (style.clipSpeed) model.mixer.timeScale = style.clipSpeed;
  return parts;
}

/** Scale for a restyled model whose height scale is `scale`. */
export function restyledScale(style: Restyle | undefined, scale: number): THREE.Vector3 {
  const w = scale * (style?.widen ?? 1);
  return new THREE.Vector3(w, scale, w);
}

function restyleMaterial(m: THREE.MeshStandardMaterial, style: Restyle, geometry: THREE.BufferGeometry): void {
  if (!m.isMeshStandardMaterial) return;
  if (style.metalness !== undefined) {
    m.metalness = style.metalness;
    m.metalnessMap = null;
  }
  if (style.roughness !== undefined) {
    m.roughness = style.roughness;
    m.roughnessMap = null;
  }
  if (style.opacity !== undefined && style.opacity < 1) {
    m.opacity = style.opacity;
    m.transparent = true;
    m.userData['alwaysTransparent'] = true;
  }
  geometry.computeBoundingBox();
  const gb = geometry.boundingBox!;
  const uniforms = {
    restyleLo: { value: new THREE.Color(style.ramp[0]) },
    restyleMid: { value: new THREE.Color(style.ramp[1]) },
    restyleHi: { value: new THREE.Color(style.ramp[2]) },
    restyleBelly: { value: new THREE.Color(style.belly?.color ?? '#000000') },
    restyleBellyBelow: { value: style.belly?.below ?? -1 },
    restyleYRange: { value: new THREE.Vector2(gb.min.y, Math.max(gb.max.y - gb.min.y, 1e-6)) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 restyleYRange;\nvarying float vRestyleY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestyleY = (position.y - restyleYRange.x) / restyleYRange.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 restyleLo;\nuniform vec3 restyleMid;\nuniform vec3 restyleHi;\nuniform vec3 restyleBelly;\nuniform float restyleBellyBelow;\nvarying float vRestyleY;',
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'float restyleL = smoothstep(0.04, 0.7, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));',
          'vec3 restyleC = restyleL < 0.5 ? mix(restyleLo, restyleMid, restyleL * 2.0) : mix(restyleMid, restyleHi, restyleL * 2.0 - 1.0);',
          'float restyleB = 1.0 - smoothstep(restyleBellyBelow - 0.08, restyleBellyBelow + 0.04, vRestyleY);',
          'restyleC = mix(restyleC, restyleBelly * (0.55 + 0.6 * restyleL), restyleB);',
          'diffuseColor.rgb = restyleC;',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'restyle';
  m.needsUpdate = true;
}

function accessory(a: RestyleAccessory, box: THREE.Box3, parts: RestyleParts): THREE.Object3D {
  const h = box.max.y - box.min.y;
  const s = a.size * h;
  const mat = (color: string, glow = a.glow): THREE.Material => {
    const m = glow
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: a.shape === 'key' || a.shape === 'crown' ? 0.6 : 0 });
    parts.materials.push(m);
    return m;
  };
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    parts.geometries.push(g);
    return g;
  };
  const g = new THREE.Group();
  g.name = `restyle-${a.shape}`;
  switch (a.shape) {
    case 'key': {
      // A clockwork key sticking out of the back: a shaft and two round bows.
      const shaft = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.5 * s, 8)), mat(a.color));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.25 * s;
      g.add(shaft);
      for (const x of [-1, 1]) {
        const bow = new THREE.Mesh(geo(new THREE.TorusGeometry(0.2 * s, 0.06 * s, 6, 14)), mat(a.color));
        bow.position.set(x * 0.24 * s, 0, -0.55 * s);
        bow.rotation.y = Math.PI / 2;
        g.add(bow);
      }
      break;
    }
    case 'eye': {
      const ball = new THREE.Mesh(geo(new THREE.SphereGeometry(0.5 * s, 14, 10)), mat(a.color));
      g.add(ball);
      if (!a.glow) {
        const pupil = new THREE.Mesh(geo(new THREE.SphereGeometry(0.22 * s, 10, 8)), mat('#151510'));
        pupil.position.set(0, 0.05 * s, 0.38 * s);
        pupil.scale.set(1.3, 0.5, 0.6);
        g.add(pupil);
      }
      break;
    }
    case 'crystal': {
      const m = mat(a.color) as THREE.MeshStandardMaterial;
      m.transparent = true;
      m.opacity = 0.85;
      m.flatShading = true;
      for (const [x, tilt, k] of [[0, 0.3, 1], [-0.25, -0.2, 0.7], [0.2, 0.7, 0.6]] as const) {
        const c = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.3 * s * k, 0)), m);
        c.scale.set(0.6, 1.8, 0.6);
        c.position.set(x * s, 0.3 * s * k, 0);
        c.rotation.z = tilt;
        g.add(c);
      }
      break;
    }
    case 'heart': {
      const core = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.5 * s, 0)), mat(a.color));
      core.scale.set(0.8, 1.1, 0.6);
      g.add(core);
      break;
    }
    case 'crown': {
      const ring = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.42 * s, 0.38 * s, 0.18 * s, 12, 1, true)), mat(a.color));
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(geo(new THREE.ConeGeometry(0.08 * s, 0.32 * s, 5)), mat(a.color));
        spike.position.set(Math.cos(t) * 0.4 * s, 0.24 * s, Math.sin(t) * 0.4 * s);
        g.add(spike);
      }
      break;
    }
  }
  for (const o of g.children) o.castShadow = true;
  return g;
}

/** The nearest bone, among those named like `name` if given (Left/Right pairs pick the near side). */
function boneFor(root: THREE.Object3D, point: THREE.Vector3, name: string | undefined): THREE.Bone | null {
  let best: THREE.Bone | null = null;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const bone = o as THREE.Bone;
    if (!bone.isBone) return;
    if (name && !bone.name.includes(name)) return;
    const d = bone.getWorldPosition(p).distanceToSquared(point);
    if (d < bestD) {
      bestD = d;
      best = bone;
    }
  });
  return best;
}
