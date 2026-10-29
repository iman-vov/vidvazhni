// Draws ruleMarks.ts on the board: flat hex fills and outlines (instanced by tone), threads on the
// floor between hexes, and HTML chips over hexes in the overlay layer. Everything is rebuilt only
// when the marks change.

import * as THREE from 'three';
import { hexKey, type Hex } from '../rules/hex';
import { iconSvg } from '../ui/icons/svg';
import { PLATE_HEIGHT } from './boardTiles';
import type { BoardOverlay, OverlayItem } from './boardOverlay';
import { HEX_SIZE, hexToWorld } from './hexLayout';
import type { Chip, HexTone, RuleMarks } from './ruleMarks';

/** Per tone: the fill (colour, opacity), the outline just inside the hex edge, and a small ring in
 *  the middle (deep water reads as a well). Opacity 0 = none. */
const TONES: Record<HexTone, { fill: [string, number]; edge: [string, number]; well?: [string, number] }> = {
  deep: { fill: ['#163f57', 0.62], edge: ['#9fd3ef', 0.55], well: ['#cfeeff', 0.75] },
  fog: { fill: ['#f2f4f8', 0.92], edge: ['#ffffff', 0] },
  fogClear: { fill: ['#eef1f5', 0.2], edge: ['#eef1f5', 0.55] },
  flood: { fill: ['#4fa3d9', 0.3], edge: ['#8fd0ff', 0.95] },
  pond: { fill: ['#ffe27a', 0.1], edge: ['#ffe27a', 0.9] },
  mirror: { fill: ['#d8f2ff', 0.32], edge: ['#d8f2ff', 0.85] },
  broken: { fill: ['#2c2c34', 0.35], edge: ['#8c8f99', 0.75] },
  lit: { fill: ['#ffe9a0', 0.38], edge: ['#ffd257', 0.95] },
  key: { fill: ['#ffc040', 0.12], edge: ['#ffc040', 0.9] },
  asleep: { fill: ['#b7a6e0', 0.12], edge: ['#b7a6e0', 0.75] },
  awake: { fill: ['#d9483b', 0.28], edge: ['#ff6a50', 0.95] },
  heart: { fill: ['#ff7aa8', 0.18], edge: ['#ff7aa8', 0.95] },
};

/** Heights over the plate: fills under the grid lines (+0.007), outlines over them; fog under too. */
const FILL_Y = PLATE_HEIGHT + 0.0062;
const EDGE_Y = PLATE_HEIGHT + 0.0095;
const LINK_Y = PLATE_HEIGHT + 0.03;

const CSS = `
.bv-chip{transform:translate(-50%,-50%);display:flex;align-items:center;gap:2px;height:22px;padding:0 6px;border-radius:11px;color:#fff;font-size:13px;font-weight:800;white-space:nowrap;box-shadow:0 0 0 1.5px rgba(255,255,255,.75),0 1px 3px rgba(0,0,0,.5)}
.bv-chip.blue,.bv-tag.blue{background:rgba(36,98,148,.92)}.bv-chip.gold,.bv-tag.gold{background:rgba(150,104,18,.92)}
.bv-chip.violet,.bv-tag.violet{background:rgba(92,72,140,.92)}.bv-chip.red,.bv-tag.red{background:rgba(160,40,32,.92)}
.bv-chip.green,.bv-tag.green{background:rgba(40,118,60,.92)}.bv-chip.grey,.bv-tag.grey{background:rgba(70,74,86,.92)}
.bv-x{position:relative;display:inline-flex}.bv-x::after{content:'';position:absolute;left:-1px;right:-1px;top:50%;height:2px;background:#ff8a7a;transform:rotate(-40deg);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
`;

/** A chip's inner HTML (shared with the figure badges' tags). */
export function chipHtml(chip: Chip, size: number): string {
  const icon = chip.icon ? iconSvg(chip.icon, { size: `${size}px` }) : '';
  return `${chip.crossed ? `<span class="bv-x">${icon}</span>` : icon}${chip.text}`;
}

export class RuleMarkLayer {
  readonly root = new THREE.Group();
  private key = '';
  private chips: OverlayItem[] = [];
  private readonly fillGeo = new THREE.CircleGeometry(HEX_SIZE * 0.97, 6).rotateX(-Math.PI / 2);
  private readonly edgeGeo = new THREE.RingGeometry(HEX_SIZE * 0.8, HEX_SIZE * 0.9, 6).rotateX(-Math.PI / 2);
  private readonly wellGeo = new THREE.RingGeometry(HEX_SIZE * 0.3, HEX_SIZE * 0.38, 24).rotateX(-Math.PI / 2);
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly linkMat = new THREE.MeshBasicMaterial({ color: '#c9b8f0', transparent: true, opacity: 0.75, depthWrite: false });
  private fogMap: THREE.Texture | null = null;

