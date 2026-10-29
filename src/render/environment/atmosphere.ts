// How lived-in each location looks: the colour grade, warm pools of light under its flames, the
// dirt on its floor and the dressing on its walls. Pure data; decals.ts paints and places it.

import type { ColorGrade } from '../post';

/** Atlas cells of the floor decals (see decals.ts for how each one is painted). */
export type FloorDecal = 'stain' | 'crack' | 'puddle' | 'straw' | 'leaves' | 'debris' | 'slab' | 'planks' | 'moss' | 'slime' | 'soot' | 'dust' | 'roots' | 'rubble' | 'snow';
/** Atlas cells of the wall decals. */
export type WallDecal = 'damp' | 'drips' | 'cobweb' | 'tapestry' | 'window' | 'ivy' | 'crack' | 'banner' | 'slit' | 'moss' | 'watermark' | 'slime' | 'soot' | 'plaster' | 'ore' | 'frost';
/** Simple geometry added to a plain wall segment so a run is not one segment repeated. */
export type WallVariant = 'plain' | 'buttress' | 'blocks' | 'plinth' | 'beam' | 'support' | 'chains';

export interface Atmosphere {
  grade: ColorGrade;
  /** Strength of the warm pool of light on the floor under each flame (additive, 0..1). */
  pools: number;
  /** Colour of the dirt: edge grime, stains and cracks are tinted with it. */
  grime: string;
  /** Floor decals per hex (playable and the strip by the walls), and which kinds by weight. */
  floor: { density: number; kinds: [FloorDecal, number][] };
  /** Darkness of the dirt along the feet of walls (0 = none). */
  edge: number;
  /** Share of full wall segments that get a decal, and which kinds by weight. */
  walls: { share: number; kinds: [WallDecal, number][] };
  variants: [WallVariant, number][];
}

const grade = (lift: [number, number, number], gain: [number, number, number], saturation: number, contrast: number, vignette: number): ColorGrade => ({ lift, gain, saturation, contrast, vignette });

