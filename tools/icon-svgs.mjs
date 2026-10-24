// Writes the game's icons into src/ui/icons/svg/<name>.svg (run: node tools/icon-svgs.mjs).
// Style (art/ui-mockups/icon-sheet/CHOICE.md, base v5): a dark-navy silhouette in currentColor, at most
// one accent colour through var(--icon-accent, …), and a light halo var(--icon-halo, …) around every
// shape so an icon reads on the parchment cards and on the dark slate HUD alike. Details inside a
// shape are drawn in the halo colour. Each icon is a list of shapes; `L` starts a new layer (its halo
// cuts into the shapes below, which separates overlapping cards, coins and the like).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src', 'ui', 'icons', 'svg');
const HALO = 'var(--icon-halo,#fbf5e6)';
const HALO_W = 3;
const OUTLINE_W = 1.3;
export const ACCENTS = { red: '#c8372d', green: '#2e9a4b', teal: '#1d8c9c', gold: '#d39b22' };

// ---------- geometry helpers (all return path data) ----------
const f = (n) => +n.toFixed(2);
const P = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + ' Z';
const line = (x1, y1, x2, y2) => `M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`;
const circ = (cx, cy, r) => `M${f(cx - r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)} A${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
const ell = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)} A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)} A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`;
const rr = (x, y, w, h, r) =>
  `M${f(x + r)} ${f(y)} L${f(x + w - r)} ${f(y)} A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)} L${f(x + w)} ${f(y + h - r)} A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)} L${f(x + r)} ${f(y + h)} A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)} L${f(x)} ${f(y + r)} A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)} Z`;
const rad = (a) => (a * Math.PI) / 180;
const onC = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
const star = (cx, cy, ro, ri, n = 5, rot = -90) => P(Array.from({ length: n * 2 }, (_, i) => onC(cx, cy, i % 2 ? ri : ro, rot + (i * 180) / n)));
const hex = (cx, cy, r) => P(Array.from({ length: 6 }, (_, i) => onC(cx, cy, r, -90 + i * 60)));
/** Arrow head with its tip at (x, y) pointing along angle `a` (degrees, 0 = right, 90 = down). */
const head = (x, y, a, len = 4.4, half = 3.1) => {
  const [ux, uy] = [Math.cos(rad(a)), Math.sin(rad(a))];
  const [bx, by] = [x - ux * len, y - uy * len];
  return P([[x, y], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]]);
};
/** Circular arc from angle a0 clockwise to a1 (degrees). */
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = onC(cx, cy, r, a0);
  const [x1, y1] = onC(cx, cy, r, a1);
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
};
/** Part of circle 1 outside circle 2, as a sampled outline. */
function crescent(c1x, c1y, r1, c2x, c2y, r2) {
  const pts = [];
  const inside2 = (x, y) => Math.hypot(x - c2x, y - c2y) < r2;
  const inside1 = (x, y) => Math.hypot(x - c1x, y - c1y) <= r1 + 1e-6;
  // outer boundary: points of circle 1 not inside circle 2
  const outer = [];
  for (let i = 0; i < 720; i++) {
    const p = onC(c1x, c1y, r1, i / 2);
    outer.push(inside2(...p) ? null : p);
  }
  // rotate so the run of kept points is contiguous
  const start = outer.findIndex((p, i) => p && !outer[(i + 719) % 720]);
  for (let k = 0; k < 720; k++) {
    const p = outer[(start + k) % 720];
    if (!p) break;
    if (k % 12 === 0) pts.push(p);
  }
  const end = pts[pts.length - 1];
  const a0 = Math.atan2(end[1] - c2y, end[0] - c2x);
  const inner = [];
  for (let i = 0; i < 720; i++) {
    const p = onC(c2x, c2y, r2, (a0 * 180) / Math.PI - i / 2);
    if (!inside1(...p) && inner.length) break;
    if (inside1(...p) && i % 12 === 0) inner.push(p);
  }
  return P([...pts, ...inner]);
}
const boot = (x, y, s) => P([[0, 0], [4.6, 0], [4.6, 5], [8.8, 6.2], [10, 7.6], [10, 10], [0, 10]].map(([a, b]) => [x + a * s, y + b * s]));
const drop = (cx, cy, r) => `M${f(cx)} ${f(cy - 2.2 * r)} C${f(cx + 0.4 * r)} ${f(cy - 1.3 * r)} ${f(cx + r)} ${f(cy - 0.7 * r)} ${f(cx + r)} ${f(cy)} A${r} ${r} 0 0 1 ${f(cx - r)} ${f(cy)} C${f(cx - r)} ${f(cy - 0.7 * r)} ${f(cx - 0.4 * r)} ${f(cy - 1.3 * r)} ${f(cx)} ${f(cy - 2.2 * r)} Z`;
const plus = (cx, cy, len, th) => {
  const [a, b] = [len / 2, th / 2];
  return P([[cx - b, cy - a], [cx + b, cy - a], [cx + b, cy - b], [cx + a, cy - b], [cx + a, cy + b], [cx + b, cy + b], [cx + b, cy + a], [cx - b, cy + a], [cx - b, cy + b], [cx - a, cy + b], [cx - a, cy - b], [cx - b, cy - b]]);
};
function gear(cx, cy, ro, ri, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    const w = 360 / n;
    pts.push(onC(cx, cy, ri, a - w * 0.5), onC(cx, cy, ri, a - w * 0.28), onC(cx, cy, ro, a - w * 0.18), onC(cx, cy, ro, a + w * 0.18), onC(cx, cy, ri, a + w * 0.28));
  }
  return P(pts);
}

// ---------- shape constructors ----------
const B = (d, o = {}) => ({ k: 'B', d, ...o }); // body fill
const A = (d, o = {}) => ({ k: 'A', d, ...o }); // accent fill
const Ao = (d, o = {}) => ({ k: 'Ao', d, ...o }); // accent fill with a body outline
const Bs = (d, w = 2.2, o = {}) => ({ k: 'Bs', d, w, ...o }); // body stroke
const As = (d, w = 2, o = {}) => ({ k: 'As', d, w, ...o }); // accent stroke
const Aso = (d, w = 2, o = {}) => ({ k: 'Aso', d, w, ...o }); // accent stroke with a body outline
const D = (d, w = 1.2, o = {}) => ({ k: 'D', d, w, ...o }); // halo-coloured line on top
const Df = (d, o = {}) => ({ k: 'Df', d, ...o }); // halo-coloured fill on top
const L = { k: 'L' };

