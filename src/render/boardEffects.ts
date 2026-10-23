// Short-lived 3D effects for the animation queue: projectiles, the soft grey puff of a dispersing
// fog creature, sparkles, coins flying to a hero, and the orbs (fork «Три стихії-сфери») that
// circle their owner. Everything is driven by the board's Animator, so speed and skip apply.

import * as THREE from 'three';
import type { OrbId } from '../rules/content';
import type { Animator } from './animator';
import { easeOut, linear } from './animator';
import type { ProjectileKind } from './figureLook';

export const ORB_COLORS: Record<OrbId, string> = { fire: '#ff7a2a', earth: '#7fbf4a', air: '#bfe8ff' };
export const ELEMENT_COLORS: Record<string, string> = {
  fire: '#ff7a2a',
  ice: '#9fdcff',
  air: '#d8f2ff',
  earth: '#8cbf4a',
  light: '#ffe680',
  dark: '#8a5ad0',
};

function softTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BoardEffects {
  readonly root = new THREE.Group();
  private readonly soft = softTexture();
  private readonly arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5).rotateX(Math.PI / 2);
  private readonly tipGeo = new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.42);
  private readonly stoneGeo = new THREE.IcosahedronGeometry(0.1, 0);
  private readonly orbGeo = new THREE.SphereGeometry(0.11, 14, 10);
  private readonly coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 12).rotateX(Math.PI / 2);
  private readonly wood = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.8 });
  private readonly steel = new THREE.MeshStandardMaterial({ color: '#c8ccd4', roughness: 0.3, metalness: 0.8 });
  private readonly stone = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.9, flatShading: true });
  private readonly gold = new THREE.MeshStandardMaterial({ color: '#f2c24a', roughness: 0.35, metalness: 0.7, emissive: '#5a3a00' });
  private readonly orbs = new Map<OrbId, { mesh: THREE.Mesh; glow: THREE.Sprite; material: THREE.MeshStandardMaterial; age: 0 | 1 }>();
  private orbClock = 0;

  constructor(private readonly anim: Animator) {}

  private sprite(color: string, additive: boolean, opacity = 1): THREE.Sprite {
    const m = new THREE.SpriteMaterial({ map: this.soft, color, transparent: true, depthWrite: false, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m);
    s.renderOrder = 5;
    return s;
  }

  private drop(o: THREE.Object3D): void {
    o.removeFromParent();
    o.traverse((c) => {
      const s = c as THREE.Sprite;
      if (s.isSprite) s.material.dispose();
    });
  }

  /** A projectile from `from` to `to` along a low arc; resolves on arrival. */
  projectile(kind: ProjectileKind, from: THREE.Vector3, to: THREE.Vector3, seconds: number): Promise<void> {
    const o = new THREE.Group();
    if (kind === 'arrow' || kind === 'stone') {
      if (kind === 'arrow') o.add(new THREE.Mesh(this.arrowGeo, this.wood), new THREE.Mesh(this.tipGeo, this.steel));
      else o.add(new THREE.Mesh(this.stoneGeo, this.stone));
      // A faint streak so the shot reads from the table-top camera.
      const trail = this.sprite('#fff4d8', true, 0.55);
      trail.scale.set(0.45, 0.45, 1);
      o.add(trail);
    } else {
      const color = kind === 'thorn' ? '#9be05a' : '#c79bff';
      const core = this.sprite('#ffffff', true, 0.9);
      core.scale.setScalar(0.2);
      const glow = this.sprite(color, true, 0.85);
      glow.scale.setScalar(0.55);
      o.add(glow, core);
    }
    this.root.add(o);
    const dist = from.distanceTo(to);
    const lift = kind === 'stone' ? 0.25 + dist * 0.12 : 0.1 + dist * 0.05;
    const prev = from.clone();
    const p = new THREE.Vector3();
    return this.anim.tween(
      seconds,
      (k) => {
        p.lerpVectors(from, to, k);
        p.y += Math.sin(k * Math.PI) * lift;
        o.position.copy(p);
        if (p.distanceToSquared(prev) > 1e-8) o.lookAt(p.clone().add(p.clone().sub(prev)));
        prev.copy(p);
        if (kind === 'stone') o.rotation.x += 0.3;
      },
      { ease: linear, done: () => this.drop(o) },
    );
  }

  /** Soft puff of sprites (grey fog dispersing, gold sparkle, element burst). */
  puff(at: THREE.Vector3, color: string, opts: { count?: number; size?: number; seconds?: number; rise?: number; additive?: boolean } = {}): Promise<void> {
    const count = opts.count ?? 9;
    const size = opts.size ?? 0.7;
    const seconds = opts.seconds ?? 1.2;
    const rise = opts.rise ?? 0.6;
    const group = new THREE.Group();
    const parts: { s: THREE.Sprite; dir: THREE.Vector3; spin: number }[] = [];
    for (let i = 0; i < count; i++) {
      const s = this.sprite(color, !!opts.additive, 0.8);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const dir = new THREE.Vector3(Math.cos(a), 0.4 + Math.random() * 0.8, Math.sin(a)).multiplyScalar(0.35 + Math.random() * 0.3);
      s.position.copy(at);
      group.add(s);
      parts.push({ s, dir, spin: (Math.random() - 0.5) * 2 });
    }
    this.root.add(group);
    return this.anim.tween(
      seconds,
      (k) => {
        for (const { s, dir, spin } of parts) {
          s.position.copy(at).addScaledVector(dir, k * 1.6).setY(at.y + dir.y * k * rise * 1.6);
          s.scale.setScalar(size * (0.4 + k * 1.1));
          s.material.opacity = 0.75 * (1 - k) * Math.min(1, k * 6);
          s.material.rotation += spin * 0.02;
        }
      },
      { ease: easeOut, done: () => this.drop(group) },
    );
  }

  /** A coin arcs from a loot hex to the hero. */
  coin(from: THREE.Vector3, to: THREE.Vector3, seconds: number): Promise<void> {
    const m = new THREE.Mesh(this.coinGeo, this.gold);
    this.root.add(m);
    const p = new THREE.Vector3();
    return this.anim.tween(
      seconds,
      (k) => {
        p.lerpVectors(from, to, k);
        p.y += Math.sin(k * Math.PI) * 0.9;
        m.position.copy(p);
        m.rotation.y = k * Math.PI * 4;
        m.scale.setScalar(1 - k * 0.5);
      },
      { done: () => m.removeFromParent() },
    );
  }

  // ─── Orbs ────────────────────────────────────────────────────────────────

  /** Shows exactly these orbs (age 1 = dimmed); returns the ids that appeared. */
  syncOrbs(orbs: Partial<Record<OrbId, { age: 0 | 1 }>>): OrbId[] {
    const added: OrbId[] = [];
    for (const [id, o] of this.orbs) {
      if (orbs[id]) continue;
      this.drop(o.mesh);
      o.material.dispose();
      this.orbs.delete(id);
    }
    for (const [id, state] of Object.entries(orbs) as [OrbId, { age: 0 | 1 }][]) {
      if (!state) continue;
      let o = this.orbs.get(id);
      if (!o) {
        const material = new THREE.MeshStandardMaterial({ color: ORB_COLORS[id], emissive: ORB_COLORS[id], emissiveIntensity: 1.2, roughness: 0.3 });
        const mesh = new THREE.Mesh(this.orbGeo, material);
        const glow = this.sprite(ORB_COLORS[id], true, 0.8);
        glow.scale.setScalar(0.62);
        mesh.add(glow);
        this.root.add(mesh);
        o = { mesh, glow, material, age: state.age };
        this.orbs.set(id, o);
        added.push(id);
      }
      this.setOrbAge(id, state.age);
    }
    return added;
  }

  setOrbAge(id: OrbId, age: 0 | 1): void {
    const o = this.orbs.get(id);
    if (!o) return;
    o.age = age;
    o.material.emissiveIntensity = age === 1 ? 0.35 : 1.2;
    o.glow.material.opacity = age === 1 ? 0.3 : 0.8;
    o.mesh.scale.setScalar(age === 1 ? 0.8 : 1);
  }

  orbMesh(id: OrbId): THREE.Mesh | undefined {
    return this.orbs.get(id)?.mesh;
  }

  get hasOrbs(): boolean {
    return this.orbs.size > 0;
  }

  /** Places the orbs around their anchors (head points); `dt` advances the circling. */
  placeOrbs(anchor: (id: OrbId) => THREE.Vector3 | null, dt: number, skip?: Set<OrbId>): void {
    this.orbClock += dt;
    const byAnchor = new Map<string, OrbId[]>();
    for (const id of this.orbs.keys()) {
      const a = anchor(id);
      if (!a) continue;
      const key = `${a.x.toFixed(2)},${a.z.toFixed(2)}`;
      let list = byAnchor.get(key);
      if (!list) byAnchor.set(key, (list = []));
      list.push(id);
    }
    for (const ids of byAnchor.values()) {
      ids.forEach((id, i) => {
        if (skip?.has(id)) return;
        const o = this.orbs.get(id)!;
        const a = anchor(id)!;
        const angle = this.orbClock * 1.4 + (i / ids.length) * Math.PI * 2;
        o.mesh.position.set(a.x + Math.cos(angle) * 0.5, a.y + 0.1 + Math.sin(this.orbClock * 2 + i) * 0.05, a.z + Math.sin(angle) * 0.5);
        o.mesh.visible = true;
      });
    }
  }

  clear(): void {
    for (const c of [...this.root.children]) if (![...this.orbs.values()].some((o) => o.mesh === c)) this.drop(c);
  }

  dispose(): void {
    this.syncOrbs({});
    this.clear();
    for (const x of [this.soft, this.arrowGeo, this.tipGeo, this.stoneGeo, this.orbGeo, this.coinGeo, this.wood, this.steel, this.stone, this.gold]) x.dispose();
  }
}
