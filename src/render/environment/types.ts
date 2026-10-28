// The shape of data/environments/<id>.json (schema: data/schema/environments.schema.json): what
// surrounds the playable hexes of a scenario location: the ground beyond the hexes, how the map
// edge is closed (walls, thickets, reeds, rock), the props scattered outside the playable area,
// the light and the grey fog of Морок. Every built piece has a kit id (see pieces.ts), so a
// Blender art kit can later replace it one by one (see README.md in this folder).

import type { BoundaryKind, SurfaceId } from '../../rules/content';

/** Time of year outdoors: what lies on the open floor (scatter.ts). Absent = the mixed look. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** How the edge of the map is closed: walls indoors, plants and rock outdoors. */
export type EdgeStyle = 'stone' | 'tower' | 'timber' | 'forest' | 'shore' | 'cave' | 'mine' | 'cliff' | 'forge';

/** A piece id with a relative weight, for random picks. */
export type Weighted = [piece: string, weight: number];

/** A wall between rooms that fits the location: masonry indoors, fences and hedges outside. */
export type DividerStyle = 'stone' | 'brick' | 'planks' | 'palisade' | 'wattle' | 'hedge' | 'rock-ridge' | 'stone-fence' | 'reed-fence';

export interface EnvironmentDef {
  /** Location id, same as the environment concept: cellar, thorn-path, flooded-mill, watchtower, gloom-heart. */
  id: string;
  /** Scenario ids that play in this location. */
  scenarios: string[];
  /** Default edge for the whole map. */
  edge: EdgeStyle;
  /** Per-room edge, where a room differs (the mill hall has timber walls inside an outdoor yard). */
  rooms?: Record<string, { edge: EdgeStyle }>;
  /** What the straight walls between rooms are built as (default by location, index.ts DIVIDERS). */
  divider?: DividerStyle;
  ground: {
    /** Texture in assets/textures (name without size and extension). */
    texture?: string;
    /** Multiplied over the texture; darker than the hexes, so the board reads on top of it. */
    tint: string;
    /** World units per texture repeat. Default 2.6. */
    scale?: number;
    /** Share of the ground outside the walls that is under shallow water (0..1). */
    water?: number;
    waterColor?: string;
    /** Whether that water flows (drifts from the entrance, e.g. a mill race or a stream) or stands
     *  still and only shimmers. Default still. */
    waterFlow?: 'still' | 'flowing';
  };
  /** Blender kits (model ids `env-<location>`) this location borrows pieces from, after its own. */
  kits?: string[];
  /** Default look of the hexes (a room's `surface` in the scenario data wins). */
  surface?: SurfaceId;
  /** Default look of thin walls between rooms (a room's `boundary` wins). Default: masonry for
   *  stone, tower and timber edges, thicket in the forest, reeds on the shore, rock piles in caves. */
  boundary?: BoundaryKind;

