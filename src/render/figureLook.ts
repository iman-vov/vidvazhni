// How a figure looks on the board: which model it uses, how tall it stands, its colour, weapon and
// projectile. Pure data and functions (no three.js), so the table is unit-tested.

import type { Content } from '../rules/content';
import type { Figure, FigureId } from '../rules/state';

export type FigureKind = 'hero' | 'monster' | 'elite' | 'boss' | 'summon';

/** Height in world units (hex size = 1: a hex is 1.73 across the flats). A hero stands about
 *  ¾ of a hex tall, like a painted miniature on its base. */
export const DEFAULT_HEIGHT: Record<FigureKind, number> = {
  hero: 1.3,
  monster: 1.0,
  elite: 1.0,
  boss: 1.9,
  summon: 0.6,
};

/** Per-model heights. Meshy rigs every humanoid at 1.7 m, so small creatures need their own. */
export const MODEL_HEIGHT: Record<string, number> = {
  warden: 1.35,
  'wind-archer': 1.28,
  herbalist: 1.25,
  rogue: 1.22,
  elementalist: 1.3,
  tinker: 1.2,
  'tinker-button': 0.55,
  'cellar-rat': 0.62,
  gremlin: 0.82,
  thornling: 0.9,
  'grey-wolf': 0.85,
  'bandit-brute': 1.4,
  'bandit-crossbow': 1.3,
  'bog-slime': 0.7,
  'stone-sentinel': 1.5,
  'gloom-cultist': 1.3,
  'shadow-wraith': 1.25,
  'bog-miller': 1.9,
  shadowhand: 1.85,
  'night-moth': 0.9,
  'mountain-ram': 1.1,
  hammerfist: 2.0,
};

/** A piece added to a restyled model. `at` is a point in the model's bounding box: x and z from
 *  −0.5 to 0.5 across its width and depth (+z is its front), y from 0 (feet) to 1 (top); `size` is
 *  a share of its height. The piece rides the nearest bone. `mirror` adds a copy at −x. */
export interface RestyleAccessory {
  shape: 'key' | 'eye' | 'crystal' | 'heart' | 'crown';
  color: string;
  at: [number, number, number];
  size: number;
  mirror?: boolean;
  /** Lit from inside: unaffected by the board's light. */
  glow?: boolean;
  /** Rides the first bone whose name contains this (e.g. `Head`) instead of the nearest one. */
  bone?: string;
}

/** A monster without its own Meshy model yet: an existing model, recoloured and reshaped so it
 *  reads as another creature (docs/design/act3.md «Нові монстри», «Боси»). */
export interface Restyle {
  /** The existing model it is built from. */
  model: string;
  /** × that model's height on the board. */
  scale: number;
  /** × its width and depth (squat or slender), height unchanged. */
  widen?: number;
  /** The texture's brightness is redrawn through these: shadow, middle, light. */
  ramp: [string, string, string];
  /** Lower part of the body in another colour (the toad's belly), up to `below` of its height. */
  belly?: { color: string; below: number };
  /** Below 1: see-through (glass). */
  opacity?: number;
  metalness?: number;
  roughness?: number;
  /** Clips play this much slower or faster (the queen's slow wingbeat). */
  clipSpeed?: number;
  accessories?: RestyleAccessory[];
}

export const RESTYLES: Record<string, Restyle> = {
  'brass-automaton': {
    model: 'stone-sentinel',
    scale: 0.8,
    widen: 1.22,
    ramp: ['#3a2216', '#8a5a30', '#e2c27a'],
    metalness: 0.55,
    roughness: 0.42,
    accessories: [
      { shape: 'key', color: '#b08a4a', at: [0, 0.7, -0.45], size: 0.3, bone: 'Spine2' },
      { shape: 'eye', color: '#ffb040', at: [0.07, 0.92, 0.2], size: 0.06, mirror: true, glow: true, bone: 'Head' },
    ],
  },
  'marsh-hopper': {
    model: 'bog-slime',
    scale: 0.9,
    widen: 1.18,
    ramp: ['#1f2410', '#556326', '#98a048'],
    // The slime sits half sunk into its hex: 0.5 is where it meets the plate.
    belly: { color: '#e0c050', below: 0.66 },
    roughness: 0.55,
    accessories: [{ shape: 'eye', color: '#f0d040', at: [0.2, 0.92, 0.22], size: 0.24, mirror: true }],
  },
  'glass-guardian': {
    model: 'stone-sentinel',
    scale: 1.6,
    widen: 0.94,
    ramp: ['#2e5a70', '#7ab8d0', '#e8f8ff'],
    opacity: 0.78,
    metalness: 0.1,
    roughness: 0.12,
    accessories: [
      { shape: 'heart', color: '#6a62d0', at: [0, 0.66, 0.2], size: 0.13, glow: true, bone: 'Spine2' },
      { shape: 'crystal', color: '#a8d8e8', at: [0.3, 0.84, -0.05], size: 0.26, mirror: true, bone: 'Shoulder' },
    ],
  },
  'mist-queen': {
    model: 'night-moth',
    scale: 2.2,
    widen: 1.15,
    ramp: ['#5a6070', '#9aa0b0', '#e4e8f0'],
    roughness: 0.8,
    clipSpeed: 0.6,
    accessories: [{ shape: 'crown', color: '#b8b0e0', at: [0, 0.8, 0.3], size: 0.3 }],
  },
};

/** Elite monsters stand a little taller (and get a gold base). */
export const ELITE_SCALE = 1.12;

