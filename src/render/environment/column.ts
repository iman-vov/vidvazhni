// Columns for the `pillar` obstacle, from the shared Blender kit `env-columns`
// (art/blender/env-kit/columns.py): four variants at game size (origin at the bottom centre, about
// 1.6 tall, foot a little under y = 0):
//   column-intact  weathered stone column: plinth, base, chipped and cracked shaft, capital
//   column-broken  a stump with a jagged top and fallen drums beside it
//   column-moss    a broken column overgrown with moss, a fern at its foot
//   column-wood    a timber post on a stone footing with a bracket and iron bands
// The location picks the variant: moss or broken outdoors in the forest and marsh, broken in caves
// and on the pass, wood in timber rooms and mines, the stone column in halls, towers and the forge.
// Every placement gets its own turn. Until the kit has loaded the pillar keeps its placeholder.

import * as THREE from 'three';
import type { Part } from './pieces';
import type { EdgeStyle } from './types';

export type ColumnVariant = 'column-intact' | 'column-broken' | 'column-moss' | 'column-wood';

/** Variants a location's columns take, by its edge style (picked between by the seed). */
const BY_EDGE: Record<EdgeStyle, ColumnVariant[]> = {
  forest: ['column-moss', 'column-broken', 'column-moss'],
  shore: ['column-moss', 'column-broken', 'column-moss'],
  cave: ['column-broken'],
  cliff: ['column-broken', 'column-intact'],
  stone: ['column-intact', 'column-intact', 'column-broken'],
  tower: ['column-intact'],
  forge: ['column-intact'],
  timber: ['column-wood'],
  mine: ['column-wood'],
};

export interface ColumnEnv {
  edge: EdgeStyle;
  kit(id: string): Part[] | undefined;
}

/** The column variant for a location's edge style and a seed. */
export function columnVariant(edge: EdgeStyle, seed: number): ColumnVariant {
  const list = BY_EDGE[edge] ?? BY_EDGE.stone;
  return list[Math.abs(Math.floor(seed * 7919)) % list.length]!;
}

/**
 * The parts of the `pillar` piece for a seed (a placement's position, a counter), or null when
 * the piece is not a pillar or the kit has not loaded. Geometry is the kit's: callers clone it.
 */
export function columnParts(piece: string, seed: number, env: ColumnEnv): Part[] | null {
  if (piece !== 'pillar') return null;
  const kit = env.kit(columnVariant(env.edge, seed)) ?? env.kit('column-intact');
  if (!kit) return null;
  const turn = new THREE.Matrix4().makeRotationY((Math.abs(Math.floor(seed * 104729)) % 360) * (Math.PI / 180));
  return kit.map((part) => ({ ...part, matrix: turn.clone().multiply(part.matrix) }));
}