/** Sword from the pommel (hx, hy) to the tip (tx, ty). */
function sword(hx, hy, tx, ty, guard = 3.4) {
  const len = Math.hypot(tx - hx, ty - hy);
  const [ux, uy] = [(tx - hx) / len, (ty - hy) / len];
  const [nx, ny] = [-uy, ux];
  const at = (t, s = 0) => [hx + ux * t + nx * s, hy + uy * t + ny * s];
  const g = 4.4;
  return [
    B(P([at(g + 0.4, 1.55), at(len - 2.8, 1.55), [tx, ty], at(len - 2.8, -1.55), at(g + 0.4, -1.55)])),
    Bs(line(...at(g, guard), ...at(g, -guard)), 2.4),
    Bs(line(...at(1.2), ...at(g)), 2.3),
    B(circ(...at(0.4), 1.6)),
    D(line(...at(g + 1.6), ...at(len - 3.2)), 1),
  ];
}
const reticle = (cx, cy, r, kRing, kDot) => [kRing(circ(cx, cy, r), 1.9), kDot(circ(cx, cy, 1.1))];
const ORB = 'translate(12 12) scale(.6) translate(-12 -12)';
const SMALL = (s, x = 12, y = 12) => `translate(${x} ${y}) scale(${s}) translate(-12 -12)`;

// Shared drawings
const FLAME = 'M12 22 C7.5 22 4.5 19 4.5 15 C4.5 11 7.5 9 8 5.5 C10 7 11 9 11 11 C12.5 9 13.5 6 13 2 C17 4.5 19.5 9.5 19.5 14.5 C19.5 19 16.5 22 12 22 Z';
const FLAME_IN = 'M12 20 C10 20 8.8 18.6 8.8 17 C8.8 15.2 10.3 14.3 10.8 12.6 C12 13.5 12.4 14.6 12.4 15.6 C13.2 14.9 13.6 14 13.7 13 C15 14.2 15.4 15.6 15.4 16.8 C15.4 18.8 14 20 12 20 Z';
const fire = [Ao(FLAME), Df(FLAME_IN)];
const iceArms = [0, 60, 120, 180, 240, 300].flatMap((a) => {
  const [x1, y1] = onC(12, 12, 9.2, a - 90);
  const [bx, by] = onC(12, 12, 5.6, a - 90);
  const [l1x, l1y] = onC(bx, by, 3, a - 90 - 50);
  const [l2x, l2y] = onC(bx, by, 3, a - 90 + 50);
  return [`${line(12, 12, x1, y1)}`, `M${f(l1x)} ${f(l1y)} L${f(bx)} ${f(by)} L${f(l2x)} ${f(l2y)}`];
});
const ice = [Aso(iceArms.join(' '), 2), B(hex(12, 12, 2.4))];
const AIR = ['M2.5 9 L13 9 C15.5 9 16.6 6.6 15.6 5 C14.4 3.3 11.8 4 11.8 6', 'M2.5 13 L18 13 C20.5 13 21.8 15.5 20.5 17.5 C19.3 19.2 16.5 18.6 16.5 16.5', 'M5 17 L11.5 17'];
const air = [Aso(AIR.join(' '), 2.1)];
const earth = [
  B(P([[2, 21.5], [4, 14], [9, 10], [13.2, 13], [14, 21.5]])),
  B(P([[11.5, 21.5], [13, 12], [17, 8], [21, 11], [22, 21.5]])),
  A(P([[4, 14], [9, 10], [10.2, 13.2], [5.8, 15.8]])),
  A(P([[13, 12], [17, 8], [18.6, 11.8], [14.6, 13.4]])),
  D(line(7, 21.5, 8.5, 17) + ' ' + line(17, 21.5, 18, 16.5), 1),
];
const HEART = 'M12 21 C6 16.5 2.5 13 2.5 8.8 C2.5 5.8 4.8 3.5 7.6 3.5 C9.5 3.5 11 4.6 12 6.2 C13 4.6 14.5 3.5 16.4 3.5 C19.2 3.5 21.5 5.8 21.5 8.8 C21.5 13 18 16.5 12 21 Z';
const STONE = (dx) => [B(P([[13 + dx, 9], [17.5 + dx, 7], [21.5 + dx, 10], [21 + dx, 18], [15.5 + dx, 19.5], [12.5 + dx, 16]])), D(line(15.5 + dx, 11, 17.5 + dx, 14) + ' ' + line(17.5 + dx, 14, 19.5 + dx, 13), 1)];
const DIE = [
  B(P([[12, 2.5], [20.5, 7], [20.5, 17], [12, 21.5], [3.5, 17], [3.5, 7]])),
  D(line(12, 11.5, 12, 21.5) + ' ' + line(12, 11.5, 3.5, 7) + ' ' + line(12, 11.5, 20.5, 7), 1.2),
  Df(circ(9.45, 13.15, 1.25) + ' ' + circ(6.05, 15.35, 1.25)),
  Df(circ(14.13, 17.88, 1.2) + ' ' + circ(16.25, 14.25, 1.2) + ' ' + circ(18.38, 10.63, 1.2)),
  A(ell(12, 7, 1.7, 1)),
];
const PERSON = [B(circ(9, 7, 3.6)), B('M2 21.5 C2 15.8 5 12.8 9 12.8 C13 12.8 16 15.8 16 21.5 Z')];
const SHIELD = 'M12 2 L20.5 5 L20.5 11 C20.5 16 17 19.8 12 22 C7 19.8 3.5 16 3.5 11 L3.5 5 Z';
const shieldAt = (s, x, y) => ({ tf: SMALL(s, x, y) });