  constructor(private readonly overlay: BoardOverlay) {
    this.root.name = 'rule-marks';
    if (!document.getElementById('bv-rule-style')) {
      const style = document.createElement('style');
      style.id = 'bv-rule-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  sync(marks: RuleMarks): void {
    const key = JSON.stringify([marks.hexes, marks.chips, marks.links]);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    const byTone = new Map<HexTone, Hex[]>();
    for (const m of marks.hexes) {
      const list = byTone.get(m.tone) ?? [];
      list.push(m.hex);
      byTone.set(m.tone, list);
    }
    for (const [tone, hexes] of byTone) {
      const t = TONES[tone];
      if (t.fill[1] > 0) this.add(this.fillGeo, this.material(`fill:${tone}`, t.fill, tone === 'fog' || tone === 'fogClear'), hexes, FILL_Y, true);
      if (t.edge[1] > 0) this.add(this.edgeGeo, this.material(`edge:${tone}`, t.edge), hexes, EDGE_Y, false);
      if (t.well) this.add(this.wellGeo, this.material(`well:${tone}`, t.well), hexes, EDGE_Y, false);
    }
    for (const [a, b] of marks.links) this.link(a, b);
    // Chips on one hex stack upwards.
    const onHex = new Map<string, number>();
    for (const chip of marks.chips) {
      const k = hexKey(chip.hex);
      const n = onHex.get(k) ?? 0;
      onHex.set(k, n + 1);
      const el = document.createElement('div');
      el.className = `bv-chip ${chip.tone}`;
      el.innerHTML = chipHtml(chip, 14);
      const { x, z } = hexToWorld(chip.hex[0], chip.hex[1]);
      const p = new THREE.Vector3(x, PLATE_HEIGHT + chip.lift * HEX_SIZE + n * 0.32, z);
      this.chips.push(this.overlay.add(el, () => p));
    }
  }

  private material(key: string, [color, opacity]: [string, number], fog = false): THREE.MeshBasicMaterial {
    let m = this.materials.get(key);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    if (fog) m.map = this.fogTexture();
    this.materials.set(key, m);
    return m;
  }

  /** Soft clouds for the fog banks: white puffs, denser in the middle of the hex. */
  private fogTexture(): THREE.Texture {
    if (this.fogMap) return this.fogMap;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const base = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    base.addColorStop(0, 'rgba(255,255,255,1)');
    base.addColorStop(1, 'rgba(255,255,255,0.8)');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const x = size * (0.2 + rnd() * 0.6);
      const y = size * (0.2 + rnd() * 0.6);
      const r = size * (0.14 + rnd() * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(200,206,216,0.55)');
      g.addColorStop(1, 'rgba(200,206,216,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    this.fogMap = new THREE.CanvasTexture(canvas);
    this.fogMap.colorSpace = THREE.SRGBColorSpace;
    return this.fogMap;
  }

  private add(geometry: THREE.BufferGeometry, material: THREE.Material, hexes: Hex[], y: number, turn: boolean): void {
    const mesh = new THREE.InstancedMesh(geometry, material, hexes.length);
    const m = new THREE.Matrix4();
    hexes.forEach(([q, r], i) => {
      const { x, z } = hexToWorld(q, r);
      // Fog puffs turn by the hex (a sixth of a turn keeps the hex shape), so banks do not repeat.
      m.makeRotationY(turn ? (((q * 7 + r * 13) % 6) + 6) % 6 * (Math.PI / 3) : 0).setPosition(x, y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.renderOrder = 3;
    mesh.raycast = () => {};
    this.root.add(mesh);
  }

  /** A thread on the floor from `a` to `b`: a thin strip, a little over the plate. */
  private link(a: Hex, b: Hex): void {
    const p = hexToWorld(a[0], a[1]);
    const q = hexToWorld(b[0], b[1]);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 0.01) return;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.07 * HEX_SIZE, len).rotateX(-Math.PI / 2), this.linkMat);
    strip.position.set((p.x + q.x) / 2, LINK_Y, (p.z + q.z) / 2);
    strip.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    strip.renderOrder = 3;
    strip.raycast = () => {};
    this.root.add(strip);
  }

  private clear(): void {
    for (const item of this.chips) this.overlay.remove(item);
    this.chips = [];
    for (const o of [...this.root.children]) {
      o.removeFromParent();
      if ((o as THREE.Mesh).geometry !== this.fillGeo && (o as THREE.Mesh).geometry !== this.edgeGeo && (o as THREE.Mesh).geometry !== this.wellGeo) (o as THREE.Mesh).geometry.dispose();
      (o as THREE.InstancedMesh).dispose?.();
    }
  }

  dispose(): void {
    this.clear();
    for (const g of [this.fillGeo, this.edgeGeo, this.wellGeo]) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.linkMat.dispose();
    this.fogMap?.dispose();
  }
}
