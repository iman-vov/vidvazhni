// Axial hex coordinates (q, r) for flat-top hexes. Pure math, no rendering.

export type Hex = [q: number, r: number];
export type HexKey = string;

export const DIRECTIONS: readonly Hex[] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function hexKey([q, r]: Hex): HexKey {
  return `${q},${r}`;
}

export function parseHexKey(key: HexKey): Hex {
  const [q, r] = key.split(',').map(Number);
  return [q ?? 0, r ?? 0];
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function neighbors([q, r]: Hex): Hex[] {
  return DIRECTIONS.map(([dq, dr]) => [q + dq, r + dr] as Hex);
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return distance(a, b) === 1;
}

export function distance(a: Hex, b: Hex): number {
  const dq = a[0] - b[0];
  const dr = a[1] - b[1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function add(a: Hex, b: Hex): Hex {
  return [a[0] + b[0], a[1] + b[1]];
}

/** All hexes within `radius` of `center`, including the center. */
export function hexesInRadius(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      out.push([center[0] + dq, center[1] + dr]);
    }
  }
  return out;
}