// ---------- the icons ----------
const ICONS = {
  // actions
  attack: ['red', 'Melee attack: a clean sword, blade up to the right, with a red flash.', [...sword(3.4, 20.6, 20.8, 3.2), L, A(star(6.2, 6.2, 4.4, 1.4, 4, -90))]],
  ranged: ['red', 'Ranged attack: a bow with a red arrow on the string.', [Bs('M9 2.8 Q20.5 12 9 21.2', 2.6), Bs(line(9, 2.8, 9, 21.2), 1.2), As(line(3, 12, 18.5, 12), 2), A(head(22, 12, 0)), As('M2.8 9.4 L5.4 12 L2.8 14.6', 1.8)]],
  range: ['red', 'Range: a red arrow flying past distance marks.', [Bs(line(8, 6.5, 8, 17.5) + ' ' + line(11.5, 6.5, 11.5, 17.5) + ' ' + line(15, 6.5, 15, 17.5), 2.2), L, As(line(2.6, 12, 18, 12), 2.2), A(head(22, 12, 0, 4.6, 3.4)), As('M2.6 9 L5 12 L2.6 15', 1.8)]],
  targets: ['red', 'Target count: three red crosshairs.', [...reticle(12, 6.6, 3, As, B), ...reticle(6.4, 16.8, 3, As, B), ...reticle(17.6, 16.8, 3, As, B)]],
  move: [null, 'Move: two footprints.', [B(ell(7.6, 13.2, 2.8, 3.7)), B(circ(7.9, 19.4, 2)), B(ell(16.4, 6.2, 2.8, 3.7)), B(circ(16.7, 12.4, 2))]],
  jump: ['gold', 'Jump: a boot over a gold arc and a step.', [B(P([[13, 21.5], [13, 16], [21.5, 16], [21.5, 21.5]])), As('M2.6 20.5 Q5 8.5 11 6.6', 2), B(boot(11.6, 2.6, 0.9))]],
  fly: ['gold', 'Fly: a boot with a gold wing.', [B(boot(2.5, 9.2, 1.22)), L, A('M8.6 10.6 C10 5 15 2.5 21.5 2.5 C20.6 4.4 19 5.5 17 6 C19 6.2 20 6.8 20.6 7.6 C18.2 8.6 16.2 9.1 14.6 9.1 C15.5 9.7 16 10.4 16 11.1 C13.2 12 10.6 12 8.6 10.6 Z')]],
  heal: ['green', 'Heal: a green cross above an open hand.', [A(plus(11, 7.6, 9.6, 3.6)), A(star(19.4, 4.4, 2.3, 0.7, 4)), B('M2 17.4 L6 15.4 C8 14.6 10 14.9 12 15.7 L15 15.9 C16.3 15.9 16.3 17.6 15 17.6 L11.5 17.6 L16 17.7 L20 15.5 C21.2 14.9 22.3 16.3 21.2 17.2 L16.5 20.6 C15.6 21.3 14.6 21.5 13.5 21.5 L2 21.5 Z')]],
  shield: ['gold', 'Shield: a navy shield, its left half gold.', [B(SHIELD), A('M12 4.7 L12 19.3 C8.3 17.5 6 14.6 6 11 L6 6.6 Z')]],
  retaliate: ['red', 'Retaliate: a shield that strikes back with a red burst.', [B(SHIELD, shieldAt(0.62, 7.6, 11.6)), D('M12 4.7 L12 19.3', 1.6, shieldAt(0.62, 7.6, 11.6)), L, A(star(15.2, 13.6, 3.8, 1.6, 7)), As(line(16, 12.4, 19.8, 6.6), 2), A(head(21.8, 3.6, -56, 4.2, 2.8))]],
  push: ['gold', 'Push: an open hand, gold arrows away from it and a stone.', [B('M2.5 21 L2.5 12 C2.5 10.5 3.2 9 4.2 8 L4.2 4.4 C4.2 3.2 5.9 3.2 5.9 4.4 L5.9 7.8 L6 3.6 C6 2.4 7.7 2.4 7.7 3.6 L7.7 8.4 C8.6 8.6 9 9.4 8.8 10.4 L7.8 15 L7.8 21 Z'), As('M10 7.8 L12.2 12 L10 16.2', 2), ...STONE(0.4)]],
  pull: ['green', 'Pull: a hook draws a stone near, green arrows towards the hook.', [B(P([[2.5, 9], [7, 7], [11, 10], [10.5, 18], [5, 19.5], [2, 16]])), D(line(5, 11, 7, 14) + ' ' + line(7, 14, 9, 13), 1), As('M14.4 7.8 L12.2 12 L14.4 16.2', 2), Bs('M19 3.5 L19 14.5 C19 17.5 16.5 18.6 15.6 16.6', 2.6), B(circ(19, 3.6, 1.7))]],
  pierce: ['red', 'Pierce: a red arrow straight through a plate.', [B(rr(9.6, 3, 4, 18, 1)), D('M11.6 5 L11.6 8.5 M11.6 15.5 L11.6 19', 1), L, As(line(2.6, 12, 18, 12), 2.2), A(head(22, 12, 0, 4.6, 3.4)), As('M2.6 9 L5 12 L2.6 15', 1.8)]],
  area: ['red', 'Area: three hexes, the hit one red.', [B(hex(8.4, 8.4, 4.1)), B(hex(15.6, 8.4, 4.1)), L, A(hex(12, 14.6, 4.1))]],
  loot: ['gold', 'Loot: a sack tied with gold and a gold gem on it.', [B('M8 9 L16 9 C20 12 21 16 20 19 C19.4 21 17.5 22 15 22 L9 22 C6.5 22 4.6 21 4 19 C3 16 4 12 8 9 Z'), B(P([[8.6, 7.6], [7, 3.4], [12, 4.9], [17, 3.4], [15.4, 7.6]])), A(rr(7.4, 7.2, 9.2, 2.4, 1.2)), A(P([[12, 12.4], [15, 15.6], [12, 19.4], [9, 15.6]]))]],
  provoke: ['red', 'Provoke: a war horn with red shout lines.', [B('M2.5 10 L11 5.5 C13 4.5 14 5 14 7 L14 17 C14 19 13 19.5 11 18.5 L2.5 14 Z'), As('M17 8.6 Q19 12 17 15.4', 1.9), As('M19.6 6.4 Q22.4 12 19.6 17.6', 1.9)]],
  infuse: ['teal', 'Infuse: a teal orb sending arrows outwards.', [Ao(circ(12, 12, 4.6)), ...[45, 135, 225, 315].map((a) => B(head(...onC(12, 12, 10.4, a), a, 3.6, 2.6))), ...[45, 135, 225, 315].map((a) => Bs(line(...onC(12, 12, 6.2, a), ...onC(12, 12, 8, a)), 1.8))]],
  consume: ['teal', 'Consume: a teal orb drawing four arrows in.', [Ao(circ(12, 12, 4.6)), ...[0, 90, 180, 270].map((a) => B(head(...onC(12, 12, 6.3, a), a + 180, 3.6, 2.8))), ...[0, 90, 180, 270].map((a) => Bs(line(...onC(12, 12, 9.8, a), ...onC(12, 12, 8.6, a)), 1.8))]],
  summon: ['teal', 'Summon: a figure rising on a teal disc.', [A(ell(12, 19, 9.4, 2.7)), L, B(circ(12, 6.4, 3)), B('M7 18.6 C7 13.4 9 10.8 12 10.8 C15 10.8 17 13.4 17 18.6 Z')]],
  teleport: ['teal', 'Teleport: an arrow from one teal portal to another.', [As(ell(5.4, 12, 2.6, 7.4), 2), As(ell(18.6, 12, 2.6, 7.4), 2), L, Bs(line(7, 12, 14, 12), 2.4), B(head(17, 12, 0, 4, 3))]],
  special: ['gold', 'Special: a scroll with a gold seal.', [B(rr(6, 5, 12, 14, 0.5)), B(rr(4, 3, 16, 3.6, 1.8)), B(rr(4, 17.4, 16, 3.6, 1.8)), D(line(8.4, 9.4, 15.6, 9.4) + ' ' + line(8.4, 12.4, 13, 12.4), 1.2), A(circ(15.6, 14.6, 2.1))]],

  // marks
  initiative: ['gold', 'Initiative: a stopwatch with a gold hand.', [B(rr(10.2, 1.8, 3.6, 2.8, 0.8)), Bs(line(18.3, 6.2, 19.6, 4.9), 2.2), B(circ(12, 13.6, 8.2)), D(line(12, 6.8, 12, 8.2) + ' ' + line(12, 19, 12, 20.4) + ' ' + line(5.2, 13.6, 6.6, 13.6) + ' ' + line(17.4, 13.6, 18.8, 13.6), 1.2), As(line(12, 13.6, 15, 9.4), 2), A(circ(12, 13.6, 1.5))]],
  loss: ['red', 'Card loss: a card falling into a red flame.', [B(P([[4.4, 4.4], [11.6, 2.4], [14, 11.2], [6.8, 13.2]])), D(P([[6, 5.6], [10.6, 4.4], [12.4, 10], [7.8, 11.2]]), 1), L, A('M12 22 C7.8 22 5.6 19.6 6.4 16.8 C6.9 15.3 7.9 14.6 8.4 13.4 C9.4 14.6 9.9 15.6 10.2 16.6 C11 15.2 12.4 13.8 12.9 12 C15 13.8 17.9 16.4 17.5 19.2 C17.2 21 15 22 12 22 Z'), As(line(18.6, 3, 18.6, 7.6), 2), A(head(18.6, 10.6, 90, 3.6, 2.8))]],
  xp: ['gold', 'Experience: a medal with a star and ribbons.', [A(P([[8.6, 12.6], [5.6, 21.4], [8.6, 20], [10.6, 22], [12.4, 15.4]])), A(P([[15.4, 12.6], [18.4, 21.4], [15.4, 20], [13.4, 22], [11.6, 15.4]])), L, A(circ(12, 9, 6.6)), B(circ(12, 9, 4.8)), A(star(12, 9.3, 3.2, 1.3))]],
  momentum: ['gold', 'Momentum: a gold lightning bolt.', [Ao(P([[14.5, 2], [5.5, 13.5], [11.5, 13.5], [9.5, 22], [18.5, 10], [12.5, 10]]))]],
  active: ['gold', 'Active card: two arrows chasing each other in a circle.', [Bs(arc(12, 12, 7.6, 195, 320), 2.4), Bs(arc(12, 12, 7.6, 15, 140), 2.4), A(head(...onC(12, 12, 7.6, 338), 70, 4.2, 3.2)), A(head(...onC(12, 12, 7.6, 158), 250, 4.2, 3.2))]],
  bless: ['gold', 'Bless: a gold halo with rays.', [As(ell(12, 12, 6.6, 2.6), 2.2), Bs(line(12, 2.6, 12, 6) + ' ' + line(6.4, 4.2, 8.2, 7) + ' ' + line(17.6, 4.2, 15.8, 7) + ' ' + line(12, 18, 12, 21.4) + ' ' + line(6.4, 19.8, 8.2, 17) + ' ' + line(17.6, 19.8, 15.8, 17) + ' ' + line(1.8, 12, 3.6, 12) + ' ' + line(20.4, 12, 22.2, 12), 1.9)]],
  curse: ['red', 'Curse: a dark crescent moon with red thorns.', [B(crescent(11, 12.6, 9, 15.6, 8.6, 7)), A([200, 245, 290, 150].map((a) => { const [x, y] = onC(11, 12.6, 9, a); return star(x, y, 2.4, 0.8, 4, a); }).join(' '))]],

  // conditions
  poison: ['green', 'Poison: a tipped flask spilling green drops.', [B(circ(8, 8, 4.6)), B(P([[10.2, 10.8], [14.6, 13.4], [13.4, 15.4], [9, 12.8]])), D(arc(8, 8, 2.8, 200, 280), 1.1), A(drop(16.6, 19.2, 2.3)), A(drop(20.4, 14, 1.5))]],
  wound: ['red', 'Wound: a plaster with a red lightning scratch.', [B(rr(2.6, 8.4, 18.8, 7.2, 3.6), { tf: 'rotate(-35 12 12)' }), Df(rr(8.8, 9.4, 6.4, 5.2, 1), { tf: 'rotate(-35 12 12)' }), Df(circ(5.6, 12, 0.7) + ' ' + circ(18.4, 12, 0.7), { tf: 'rotate(-35 12 12)' }), A(P([[13.2, 8.6], [10, 12.6], [12, 12.6], [10.8, 15.6], [14, 11.4], [12, 11.4]]))]],
  immobilize: ['gold', 'Immobilize: a boot chained to a post.', [B(rr(18, 6.4, 3.2, 13, 1)), B(circ(19.6, 5.6, 2)), B(rr(16.6, 19.4, 6, 2.2, 0.8)), B(boot(2, 8.6, 1.1)), L, As(ell(9.8, 13.6, 1.7, 1.05) + ' ' + ell(13, 13.6, 1.7, 1.05) + ' ' + ell(16.2, 13.6, 1.7, 1.05), 1.4)]],
  disarm: ['red', 'Disarm: a sword dropping from an open hand, red arrow down.', [B('M2 6.6 C4 3.6 8 2.6 11 3.6 L16 4.6 C17.2 4.9 17 6.3 15.8 6.3 L12 6.1 L13.5 7.6 C14 8.4 13 9.1 12.2 8.6 L9.5 7.1 C7 6.7 4.5 7.6 2.5 9.1 Z'), ...sword(5.4, 11.6, 16.8, 21.4, 2.8), L, As(line(20, 4, 20, 10), 2), A(head(20, 13.4, 90, 3.8, 2.9))]],
  stun: ['gold', 'Stun: a helmet with gold stars circling it.', [Bs(ell(12, 6.2, 9.4, 3), 1.2), L, B('M6 12 C6 7 8.7 4.6 12 4.6 C15.3 4.6 18 7 18 12 L18 19 C18 20.6 17 21.6 15.5 21.6 L13.4 21.6 L13.4 16 L10.6 16 L10.6 21.6 L8.5 21.6 C7 21.6 6 20.6 6 19 Z'), D(line(8.2, 12.4, 15.8, 12.4), 1.6), L, A(star(3.4, 6.6, 2.4, 0.95) + ' ' + star(20.6, 5.4, 2.4, 0.95) + ' ' + star(12, 2.6, 2, 0.8))]],
  muddle: ['red', 'Muddle: an eye tangled in red loops.', [B('M2 12 C5.5 6.6 18.5 6.6 22 12 C18.5 17.4 5.5 17.4 2 12 Z'), Df(circ(12, 12, 3.2)), B(circ(12, 12, 1.6)), L, As(ell(12, 12, 9, 3.8), 1.4, { tf: 'rotate(35 12 12)' }), As(ell(12, 12, 9, 3.8), 1.4, { tf: 'rotate(-35 12 12)' })]],
  invisible: [null, 'Invisible: a hooded figure, its right half only a dashed outline.', [B('M12 2.6 C9 2.6 7 6 7.5 10.4 C5 12 3 15.4 3 21.4 L12 21.4 Z'), D('M9.6 9.4 C9.6 6.8 10.6 5.4 12 5.4', 1.2), Bs('M12 2.6 C15 2.6 17 6 16.5 10.4 C19 12 21 15.4 21 21.4 L12 21.4', 1.5, { dash: '2 1.6' })]],
  strengthen: ['green', 'Strengthen: a flexed arm with green chevrons up.', [B('M3 20.6 L3 13 C3 9 5 6 8 4.5 L10.5 3.5 C11.8 3 12.8 4.2 12.2 5.4 L11 7.5 L9 8.5 L8.5 11 C10 9.6 12.5 9.5 14.5 10.5 C17.5 11.5 19 14.5 18.5 17.5 L18 20.6 Z'), As('M15.2 6.6 L18.2 3.6 L21.2 6.6', 2.2), As('M15.2 10.6 L18.2 7.6 L21.2 10.6', 2.2)]],

  // elements
  fire: ['red', 'Fire: a red flame.', fire],
  ice: ['teal', 'Ice: a teal snowflake.', ice],
  air: ['teal', 'Air: teal gusts of wind.', air],
  earth: ['gold', 'Earth: two rocks with gold tops.', earth],
  light: ['gold', 'Light: a gold sun with rays.', [Ao(circ(12, 12, 4.8)), Bs([0, 45, 90, 135, 180, 225, 270, 315].map((a) => line(...onC(12, 12, 7.4, a), ...onC(12, 12, 9.8, a))).join(' '), 2)]],
  dark: ['gold', 'Dark: a navy moon with a thin gold crescent edge.', [B(circ(11, 12, 7.6)), A(crescent(13.4, 12, 9, 11, 12, 8.6))]],
  any: ['teal', 'Any element: a six-pointed star with a teal heart.', [B(star(12, 12, 10, 5.6, 6)), A(circ(12, 12, 3))]],
  'orb-fire': ['red', 'Fire orb: the flame inside a ring.', [Bs(circ(12, 12, 9.4), 2), ...fire.map((s) => ({ ...s, tf: ORB }))]],
  'orb-earth': ['gold', 'Earth orb: the rocks inside a ring.', [Bs(circ(12, 12, 9.4), 2), ...earth.map((s) => ({ ...s, tf: ORB }))]],
  'orb-air': ['teal', 'Air orb: the gusts inside a ring.', [Bs(circ(12, 12, 9.4), 2), ...air.map((s) => ({ ...s, tf: ORB }))]],

  // world
  door: ['gold', 'Door: an arched door with a gold handle.', [B('M5 22 L5 10 C5 5.5 8 3 12 3 C16 3 19 5.5 19 10 L19 22 Z'), D(line(9.6, 6.6, 9.6, 22) + ' ' + line(14.4, 6.6, 14.4, 22), 1.1), A(circ(16.6, 14, 1.4))]],
  trap: ['red', 'Trap: the toothed jaws of a trap on a red plate.', [B('M4 17 L4 12 C4 9 6 7.5 8 7 L9 10 L10.5 7 L12 10 L13.5 7 L15 10 L16 7 C18 7.5 20 9 20 12 L20 17 Z'), Df(rr(6.4, 12, 11.2, 3.2, 1.2)), L, B(rr(2.5, 17, 19, 4.4, 1.6)), A(rr(9, 17.8, 6, 2.8, 1))]],
  chest: ['gold', 'Chest: a navy chest with gold straps and a lock.', [B('M3 10 L3 8 C3 4.6 5 3 8 3 L16 3 C19 3 21 4.6 21 8 L21 10 Z'), B(rr(3, 11, 18, 10.6, 1.2)), A(rr(6, 3.3, 1.8, 18.2, 0.4) + ' ' + rr(16.2, 3.3, 1.8, 18.2, 0.4)), A(rr(2.6, 9.6, 18.8, 2, 0.6)), L, A(rr(9.8, 8.6, 4.4, 5.4, 1)), Df(circ(12, 10.6, 0.8) + ' ' + rr(11.6, 10.8, 0.8, 1.8, 0.3))]],
  coin: ['gold', 'Coin: one gold coin.', [Ao(circ(12, 12, 8.8)), Bs(circ(12, 12, 6), 1.3), B(star(12, 12.3, 3.3, 1.4))]],
  hp: ['red', 'Health: a red heart.', [Ao(HEART), D('M6.4 8.4 C6.4 7.2 7.2 6.4 8.4 6.4', 1.4)]],
  monster: ['red', 'Monster: a horned head with red eyes.', [B('M6 10 C4 8 3 5 3.5 2.5 C5.5 4 7 5.5 8 7 C9.3 6.3 10.6 6 12 6 C13.4 6 14.7 6.3 16 7 C17 5.5 18.5 4 20.5 2.5 C21 5 20 8 18 10 C18.7 11.2 19 12.6 19 14 C19 18.4 15.9 21.5 12 21.5 C8.1 21.5 5 18.4 5 14 C5 12.6 5.3 11.2 6 10 Z'), A(P([[7.8, 12.4], [11, 13.6], [10.5, 15.2], [8.1, 14.4]]) + ' ' + P([[16.2, 12.4], [13, 13.6], [13.5, 15.2], [15.9, 14.4]])), D(line(9.6, 18.2, 14.4, 18.2), 1.3)]],
  hero: ['gold', 'Hero: a head and shoulders with a gold clasp.', [B(circ(12, 7, 4.3)), B('M3.5 22 C3.5 16 7 13 12 13 C17 13 20.5 16 20.5 22 Z'), A(circ(12, 17.4, 1.9))]],
  elite: ['gold', 'Elite: a gold crown on a navy band.', [Ao(P([[4, 16], [3, 6.8], [8, 11], [12, 3.8], [16, 11], [21, 6.8], [20, 16]])), B(rr(3.6, 16, 16.8, 4.4, 1.2))]],
  gold: ['gold', 'Gold: stacks of gold coins.', [
    ...[0, 1, 2, 3].map((i) => Ao(ell(12, 13.4 - i * 2.2, 3.8, 1.5))), L,
    ...[0, 1, 2].map((i) => Ao(ell(6.4, 20.4 - i * 2.2, 3.8, 1.5))), L,
    ...[0, 1].map((i) => Ao(ell(17.6, 20.4 - i * 2.2, 3.8, 1.5))),
  ]],
  'objective-flag': ['red', 'Objective: a red flag planted on a hill.', [B('M3 21.6 C5 17.6 8.5 16.2 12 16.2 C15.5 16.2 19 17.6 21 21.6 Z'), B(rr(10.7, 2.8, 1.9, 15, 0.9)), B(circ(11.65, 2.8, 1.3)), A('M12.6 4.2 L21 6 C19.6 8 19.6 9.6 21 11.6 L12.6 11.2 Z')]],
  escort: ['gold', 'Escort: a grown-up leading a child by the hand.', [B(circ(8, 4.6, 2.4)), B('M5 9.2 C5 8 6 7.4 8 7.4 C10 7.4 11 8 11 9.2 L11 15 L10 15 L10 21.6 L8.6 21.6 L8.6 16 L7.4 16 L7.4 21.6 L6 21.6 L6 15 L5 15 Z'), B(circ(16.6, 10.4, 1.9)), B('M14.4 14 C14.4 13.2 15.1 12.8 16.6 12.8 C18.1 12.8 18.8 13.2 18.8 14 L18.8 18 L18.1 18 L18.1 21.6 L17.1 21.6 L17.1 18.6 L16.1 18.6 L16.1 21.6 L15.1 21.6 L15.1 18 L14.4 18 Z'), Bs('M10.8 10 L14.6 14.4', 1.5), A(circ(12.9, 12.4, 1.5))]],
  'defend-point': ['gold', 'Defend the point: a tower with a gold shield on a gold ring.', [As(ell(12, 20.2, 9.6, 2.3), 1.7), L, B('M7 21 L7 7.4 L5.5 7.4 L5.5 3 L8 3 L8 4.6 L10.6 4.6 L10.6 3 L13.4 3 L13.4 4.6 L16 4.6 L16 3 L18.5 3 L18.5 7.4 L17 7.4 L17 21 Z'), Df('M10.5 21 L10.5 17.6 C10.5 16.6 11.2 16 12 16 C12.8 16 13.5 16.6 13.5 17.6 L13.5 21 Z'), Ao(SHIELD, { tf: SMALL(0.27, 12, 11) })]],
  lever: ['gold', 'Lever: a lever with a gold arrow up.', [B(rr(4, 18, 16, 3.6, 1)), B('M8.4 18 A3.6 3.6 0 0 1 15.6 18 Z'), Bs(line(12, 16, 16.8, 5.6), 2.2), B(circ(17.2, 4.6, 2.3)), L, As(line(5.6, 14.4, 5.6, 6.6), 2), A(head(5.6, 3.2, -90, 3.8, 2.9))]],

  // dice
  dice: ['gold', 'Initiative die: a navy cube with light pips.', DIE],
  reroll: ['teal', 'Reroll: a small die inside a teal circling arrow.', [Aso(arc(12, 12, 9.2, 20, 296), 2), A(head(...onC(12, 12, 9.2, 312), 42, 4.4, 3.4)), L, ...DIE.filter((s) => s.k !== 'A').map((s) => ({ ...s, tf: SMALL(0.56) })), L]],

  // interface
  hand: [null, 'Hand: a fan of three cards.', [B(rr(8, 3.6, 8, 12, 1.4), { tf: 'rotate(-22 12 20)' }), L, B(rr(8, 3.6, 8, 12, 1.4), { tf: 'rotate(22 12 20)' }), L, B(rr(8, 3, 8, 12, 1.4)), D(rr(9.8, 4.8, 4.4, 8.4, 0.6), 1)]],
  discard: ['gold', 'Discard: a card going down into a tray.', [B('M2.5 14 L6 14 L7.5 17 L16.5 17 L18 14 L21.5 14 L21.5 21.5 L2.5 21.5 Z'), B(rr(6.6, 2.4, 9.6, 12.4, 1.4), { tf: 'rotate(-8 11 9)' }), As(line(19.6, 2.8, 19.6, 7.6), 2), A(head(19.6, 10.8, 90, 3.6, 2.8))]],
  rest: ['gold', 'Rest: a tent with a gold pennant.', [B('M2 21.5 L12 4.6 L22 21.5 Z'), Df(P([[12, 11.4], [8.6, 21.5], [15.4, 21.5]])), Bs(line(12, 4.8, 12, 2), 1.2), A(P([[12.4, 1.8], [16.2, 2.8], [12.4, 3.9]]))]],
  item: ['gold', 'Item: a flask with gold liquid.', [B('M9.5 3 L14.5 3 L14.5 4.8 L13.8 4.8 L13.8 8.5 C17.3 9.5 19.5 12.5 19.5 16 C19.5 19.5 16.5 22 12 22 C7.5 22 4.5 19.5 4.5 16 C4.5 12.5 6.7 9.5 10.2 8.5 L10.2 4.8 L9.5 4.8 Z'), A('M6.4 15 C6.2 18 8.6 20.2 12 20.2 C15.4 20.2 17.8 18 17.6 15 Z'), D('M8 12.4 C8.6 11.6 9.4 11 10.4 10.7', 1.2)]],
  approach: ['red', 'Approach: chevrons running towards a red target.', [Bs('M2.6 7.6 L6.6 12 L2.6 16.4 M7.6 7.6 L11.6 12 L7.6 16.4', 2.4), As(circ(18.6, 12, 2.9), 2), A(circ(18.6, 12, 0.9))]],
  hold: [null, 'Hold: an anchor.', [Bs(circ(12, 4.6, 2), 2), Bs(line(12, 6.8, 12, 20.4), 2.4), Bs(line(8, 9.6, 16, 9.6), 2.2), Bs('M4.2 14.4 C4.6 18.6 8 21 12 21 C16 21 19.4 18.6 19.8 14.4', 2.4), B(head(4.2, 12.4, -90, 3.4, 2.4)), B(head(19.8, 12.4, -90, 3.4, 2.4))]],
  early: ['gold', 'Early: a gold sun rising over the horizon.', [Ao('M5.6 16 A6.4 6.4 0 0 1 18.4 16 Z'), B(rr(2, 16.6, 20, 2.6, 1.3)), Bs(line(12, 2.8, 12, 6) + ' ' + line(4.6, 6.4, 6.6, 8.4) + ' ' + line(19.4, 6.4, 17.4, 8.4), 2)]],
  late: ['gold', 'Late: a snail with a gold shell.', [B('M2.5 19 C3 16.5 5 15.5 7 16 L8 18 L20 18 C21.5 18 21.5 20.6 20 20.6 L4 20.6 C3 20.6 2.5 20 2.5 19 Z'), Bs(line(4.6, 16, 3.6, 12.6) + ' ' + line(6.6, 16, 7, 12.6), 1.3), Ao(circ(14, 11.4, 6.2)), Bs('M14 11.4 C15.6 11.4 15.6 13.6 14 13.6 C12 13.6 11.6 10.4 14 9.8 C17 9.2 18.2 13.4 16.2 15.4', 1.2)]],
  undo: [null, 'Undo: an arrow curving back.', [Bs('M8.4 8 L15.6 8 C18.8 8 21 10.5 21 13.5 C21 16.5 18.8 19 15.6 19 L9 19', 2.6), B(head(2.8, 8, 180, 5.2, 4.2))]],
  skip: [null, 'Skip: two triangles and a bar.', [B(P([[3, 5], [10.6, 12], [3, 19]])), B(P([[10.6, 5], [18.2, 12], [10.6, 19]])), B(rr(18.8, 5, 2.6, 14, 1))]],
  menu: [null, 'Menu: three bars.', [B(rr(3, 5, 18, 3, 1.5)), B(rr(3, 10.5, 18, 3, 1.5)), B(rr(3, 16, 18, 3, 1.5))]],
  close: [null, 'Close: a cross.', [Bs(line(5.5, 5.5, 18.5, 18.5) + ' ' + line(18.5, 5.5, 5.5, 18.5), 3.2)]],
  left: [null, 'Left: a chevron.', [Bs('M15 4.5 L7.5 12 L15 19.5', 3.2)]],
  right: [null, 'Right: a chevron.', [Bs('M9 4.5 L16.5 12 L9 19.5', 3.2)]],
  up: [null, 'Up: a chevron.', [Bs('M4.5 15 L12 7.5 L19.5 15', 3.2)]],
  down: [null, 'Down: a chevron.', [Bs('M4.5 9 L12 16.5 L19.5 9', 3.2)]],
  check: ['green', 'Check: a green tick.', [Aso('M4.4 12.6 L9.6 17.8 L19.6 6.4', 3)]],
  rotate: [null, 'Rotate: one arrow turning round.', [Bs(arc(12, 12, 7.8, 40, 305), 2.4), B(head(...onC(12, 12, 7.8, 325), 55, 4.6, 3.4))]],
  hint: ['gold', 'Hint: a lantern with gold light.', [Bs('M9 5.2 C9 1.8 15 1.8 15 5.2', 1.6), B(P([[6.6, 7.6], [8.8, 5], [15.2, 5], [17.4, 7.6]])), Ao(rr(8, 7.6, 8, 10, 1.4)), Bs(line(12, 7.6, 12, 17.6), 1.2), B(rr(6.4, 17.4, 11.2, 3.2, 1))]],
  revive: ['red', 'Revive: a red heart with a light plus.', [Ao(HEART), Df(plus(12, 11.4, 7.6, 2.6))]],
  arrow: [null, 'Arrow in text: a plain arrow to the right.', [Bs(line(3, 12, 16, 12), 2.6), B(head(21.6, 12, 0, 6.4, 5))]],
  'add-player': ['green', 'Add a player: a person and a green plus.', [...PERSON, As(line(19, 5.6, 19, 13.4) + ' ' + line(15.1, 9.5, 22.2, 9.5), 2.4)]],
  'remove-player': ['red', 'Remove a player: a person and a red minus.', [...PERSON, As(line(15.1, 9.5, 22.2, 9.5), 2.4)]],

  // menu
  play: [null, 'Play: a rounded triangle.', [B('M7 3.6 C6.2 3.1 5.4 3.6 5.4 4.6 L5.4 19.4 C5.4 20.4 6.2 20.9 7 20.4 L19.4 13 C20.2 12.5 20.2 11.5 19.4 11 Z')]],
  compass: ['gold', 'Compass: a ring with a gold north needle.', [Bs(circ(12, 12, 9.2), 2.2), B(P([[12, 19.4], [9.4, 12], [14.6, 12]])), L, A(P([[12, 4.4], [14.6, 12], [9.4, 12]])), Df(circ(12, 12, 1))]],
  map: ['gold', 'Map: a folded map with a gold cross.', [B(P([[2.5, 5], [8.5, 3], [15.5, 5], [21.5, 3], [21.5, 19], [15.5, 21], [8.5, 19], [2.5, 21]])), D(line(8.5, 3, 8.5, 19) + ' ' + line(15.5, 5, 15.5, 21), 1.1), As(line(16.6, 8.6, 20, 12) + ' ' + line(20, 8.6, 16.6, 12), 1.7)]],
  gear: [null, 'Settings: a cog.', [B(gear(12, 12, 10, 7.4, 8)), Df(circ(12, 12, 3))]],
};

