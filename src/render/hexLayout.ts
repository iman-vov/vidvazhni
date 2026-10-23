// Hex <-> world conversion for the renderer. Flat-top hexes, axial coordinates (q, r).
// The board lies in the XZ plane with Y up; +X is screen-right, +Z points toward the camera.
// See https://www.redblobgames.com/grids/hexagons/ for the formulas.

/** Distance from a hex centre to any of its corners, in world units. */
export const HEX_SIZE = 1;

const SQRT3 = Math.sqrt(3);

export interface WorldXZ {
  x: number;
  z: number;
}

export function hexToWorld(q: number, r: number, size = HEX_SIZE): WorldXZ {
  return {
    x: size * 1.5 * q,
    z: size * SQRT3 * (r + q / 2),
  };
}

/** Nearest hex to a world point (fractional axial rounded via cube coordinates). */
export function worldToHex(x: number, z: number, size = HEX_SIZE): [number, number] {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * z) / size;
  return axialRound(q, r);
}

export function axialRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Normalise -0 so keys and comparisons stay clean.
  return [rq + 0, rr + 0];
}

/**
 * A cols x rows rectangle of flat-top hexes ("odd-q" offset layout: odd columns sit half a hex lower),
 * returned as axial coordinates.
 */
export function rectangleHexes(cols: number, rows: number): Array<[number, number]> {
  const hexes: Array<[number, number]> = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      hexes.push([col, row - Math.floor(col / 2)]);
    }
  }
  return hexes;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}
