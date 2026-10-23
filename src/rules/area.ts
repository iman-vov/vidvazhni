// Area-of-effect shapes. Pure hex math: the caller filters out hexes that do not exist or are
// out of sight.
//
// `direction` (0–5, any integer is taken mod 6) indexes DIRECTIONS in hex.ts and rotates the shape:
// - arc: the performer's neighbours in directions d, d+1, d+2 (anchor ignored).
// - line: `length` hexes in a straight line from the performer in direction d (anchor ignored).
// - triangle: the anchor plus its neighbours in directions d and d+1 (3 mutually adjacent hexes);
//   the six rotations are the six triangles containing the anchor.
// - targetAndAdjacent: the anchor and its six neighbours (direction ignored).
// - allAdjacent: the performer's six neighbours (anchor and direction ignored).

import type { AreaShape } from './content';
import { DIRECTIONS, add, neighbors, type Hex } from './hex';

function dir(d: number): Hex {
  return DIRECTIONS[((d % 6) + 6) % 6]!;
}

export function areaHexes(shape: AreaShape, performer: Hex, anchor: Hex, direction: number): Hex[] {
  switch (shape.shape) {
    case 'arc':
      return [0, 1, 2].map((i) => add(performer, dir(direction + i)));
    case 'line': {
      const out: Hex[] = [];
      let h = performer;
      for (let i = 0; i < shape.length; i++) {
        h = add(h, dir(direction));
        out.push(h);
      }
      return out;
    }
    case 'triangle':
      return [anchor, add(anchor, dir(direction)), add(anchor, dir(direction + 1))];
    case 'targetAndAdjacent':
      return [anchor, ...neighbors(anchor)];
    case 'allAdjacent':
      return neighbors(performer);
  }
}

/** Shapes placed around the performer; the others are placed on a target hex within range. */
export function isFromSelf(shape: AreaShape): boolean {
  return shape.shape === 'arc' || shape.shape === 'line' || shape.shape === 'allAdjacent';
}
