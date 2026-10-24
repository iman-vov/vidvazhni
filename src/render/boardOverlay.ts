// HTML layer over the board canvas: health bars and condition icons above figures, floating damage
// numbers and labels, movement costs and expected damage. HTML keeps text sharp at any pixel ratio;
// the board positions every item from its world point after each rendered frame. The layer never
// takes pointer events, so taps reach the canvas.

import * as THREE from 'three';
import type { ConditionId } from '../rules/content';
import type { IconName } from '../ui/icons/names';
import { iconInner, iconSvg } from '../ui/icons/svg';

/** Condition icons (the game's set, src/ui/icons) differ by shape, not only colour (style guide). */
export const CONDITION_ICONS: Record<ConditionId, { color: string; svg: string }> = {
  poison: { color: '#4fb04a', svg: iconInner('poison') },
  wound: { color: '#c0504d', svg: iconInner('wound') },
  immobilize: { color: '#5b7da8', svg: iconInner('immobilize') },
  disarm: { color: '#b07a3a', svg: iconInner('disarm') },
  stun: { color: '#e6c229', svg: iconInner('stun') },
  muddle: { color: '#9b6ad1', svg: iconInner('muddle') },
  invisible: { color: '#a7b4c6', svg: iconInner('invisible') },
  strengthen: { color: '#e0582b', svg: iconInner('strengthen') },
};

export function conditionIconSvg(c: ConditionId, size = 18): string {
  const icon = CONDITION_ICONS[c];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${icon.color}" aria-hidden="true">${icon.svg}</svg>`;
}

const CSS = `
.bv-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;font:600 13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f4f1e8;user-select:none;-webkit-user-select:none}
.bv-item{position:absolute;left:0;top:0;will-change:transform}
.bv-fig{display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-100%)}
.bv-hp{position:relative;width:46px;height:9px;border-radius:5px;background:rgba(20,22,30,.78);box-shadow:0 0 0 1.5px rgba(20,22,30,.6);overflow:hidden}
.bv-hp>i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#7fdc6a,#3d9a3a);transition:width .25s}
.bv-hp.mid>i{background:linear-gradient(#f2d260,#c99a22)}
.bv-hp.low>i{background:linear-gradient(#ff8b6b,#c4452e)}
.bv-hp>b{position:absolute;inset:0;font-size:8px;line-height:9px;text-align:center;color:#fff;text-shadow:0 0 2px #000}
.bv-fig.hero .bv-hp{width:56px;height:11px}.bv-fig.hero .bv-hp>b{font-size:9.5px;line-height:11px}
.bv-fig.hero .bv-hp,.bv-fig.ally .bv-hp{box-shadow:0 0 0 1.5px rgba(240,196,112,.85),0 1px 3px rgba(0,0,0,.5)}
.bv-fig.foe .bv-hp{box-shadow:0 0 0 1.5px rgba(154,144,192,.9),0 1px 3px rgba(0,0,0,.5)}
.bv-fig.foe .bv-hp>i,.bv-fig.foe .bv-hp.mid>i,.bv-fig.foe .bv-hp.low>i{background:linear-gradient(#ef7468,#a8323a)}
.bv-fig.elite .bv-hp,.bv-fig.boss .bv-hp{box-shadow:0 0 0 2px #f0c040,0 0 5px rgba(240,192,64,.55),0 1px 3px rgba(0,0,0,.5)}
.bv-fig.boss .bv-hp{width:72px;height:12px}.bv-fig.boss .bv-hp>b{font-size:10px;line-height:12px}
.bv-conds{display:flex;gap:1px;min-height:0}
.bv-conds>span{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;background:rgba(20,22,30,.72);transition:transform .2s}
.bv-conds>span.pop{animation:bv-pop .45s ease-out}
.bv-conds>span.shield{border-radius:4px;width:auto;padding:0 3px;gap:1px;font-size:11px;color:#dfe6f2}
.bv-fig.dim{opacity:.55}
.bv-mark{display:inline-flex;align-items:center;gap:1px;height:18px;padding:0 4px;border-radius:9px;background:rgba(150,36,30,.9);color:#fff;font-size:11px;font-weight:800;box-shadow:0 0 0 1.5px rgba(255,210,120,.85)}
.bv-mark[hidden]{display:none}
.bv-float{transform:translate(-50%,-175%)}
.bv-float>span{display:block;white-space:nowrap;font-size:26px;font-weight:800;text-shadow:0 2px 0 rgba(0,0,0,.45),0 0 6px rgba(0,0,0,.6)}
.bv-float.dmg>span{color:#ff6b57}.bv-float.heal>span{color:#7ee07a}.bv-float.miss>span{color:#d7dbe4;font-size:18px}
.bv-float.x2>span{color:#ffd23f;font-size:20px}.bv-float.shield>span{color:#a9c6ff;font-size:17px}.bv-float.coin>span{color:#ffd54a;font-size:18px}
.bv-float.info>span{color:#f4f1e8;font-size:15px}
.bv-float.heal>span{display:flex;align-items:center;gap:2px;font-size:28px;color:#8af58a;text-shadow:0 2px 0 rgba(10,60,20,.6),0 0 10px rgba(110,240,120,.75)}
.bv-float.shield>span{display:flex;align-items:center;gap:3px;padding:1px 8px 1px 5px;border-radius:10px;background:rgba(30,52,96,.82);box-shadow:0 0 0 1.5px rgba(169,198,255,.85);font-size:17px;color:#dbe7ff;text-shadow:none}
.bv-float.cond>span{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:rgba(20,22,30,.82);box-shadow:0 0 0 2px currentColor,0 0 10px currentColor}
.bv-float.die>span{display:flex;align-items:center;justify-content:center;width:34px;height:34px;font-size:17px;color:#2a1a06;background:#f2d9a0;clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);text-shadow:none}
.bv-cost{transform:translate(-50%,-50%);font-size:12px;font-weight:800;color:#3a2a08;background:rgba(255,226,140,.92);border-radius:8px;padding:0 5px;line-height:16px}
.bv-exp{transform:translate(-50%,-100%);display:flex;align-items:center;gap:2px;white-space:nowrap;font-size:14px;font-weight:800;color:#fff;background:rgba(196,60,40,.92);border-radius:9px;padding:1px 7px;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.bv-exp.ally{background:rgba(36,128,64,.94);box-shadow:0 0 0 1.5px rgba(160,255,180,.7),0 1px 3px rgba(0,0,0,.5)}
.bv-reset{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(240,196,112,.7);background:rgba(28,24,22,.78);color:#f4e2bc;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.45);transition:opacity .2s;z-index:1;touch-action:manipulation}
.bv-reset[hidden]{display:none}
.bv-reset:active{transform:translateY(-50%) scale(.94)}
@keyframes bv-pop{0%{transform:scale(.2)}60%{transform:scale(1.4)}100%{transform:scale(1)}}
`;