  walls?: {
    /** Full wall height (back and side walls). Default 1.6. */
    height?: number;
    /** Height of walls between the camera and the board (cut away). Default 0.3. */
    low?: number;
    /** Every n-th full wall segment is the alternative piece (an arch, a window, a crystal seam). 0 = never. */
    alt?: number;
    /** Colour of the thin walls between rooms (drawn by the tile layer). */
    inner?: string;
    /** A piece hung on the inner face of every n-th full wall segment (a torch in a bracket). */
    sconce?: { piece: string; every: number };
  };
  /** Season of the outdoor rooms: fallen leaves in autumn, green tufts and flowers in summer,
   *  snow patches and bare twigs in winter (scatter.ts). Absent = the mixed look. */
  season?: Season;
  /** Colours of the procedural materials (see PALETTE_DEFAULTS in pieces.ts). */
  palette?: Record<string, string>;
  light: {
    sky: string;
    ground: string;
    hemi: number;
    sun: string;
    sunIntensity: number;
    /** Strength of the image-based light on metal (scene.environmentIntensity). Default 0.45. */
    env?: number;
    /** Point lights at the candles, torches and lanterns among the props (count by quality). */
    point?: { color: string; intensity: number; distance: number };
  };
  fog: {
    /** What the ground fades into far from the board (also the background). */
    color: string;
    /** Fog colour toward the top of the screen (dusk sky behind the trees); default = color. */
    glow?: string;
    /** Distance from the playable hexes where fading starts and where it is complete. */
    start: number;
    end: number;
    /** Colour and opacity of the drifting Морок wisps (medium and high only). */
    morok: string;
    morokOpacity: number;
  };
  /** Particles carried across the whole location by the wind: blowing snow on the pass, dust in a
   *  mine, sparks rising in a forge. `count` is for high quality (medium 60 %, low 30 %). */
  weather?: { kind: 'snow' | 'dust' | 'sparks'; count: number; color: string; wind: [x: number, z: number] };
  /** Piece placed outside the entrance next to the start hexes (stairs up to the tavern), or null. */
  entrance?: string | null;
  /** Piece placed beyond the exit hexes of a reach-exit goal (the forester's hut), or null. */
  exit?: string | null;
  /** Big pieces that belong to a room: placed just beyond its far edge (the mill wheel by the mill hall). */
  landmarks?: { piece: string; room: string }[];
  /**
   * Which prop model (assets/models/<model>/, from Meshy) shows a piece or a board thing once the
   * model exists: keys are dressing piece ids (`barrel`, `sacks`), scenario obstacle models
   * (`table`), object looks (`brazier-lit`, `lever-down`, `rune`) and the tile things `chest`,
   * `door`, `trap`. Missing models fall back to the procedural piece. A plain string is the model id.
   */
  propModels?: Record<string, string | PropModelSpec>;
  /** Per scenario on top of `propModels`: the same location dressed for one map (Glass Town's
   *  glassware in place of the kits' barrels and crates), the other maps of the location unchanged. */
  byScenario?: Record<string, { propModels?: Record<string, string | PropModelSpec> }>;
  /** Set pieces that stand on scenario obstacles of a model (`barrel`), picked per hex by a seeded
   *  random so neighbouring obstacles differ: barrels here, a table there, a stack of crates. */
  obstacles?: Record<string, string[]>;
  dressing: {
    /** Props on the non-playable strip between the hexes and the edge (against the walls). */
    ring: Weighted[];
    /** Props beyond the edge (trees outdoors; nothing behind solid walls). */
    outside?: Weighted[];
    /** Big dark silhouettes far out, half in the fog. */
    far?: Weighted[];
    /** 0..1, multiplied by the quality's share. Default 0.6. */
    density?: number;
    /** Pieces that always stand in the ring (at every quality), spread apart along the far and side
     *  walls before the random dressing: a pair of braziers, a lantern. */
    anchors?: Weighted[];
    /** Groups placed instead of single ring props: a few barrels together, a crate on a crate, a
     *  sack leaning on a barrel. Corners first; each instance turned, sized and nudged a little. */
    sets?: DressingSet[];
  };
}

/** A group of pieces against a wall. Frame: x along the wall, z out from it toward the board,
 *  origin a little in front of the wall face. */
export interface DressingSet {
  weight: number;
  items: {
    piece: string;
    x: number;
    z: number;
    /** Index of an earlier item this one stands on (its height lifts this one). */
    on?: number;
    /** Lean in radians (a sack against a barrel). */
    tilt?: number;
    /** Keep the turn along the wall (racks, shelves), only a little jitter. */
    align?: boolean;
  }[];
}

/** A prop model standing in for a piece: which model, how tall (world units, before the
 *  placement's own scale; default the piece's height) and an extra turn (degrees) for a state such
 *  as a pulled lever. */
export interface PropModelSpec {
  model: string;
  height?: number;
  rotY?: number;
  /** Copies piled on one another (a stack of crates from one crate model); `height` is the pile's. */
  stack?: number;
}