export const ATMOSPHERE: Record<string, Atmosphere> = {
  cellar: {
    grade: grade([0.025, 0.03, 0.055], [1.06, 0.99, 0.88], 1.05, 1.1, 0.5),
    pools: 0.5,
    grime: '#2a1d14',
    floor: { density: 1.1, kinds: [['stain', 3], ['crack', 2], ['puddle', 1], ['straw', 3], ['debris', 2], ['slab', 2], ['planks', 1], ['soot', 1]] },
    edge: 0.75,
    walls: { share: 0.8, kinds: [['damp', 3], ['drips', 2], ['cobweb', 3], ['tapestry', 1], ['window', 1], ['crack', 1], ['plaster', 2]] },
    variants: [['plain', 3], ['blocks', 2], ['plinth', 2], ['buttress', 1]],
  },
  'thorn-path': {
    grade: grade([0.02, 0.03, 0.06], [1.05, 1.0, 0.9], 1.0, 1.07, 0.45),
    pools: 0.45,
    grime: '#262414',
    floor: { density: 1.2, kinds: [['leaves', 4], ['roots', 2], ['debris', 2], ['moss', 2], ['stain', 1], ['puddle', 1]] },
    edge: 0.45,
    walls: { share: 0.7, kinds: [['ivy', 4], ['crack', 2], ['moss', 2], ['damp', 1]] },
    variants: [['plain', 3], ['blocks', 2], ['buttress', 1]],
  },
  'flooded-mill': {
    grade: grade([0.02, 0.035, 0.045], [0.98, 1.02, 1.02], 0.92, 1.06, 0.45),
    pools: 0.45,
    grime: '#22261c',
    floor: { density: 1.1, kinds: [['puddle', 3], ['moss', 2], ['stain', 2], ['straw', 1], ['debris', 1], ['planks', 1], ['leaves', 1]] },
    edge: 0.6,
    walls: { share: 0.85, kinds: [['moss', 3], ['watermark', 3], ['damp', 2], ['drips', 1], ['cobweb', 1]] },
    variants: [['plain', 3], ['beam', 2], ['plinth', 1]],
  },
  watchtower: {
    grade: grade([0.02, 0.025, 0.06], [1.05, 1.0, 0.94], 0.95, 1.1, 0.5),
    pools: 0.5,
    grime: '#221e1c',
    floor: { density: 1.1, kinds: [['dust', 2], ['crack', 3], ['debris', 2], ['rubble', 2], ['stain', 1], ['slab', 2], ['straw', 1]] },
    edge: 0.7,
    walls: { share: 0.8, kinds: [['ivy', 2], ['crack', 3], ['banner', 2], ['slit', 1], ['soot', 1], ['damp', 1]] },
    variants: [['plain', 3], ['buttress', 2], ['blocks', 2]],
  },
  'gloom-heart': {
    grade: grade([0.035, 0.015, 0.065], [0.95, 0.92, 1.05], 0.9, 1.12, 0.58),
    pools: 0.4,
    grime: '#1e1426',
    floor: { density: 1.1, kinds: [['slime', 3], ['crack', 2], ['debris', 2], ['puddle', 1], ['stain', 2]] },
    edge: 0.8,
    walls: { share: 0.8, kinds: [['slime', 3], ['drips', 2], ['crack', 2]] },
    variants: [['plain', 1]],
  },
  // Act II, the Grey Mountains.
  'mine-tunnel': {
    // Dark, warm-brown; light only in the lantern pools.
    grade: grade([0.012, 0.01, 0.02], [1.1, 0.98, 0.84], 0.95, 1.18, 0.62),
    pools: 0.62,
    grime: '#1e1710',
    floor: { density: 1.2, kinds: [['debris', 3], ['rubble', 2], ['stain', 2], ['dust', 2], ['crack', 1], ['planks', 1], ['puddle', 1]] },
    edge: 0.85,
    walls: { share: 0.75, kinds: [['ore', 3], ['crack', 2], ['damp', 2], ['drips', 1], ['cobweb', 1]] },
    variants: [['plain', 3], ['support', 2]],
  },
  'mountain-pass': {
    // Low, warm afternoon sun on dark rock: cold blue shadows, warm lit faces, real contrast.
    grade: grade([0.02, 0.03, 0.06], [1.1, 1.0, 0.88], 0.95, 1.2, 0.5),
    pools: 0.35,
    grime: '#2a2c34',
    floor: { density: 1.3, kinds: [['snow', 5], ['debris', 2], ['crack', 1], ['rubble', 1], ['dust', 1]] },
    edge: 0.4,
    walls: { share: 0.85, kinds: [['frost', 4], ['crack', 2]] },
    variants: [['plain', 1]],
  },
  copperdale: {
    // A grey mining village at dusk; the bandits' fire is the warm spot.
    grade: grade([0.025, 0.028, 0.045], [1.04, 0.99, 0.92], 0.9, 1.1, 0.5),
    pools: 0.5,
    grime: '#26201a',
    floor: { density: 1.2, kinds: [['stain', 3], ['puddle', 2], ['straw', 2], ['debris', 2], ['snow', 1], ['soot', 1], ['planks', 1]] },
    edge: 0.65,
    walls: { share: 0.8, kinds: [['damp', 2], ['plaster', 2], ['crack', 2], ['soot', 1], ['cobweb', 1], ['window', 1]] },
    variants: [['plain', 3], ['beam', 2], ['plinth', 1]],
  },
  'dark-depths': {
    // Deep, wet and cold: black water, a faint violet of Морок, dim lantern pools.
    grade: grade([0.01, 0.015, 0.035], [0.95, 0.98, 1.08], 0.85, 1.16, 0.62),
    pools: 0.55,
    grime: '#14161c',
    floor: { density: 1.2, kinds: [['puddle', 3], ['slime', 1], ['debris', 2], ['crack', 2], ['stain', 2], ['rubble', 1]] },
    edge: 0.85,
    walls: { share: 0.8, kinds: [['ore', 2], ['damp', 3], ['drips', 3], ['slime', 1], ['crack', 1]] },
    variants: [['plain', 3], ['support', 1]],
  },
  'glass-town': {
    // Glass Town indoors: clean pale stone in cool daylight through the windows, little dirt.
    grade: grade([0.0, 0.008, 0.02], [1.02, 1.03, 1.06], 1.06, 1.06, 0.42),
    pools: 0.32,
    grime: '#3a3834',
    floor: { density: 0.35, kinds: [['dust', 3], ['slab', 2], ['crack', 1]] },
    edge: 0.35,
    walls: { share: 0.3, kinds: [['banner', 2], ['plaster', 1], ['crack', 1]] },
    variants: [['plain', 3], ['plinth', 1], ['blocks', 1]],
  },
  'glass-heights': {
    // Open ground around Glass Town: clear cold daylight on pale rock and crystal.
    grade: grade([0.0, 0.01, 0.025], [1.0, 1.03, 1.08], 1.04, 1.08, 0.45),
    pools: 0.3,
    grime: '#30343a',
    floor: { density: 0.6, kinds: [['dust', 3], ['crack', 2], ['rubble', 1], ['slab', 1]] },
    edge: 0.45,
    walls: { share: 0.2, kinds: [['crack', 1]] },
    variants: [['plain', 1]],
  },
  'old-forge': {
    // Hot orange forge light against soot-black brick.
    grade: grade([0.03, 0.012, 0.0], [1.14, 0.96, 0.8], 1.08, 1.16, 0.58),
    pools: 0.72,
    grime: '#1a120c',
    floor: { density: 1.2, kinds: [['soot', 4], ['crack', 2], ['debris', 2], ['rubble', 2], ['stain', 2], ['slab', 1]] },
    edge: 0.85,
    walls: { share: 0.8, kinds: [['soot', 4], ['crack', 2], ['plaster', 1], ['banner', 1]] },
    variants: [['plain', 2], ['chains', 2], ['buttress', 1], ['blocks', 1]],
  },
};

const FALLBACK = ATMOSPHERE.cellar!;

export function atmosphereFor(id: string | undefined): Atmosphere {
  return (id && ATMOSPHERE[id]) || FALLBACK;
}

/** Weighted pick from `[item, weight]` pairs with a random number in [0, 1). */
export function pick<T>(list: [T, number][], r: number): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [item, w] of list) {
    x -= w;
    if (x < 0) return item;
  }
  return list[list.length - 1]![0];
}
