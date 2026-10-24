// The shape of data/environments/<id>.json (schema: data/schema/environments.schema.json): what
// surrounds the playable hexes of a scenario location: the ground beyond the hexes, how the map
// edge is closed (walls, thickets, reeds, rock), the props scattered outside the playable area,
// the light and the grey fog of Морок. Every built piece has a kit id (see pieces.ts), so a
// Blender art kit can later replace it one by one (see README.md in this folder).

/** How the edge of the map is closed: walls indoors, plants and rock outdoors. */
export type EdgeStyle = 'stone' | 'tower' | 'timber' | 'forest' | 'shore' | 'cave';

/** A piece id with a relative weight, for random picks. */
export type Weighted = [piece: string, weight: number];

export interface EnvironmentDef {
  /** Location id, same as the environment concept: cellar, thorn-path, flooded-mill, watchtower, gloom-heart. */
  id: string;
  /** Scenario ids that play in this location. */
  scenarios: string[];
  /** Default edge for the whole map. */
  edge: EdgeStyle;
  /** Per-room edge, where a room differs (the mill hall has timber walls inside an outdoor yard). */
  rooms?: Record<string, { edge: EdgeStyle }>;
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
  };
  /** Texture of `normal` hexes, if it differs from the board's default for the scenario. */
  hexTexture?: string;
  walls?: {
    /** Full wall height (back and side walls). Default 1.6. */
    height?: number;
    /** Height of walls between the camera and the board (cut away). Default 0.3. */
    low?: number;
    /** Every n-th full wall segment is the alternative piece (an arch, a window, a crystal seam). 0 = never. */
    alt?: number;
    /** Colour of the thin walls between rooms (drawn by the tile layer). */
    inner?: string;
  };
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
  dressing: {
    /** Props on the non-playable strip between the hexes and the edge (against the walls). */
    ring: Weighted[];
    /** Props beyond the edge (trees outdoors; nothing behind solid walls). */
    outside?: Weighted[];
    /** Big dark silhouettes far out, half in the fog. */
    far?: Weighted[];
    /** 0..1, multiplied by the quality's share. Default 0.6. */
    density?: number;
  };
}

/** A prop model standing in for a piece: which model, how tall (world units, before the
 *  placement's own scale; default the piece's height) and an extra turn (degrees) for a state such
 *  as a pulled lever. */
export interface PropModelSpec {
  model: string;
  height?: number;
  rotY?: number;
}