export interface OverlayItem {
  el: HTMLElement;
  /** World point the item is pinned to (read every frame, so it can follow a moving figure). */
  anchor: () => THREE.Vector3 | null;
  /** Floating labels: board time (s) it appeared and how long it lives; removed after that. */
  born?: number;
  life?: number;
}

/** Rise-and-fade of a floating label at k = 0..1 of its life: [translateY px, scale, opacity]. */
export function floatPose(k: number): [number, number, number] {
  if (k < 0.15) {
    const u = k / 0.15;
    return [6 - 6 * u, 0.6 + 0.55 * u, u];
  }
  if (k < 0.3) {
    const u = (k - 0.15) / 0.15;
    return [-4 * u, 1.15 - 0.15 * u, 1];
  }
  const u = (k - 0.3) / 0.7;
  return [-4 - 34 * u, 1, 1 - u * u];
}

export class BoardOverlay {
  readonly layer: HTMLDivElement;
  private readonly items = new Set<OverlayItem>();
  private readonly v = new THREE.Vector3();
  /** Board time in seconds (advanced by the board with the speed setting applied). */
  time = 0;
  /** Reduced motion: floating labels only fade in and out where they appear. */
  still = false;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('bv-style')) {
      const style = document.createElement('style');
      style.id = 'bv-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.layer = document.createElement('div');
    this.layer.className = 'bv-layer';
    parent.appendChild(this.layer);
  }

  add(el: HTMLElement, anchor: () => THREE.Vector3 | null, life?: number): OverlayItem {
    el.classList.add('bv-item');
    const item: OverlayItem = { el, anchor, ...(life ? { born: this.time, life } : {}) };
    this.items.add(item);
    this.layer.appendChild(el);
    return item;
  }

  remove(item: OverlayItem | null | undefined): void {
    if (!item || !this.items.delete(item)) return;
    item.el.remove();
  }

  /** Floating text that rises and fades (damage, heal, «промах», ×2, coins), optionally after an icon. */
  float(text: string, cls: string, anchor: () => THREE.Vector3 | null, seconds: number, icon?: IconName): void {
    const el = document.createElement('div');
    el.className = `bv-float ${cls}`;
    const span = document.createElement('span');
    span.textContent = text;
    if (icon) span.insertAdjacentHTML('afterbegin', `${iconSvg(icon, { size: '0.9em' })} `);
    el.appendChild(span);
    this.add(el, anchor, seconds);
  }

  /** A floating icon or badge (HTML) that pops and rises like a float: a condition over the figure
   *  it lands on, the X die's roll. `color` tints the icon. */
  pop(html: string, cls: string, anchor: () => THREE.Vector3 | null, seconds: number, color?: string): void {
    const el = document.createElement('div');
    el.className = `bv-float ${cls}`;
    const span = document.createElement('span');
    span.innerHTML = html;
    if (color) span.style.color = color;
    el.appendChild(span);
    this.add(el, anchor, seconds);
  }

  /** Removes every float (skip ends them at once). */
  clearFloats(): void {
    for (const item of [...this.items]) if (item.el.classList.contains('bv-float')) this.remove(item);
  }

  /** Projects every item with the camera; `w`/`h` = canvas CSS size. */
  update(camera: THREE.Camera, w: number, h: number): void {
    for (const item of [...this.items]) {
      if (item.life !== undefined && item.born !== undefined) {
        const k = (this.time - item.born) / item.life;
        if (k >= 1) {
          this.remove(item);
          continue;
        }
        const [y, scale, opacity] = this.still ? [0, 1, Math.min(1, k * 8) * (1 - k * k)] : floatPose(Math.max(0, k));
        const span = item.el.firstElementChild as HTMLElement | null;
        if (span) {
          span.style.transform = `translateY(${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
          span.style.opacity = opacity.toFixed(3);
        }
      }
      const p = item.anchor();
      if (!p) {
        item.el.style.display = 'none';
        continue;
      }
      const v = this.v;
      v.copy(p).project(camera);
      if (v.z > 1) {
        item.el.style.display = 'none';
        continue;
      }
      item.el.style.display = '';
      item.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  /** Whether any timed item is still showing (the board keeps rendering until they expire). */
  get hasTimed(): boolean {
    for (const item of this.items) if (item.life !== undefined) return true;
    return false;
  }

  dispose(): void {
    this.items.clear();
    this.layer.remove();
  }
}

/** Health bar + condition row for one figure. */
export class FigureBadge {
  readonly el: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly fill: HTMLElement;
  private readonly text: HTMLElement;
  private readonly conds: HTMLDivElement;
  private readonly mark: HTMLSpanElement;
  private markKey = '';
  private shown = new Set<string>();

  /** The side shows in the bar: heroes (and summons) green in a warm gold frame, monsters red in a
   *  grey-violet frame, elites and bosses with a gold trim. */
  constructor(kind: 'hero' | 'monster' | 'elite' | 'boss' | 'summon') {
    this.el = document.createElement('div');
    const side = kind === 'hero' ? 'hero' : kind === 'summon' ? 'ally' : `foe ${kind}`;
    this.el.className = `bv-fig ${side}`;
    this.conds = document.createElement('div');
    this.conds.className = 'bv-conds';
    this.bar = document.createElement('div');
    this.bar.className = 'bv-hp';
    this.fill = document.createElement('i');
    this.text = document.createElement('b');
    this.bar.append(this.fill, this.text);
    this.mark = document.createElement('span');
    this.mark.className = 'bv-mark';
    this.mark.hidden = true;
    this.el.append(this.mark, this.conds, this.bar);
  }

  /** A scenario event countdown over the figure (turns until the horn-blower calls, hexes the
   *  runner still has to go); null hides it. */
  setMark(mark: { icon: IconName; value: number } | null): void {
    const key = mark ? `${mark.icon}|${mark.value}` : '';
    if (key === this.markKey) return;
    this.markKey = key;
    this.mark.hidden = !mark;
    this.mark.innerHTML = mark ? `${iconSvg(mark.icon, { size: '12px' })}${mark.value}` : '';
  }

  setHp(hp: number, maxHp: number): void {
    const k = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.fill.style.width = `${k * 100}%`;
    this.text.textContent = `${hp}/${maxHp}`;
    this.bar.classList.toggle('mid', k <= 0.6 && k > 0.3);
    this.bar.classList.toggle('low', k <= 0.3);
  }

  /** Condition ids plus an optional shield value; new icons pop in. */
  setConditions(conditions: readonly ConditionId[], shield: number, pop = false): void {
    const key = (c: string) => c;
    const next = new Set<string>(conditions.map(key));
    if (shield > 0) next.add(`shield:${shield}`);
    const same = next.size === this.shown.size && [...next].every((k) => this.shown.has(k));
    if (same) return;
    const old = this.shown;
    this.shown = next;
    this.conds.textContent = '';
    for (const c of conditions) {
      const span = document.createElement('span');
      span.innerHTML = conditionIconSvg(c, 15);
      span.title = c;
      if (pop && !old.has(c)) span.classList.add('pop');
      this.conds.appendChild(span);
    }
    if (shield > 0) {
      const span = document.createElement('span');
      span.className = 'shield';
      span.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" style="color:#8fb0e8" aria-hidden="true">${iconInner('shield')}</svg>${shield}`;
      if (pop && !old.has(`shield:${shield}`)) span.classList.add('pop');
      this.conds.appendChild(span);
    }
  }

  setDim(dim: boolean): void {
    this.el.classList.toggle('dim', dim);
  }
}