/** Weapons to attach when their model exists (from art/prompts/manifest.json `items`). */
export const WEAPONS: Record<string, string[]> = {
  warden: ['warden-shield', 'warden-sword'],
  'wind-archer': ['wind-archer-bow'],
  herbalist: ['herbalist-staff'],
  rogue: ['rogue-dagger'],
  tinker: ['tinker-wrench'],
  gremlin: ['gremlin-slingshot'],
  'bandit-brute': ['bandit-club'],
  'bandit-crossbow': ['crossbow'],
  'gloom-cultist': ['cultist-staff'],
  'bog-miller': ['flour-sack'],
};

export type ProjectileKind = 'arrow' | 'stone' | 'bolt' | 'thorn';

/** Ranged attackers and what they shoot; any attack from further than one hex uses a projectile. */
export const PROJECTILE: Record<string, ProjectileKind> = {
  'wind-archer': 'arrow',
  'bandit-crossbow': 'arrow',
  gremlin: 'stone',
  elementalist: 'bolt',
  'gloom-cultist': 'bolt',
  shadowhand: 'bolt',
  herbalist: 'thorn',
};

/** Yaw offset (radians) while the attack clip plays: Meshy's «Archery Shot» aims ~60° to the left
 *  of where the archer faces (docs/art/meshy-batch-1.md), so she turns right to shoot. The crossbow
 *  bandit's Gun_Hold stance aims ~60° to his right (the left fist's fingers, which carry the crossbow,
 *  point 62° right), so he turns left. */
export const ATTACK_YAW: Record<string, number> = {
  'wind-archer': (-60 * Math.PI) / 180,
  'bandit-crossbow': (60 * Math.PI) / 180,
};

/** Hero colour codes from the style guide; monsters are fog-grey, elites gold. */
export const HERO_COLORS: Record<string, string> = {
  warden: '#3f6fc4',
  'wind-archer': '#2c9a6a',
  herbalist: '#8aa83a',
  rogue: '#7b55b0',
  elementalist: '#e07a2a',
  tinker: '#b8743a',
};
export const MONSTER_COLOR = '#8f97a6';
export const ELITE_COLOR = '#e8b830';
export const BOSS_COLOR = '#6a4a8c';
export const SUMMON_COLOR = '#3cb8b0';

export interface FigureLook {
  /** Model id in assets/models (may not exist yet: then a placeholder standee is shown). */
  modelId: string;
  kind: FigureKind;
  height: number;
  color: string;
  /** Letter on the placeholder standee. */
  initial: string;
  /** Standee number for monsters, null otherwise. */
  number: number | null;
  weapons: string[];
  projectile: ProjectileKind;
  attackYaw: number;
  /** Flying monsters (ghosts) hover above their hex with a bob and fly instead of jumping. */
  flying: boolean;
  /** Monster type drawn as a restyled existing model (`RESTYLES`), if any. */
  restyleId?: string;
}

export function figureKind(f: Figure): FigureKind {
  if (f.kind === 'hero') return 'hero';
  if (f.kind === 'summon') return 'summon';
  return f.rank === 'normal' ? 'monster' : f.rank;
}

/** Model id for a figure: hero class, monster type (or the file name in its `model` field, which
 *  the data gives as `assets/models/<id>.glb`), summon id with `.` → `-`. */
export function modelIdOf(f: Figure, content?: Content): string {
  if (f.kind === 'hero') return f.classId;
  if (f.kind === 'summon') return f.summonId.replace(/\./g, '-');
  const restyle = RESTYLES[f.typeId];
  if (restyle) return restyle.model;
  const model = content?.monsters[f.typeId]?.model;
  return model ? model.replace(/^.*\//, '').replace(/\.glb$/, '') : f.typeId;
}

/** Height on the board for a model id and kind. */
export function figureHeight(modelId: string, kind: FigureKind): number {
  const base = MODEL_HEIGHT[modelId] ?? DEFAULT_HEIGHT[kind];
  return kind === 'elite' ? base * ELITE_SCALE : base;
}

/** Uniform scale that brings a model of `measuredHeight` (its own units, feet at 0) to `height`. */
export function modelScale(height: number, measuredHeight: number): number {
  return measuredHeight > 1e-6 ? height / measuredHeight : 1;
}

export function lookOf(f: Figure, content?: Content): FigureLook {
  const modelId = modelIdOf(f, content);
  const kind = figureKind(f);
  const restyleId = f.kind === 'monster' && RESTYLES[f.typeId] ? f.typeId : undefined;
  const color =
    kind === 'hero'
      ? (HERO_COLORS[modelId] ?? '#4a7fd0')
      : kind === 'summon'
        ? SUMMON_COLOR
        : kind === 'elite'
          ? ELITE_COLOR
          : kind === 'boss'
            ? BOSS_COLOR
            : MONSTER_COLOR;
  return {
    modelId,
    kind,
    height: figureHeight(modelId, kind) * (restyleId ? RESTYLES[restyleId]!.scale : 1),
    color,
    initial: initialOf(modelId),
    number: f.kind === 'monster' ? f.number : null,
    weapons: WEAPONS[modelId] ?? [],
    projectile: PROJECTILE[modelId] ?? 'stone',
    attackYaw: ATTACK_YAW[modelId] ?? 0,
    flying:
      f.kind === 'monster' &&
      (f.rank === 'boss' ? !!content?.bosses[f.typeId]?.flying : !!content?.monsters[f.typeId]?.[f.rank === 'normal' ? 'normal' : 'elite']?.flying),
    ...(restyleId ? { restyleId } : {}),
  };
}

function initialOf(modelId: string): string {
  const parts = modelId.split('-').filter(Boolean);
  if (parts.length > 1) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (modelId[0] ?? '?').toUpperCase();
}

/** Whether a figure id belongs to a monster (fog creatures disperse instead of dying). */
export function isFogCreature(id: FigureId): boolean {
  return id.startsWith('monster:');
}