// ---------- writer ----------
function attrs(s) {
  return `${s.tf ? ` transform="${s.tf}"` : ''}`;
}
function haloOf(s) {
  const dash = s.dash ? `;stroke-dasharray:${s.dash}` : '';
  switch (s.k) {
    case 'B':
    case 'A':
      return `<path${attrs(s)} d="${s.d}"/>`;
    case 'Ao':
      return `<path${attrs(s)} style="stroke-width:${f(HALO_W + OUTLINE_W)}" d="${s.d}"/>`;
    case 'Bs':
    case 'As':
      return `<path${attrs(s)} style="fill:none;stroke-width:${f(s.w + HALO_W)}${dash}" d="${s.d}"/>`;
    case 'Aso':
      return `<path${attrs(s)} style="fill:none;stroke-width:${f(s.w + OUTLINE_W + HALO_W)}" d="${s.d}"/>`;
    default:
      return '';
  }
}
function fillOf(s, acc) {
  const dash = s.dash ? `;stroke-dasharray:${s.dash}` : '';
  switch (s.k) {
    case 'B':
      return `<path${attrs(s)} style="fill:currentColor" d="${s.d}"/>`;
    case 'A':
      return `<path${attrs(s)} style="fill:${acc}" d="${s.d}"/>`;
    case 'Ao':
      return `<path${attrs(s)} style="fill:${acc};stroke:currentColor;stroke-width:${OUTLINE_W}" d="${s.d}"/>`;
    case 'Bs':
      return `<path${attrs(s)} style="fill:none;stroke:currentColor;stroke-width:${s.w}${dash}" d="${s.d}"/>`;
    case 'As':
      return `<path${attrs(s)} style="fill:none;stroke:${acc};stroke-width:${s.w}" d="${s.d}"/>`;
    case 'Aso':
      return `<path${attrs(s)} style="fill:none;stroke:currentColor;stroke-width:${f(s.w + OUTLINE_W)}" d="${s.d}"/><path${attrs(s)} style="fill:none;stroke:${acc};stroke-width:${s.w}" d="${s.d}"/>`;
    case 'D':
      return `<path${attrs(s)} style="fill:none;stroke:${HALO};stroke-width:${s.w}" d="${s.d}"/>`;
    case 'Df':
      return `<path${attrs(s)} style="fill:${HALO}" d="${s.d}"/>`;
  }
}

const tints = {};
for (const [name, [accName, desc, shapes]] of Object.entries(ICONS)) {
  if (accName) tints[name] = ACCENTS[accName];
  const acc = accName ? `var(--icon-accent,${ACCENTS[accName]})` : 'currentColor';
  const layers = [[]];
  for (const s of shapes) (s.k === 'L' ? layers.push([]) : layers.at(-1).push(s));
  const body = layers
    .filter((l) => l.length)
    .map((l) => {
      const halo = l.map(haloOf).filter(Boolean);
      const halos = halo.length ? `  <g style="fill:${HALO};stroke:${HALO};stroke-width:${HALO_W};stroke-linecap:round;stroke-linejoin:round">\n    ${halo.join('\n    ')}\n  </g>\n` : '';
      return `${halos}  <g style="stroke-linecap:round;stroke-linejoin:round">\n    ${l.map((s) => fillOf(s, acc)).join('\n    ')}\n  </g>\n`;
    })
    .join('');
  writeFileSync(join(OUT, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <!-- ${name}: ${desc} -->\n${body}</svg>\n`);
}
console.log(`${Object.keys(ICONS).length} icons written`);
console.log(JSON.stringify(tints));
