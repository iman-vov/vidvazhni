// Content types: the shape of everything in data/. The JSON files are validated against
// data/schema/*.schema.json at build time; these types mirror those schemas.
// Visible names and texts live in data/i18n/{uk,de,en}.json under the same ids.

import type { Hex } from './hex';

export type ElementId = 'fire' | 'ice' | 'air' | 'earth' | 'light' | 'dark';
/** Fork «Три стихії-сфери»: only these three exist; `air` is shown as «Вітер». */
export type OrbId = 'fire' | 'earth' | 'air';

export type ConditionId =
  | 'poison'
  | 'wound'
  | 'immobilize'
  | 'disarm'
  | 'stun'
  | 'muddle'
  | 'invisible'
  | 'strengthen';

export const NEGATIVE_CONDITIONS: readonly ConditionId[] = ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle'];

/** Who an effect lands on, relative to the figure performing it. */
export type TargetSpec =
  | 'self'
  | 'ally' // one ally (not self) within `range`
  | 'allyOrSelf'
  | 'adjacentAllies' // every adjacent ally
  | 'alliesInRadius' // every ally (and self) within `radius`
  | 'adjacentEnemies' // every adjacent enemy
  | 'enemiesInRadius' // every enemy within `radius`
  | 'summon'; // the performer's own summon (Ґудзик)

/** Area of effect, in hexes, relative to the performer and/or the chosen target hex. */
export type AreaShape =
  | { shape: 'arc'; size: 3 } // 3 adjacent hexes in an arc (melee)
  | { shape: 'line'; length: number; fromSelf: true } // straight line starting next to the performer
  | { shape: 'triangle'; size: 3 } // 3 mutually adjacent hexes, placed within range
  | { shape: 'targetAndAdjacent' } // the target hex and all hexes around it
  | { shape: 'allAdjacent' }; // every hex around the performer

/** Conditional attack bonus evaluated at the moment of attack. */
export type AttackBonusCondition =
  | 'allyAdjacentToTarget' // Пройда, Швидкий укол
  | 'targetHasNoOtherEnemyAdjacent' // Пройда, Удар у спину (target is alone from its own side)
  | 'sameTypeAdjacentToTarget'; // пацюк, вовк «Зграя»

export interface AttackBonus {
  if: AttackBonusCondition;
  attack?: number;
  advantage?: boolean;
}

/** Extra applied when the step consumes an element (base) or an orb (fork). */
export interface ConsumeBonus {
  /** `any` = player chooses; `count` = how many must be consumed (Буря стихій: 2). */
  element: ElementId | 'any';
  count?: number;
  /** Numeric fields are added to the step; `conditions` are added; `replaceConditions` swap them. */
  add?: { value?: number; range?: number; targets?: number; push?: number; pierce?: number; move?: number };
  conditions?: ConditionId[];
  replaceConditions?: ConditionId[];
  /** Extra steps performed after this one (e.g. «Щит 1 (раунд)», «Невидимість, на себе»). */
  then?: Step[];
  /** Area that the attack gains (Буря стихій). */
  area?: AreaShape;
  /** Extra target for a non-attack step (Сонячний настій: «ще одному союзнику»). */
  extraTarget?: boolean;
  /** The attack also curses its targets (Чаклун, Тінерук: «Прокляття цілі»). */
  curse?: boolean;
}

interface StepCommon {
  /** XP gained when this step is performed. */
  xp?: number;
  consume?: ConsumeBonus;
}

export type Duration = 'round' | 'scenario' | { uses: number } | 'persistent';

export type Step =
  | (StepCommon & { type: 'move'; value: number; jump?: boolean; fly?: boolean; straightLine?: boolean })
  | (StepCommon & {
      type: 'attack';
      value: number;
      range?: number; // absent = melee
      targets?: number; // default 1
      area?: AreaShape;
      pierce?: number;
      push?: number;
      pull?: number;
      conditions?: ConditionId[];
      bless?: boolean; // target ally gets bless — never on attacks; kept for symmetry with curse
      curse?: boolean;
      advantage?: boolean;
      bonuses?: AttackBonus[];
      /** Attack every enemy of the given spec instead of chosen targets (боси: «по всіх сусідніх»). */
      targetAll?: 'adjacentEnemies';
      /** Second attack in the same half may pick a different target (Подвійний кинджал is two steps). */
    })
  | (StepCommon & {
      type: 'heal';
      value: number;
      target: TargetSpec;
      range?: number;
      radius?: number;
      removeNegative?: number; // remove up to N negative conditions
      bless?: boolean;
    })
  | (StepCommon & { type: 'shield'; value: number; target: TargetSpec; duration: Duration; range?: number })
  | (StepCommon & { type: 'retaliate'; value: number; range?: number; duration: Duration })
  | (StepCommon & { type: 'provoke'; radius: number }) // «Виклик» Вартового, до кінця раунду
  | (StepCommon & {
      type: 'condition';
      condition: ConditionId;
      target: TargetSpec;
      range?: number;
      radius?: number;
    })
  | (StepCommon & { type: 'bless'; target: TargetSpec; range?: number })
  | (StepCommon & { type: 'push'; value: number; target: TargetSpec })
  | (StepCommon & { type: 'pull'; value: number; target: TargetSpec; range?: number })
  | (StepCommon & { type: 'infuse'; element: ElementId | 'any' })
  | (StepCommon & { type: 'loot'; range: number })
  | (StepCommon & { type: 'summon'; summon: string; count?: number; rank?: 'normal' | 'elite' })
  | (StepCommon & { type: 'trap'; damage: number; conditions?: ConditionId[] })
  /** Ongoing bonus kept on an active card: next N attacks/ranged attacks get it. */
  | (StepCommon & {
      type: 'active';
      uses: number;
      on: 'attack' | 'rangedAttack' | 'attacked';
      grant: { advantage?: boolean; conditions?: ConditionId[]; shield?: number; range?: number };
    })
  | (StepCommon & { type: 'teleport'; range: number })
  /** Behaviour that is not data-describable; implemented in src/rules/special/<name>.ts. */
  | (StepCommon & { type: 'special'; name: string; params?: Record<string, number | string | boolean> });

export type StepType = Step['type'];

export interface CardHalf {
  steps: Step[];
  /** Card goes to the lost pile after this half is played. */
  loss?: boolean;
  /** Card stays in the active area (round / uses / persistent effects). */
  active?: boolean;
}

/** Fork overrides for a hero card. Anything absent falls back to the base card. */
export interface CardForkOverride {
  initiative?: number;
  top?: CardHalf;
  bottom?: CardHalf;
  /** «Наснага» (single scale): the card has the lightning mark and gives 1 charge when played. */
  momentum?: boolean;
}

export interface HeroCard {
  id: string; // `<class>.<slug>`, e.g. `warden.shield-bash`
  level: number; // 1 for starting cards
  initiative: number;
  top: CardHalf;
  bottom: CardHalf;
  fork?: CardForkOverride;
}

export interface HeroClass {
  id: string; // warden, wind-archer, herbalist, rogue, elementalist, tinker
  complexity: 'simple' | 'medium' | 'complex';
  hpByLevel: number[]; // index 0 = level 1
  handSize: number;
  /** Base: the element the class perk infuses. */
  classElement: ElementId | 'any';
  /** Fork: the orb the class is associated with. */
  classOrb: OrbId | 'any';
  cards: HeroCard[];
  /** Fork «Наснага»: the class «Порив», usable at 3 charges during the hero's own turn. */
  surge: Step[];
  summon?: SummonDef;
}

export interface SummonDef {
  id: string; // `tinker.button`
  hp: number;
  move: number;
  attack: number;
  range?: number;
}

export interface MonsterStats {
  hp: number;
  move: number;
  attack: number;
  range?: number;
  shield?: number;
  retaliate?: number;
  /** Conditions every attack applies. */
  onAttack?: ConditionId[];
  flying?: boolean;
}

export type MonsterTrait =
  | { trait: 'advantageIfSameTypeAdjacentToTarget' } // пацюк
  | { trait: 'rangedAttacksAgainstHaveDisadvantage' } // привид
  | { trait: 'maxSummonsPerFigure'; value: number } // культист
  | { trait: 'immune'; conditions: ConditionId[] }; // боси

export interface MonsterType {
  id: string;
  deck: string; // behaviour deck id (template), e.g. `melee`
  initiativeOffset: number;
  normal: MonsterStats;
  elite: MonsterStats;
  traits?: MonsterTrait[];
  /** Fork «Три можливі наміри»: up to 2 own conditional cards added to the template deck. */
  forkCards?: MonsterCard[];
  model?: string;
}

/** A condition that selects which branch of a conditional monster card is used. */
export type MonsterCardCondition = 'selfHpAtMostHalf' | 'twoOrMoreHeroesAdjacent';

export interface MonsterCard {
  id: string; // `<deck>.<initiative>` or `<monster>.<slug>`
  initiative: number;
  shuffle?: boolean; // ⟳
  /** Steps use values relative to the monster's base stats: move/attack/range are deltas. */
  steps: Step[];
  /** Conditional card (Rove-style): `if` holds → `steps`, else → `otherwise`. */
  if?: MonsterCardCondition;
  otherwise?: Step[];
}

export interface BehaviourDeck {
  id: string; // melee, guard, archer, caster, ghost, boss.miller, boss.shadowhand
  cards: MonsterCard[];
}

export interface BossType {
  id: string;
  /** Health = hpPerHero × heroes + hpPerHeroPerLevel × heroes × (level − 1). */
  hpPerHero: number;
  hpPerHeroPerLevel: number;
  move: number;
  attack: number;
  range?: number;
  shield?: number;
  deck: string;
  immune: ConditionId[];
  /** Named phases implemented in src/rules/special/ (Тінерук: друга фаза ≤ 50%). */
  special?: string[];
}

export type Terrain = 'normal' | 'difficult' | 'hazardous' | 'water';

export interface RoomDef {
  id: string; // `s1.cellar`
  hexes: Hex[];
  /** Thin walls between two adjacent hexes. Map edges are walls automatically. */
  walls?: [Hex, Hex][];
  obstacles?: { hex: Hex; model?: string }[];
  terrain?: { hex: Hex; terrain: Terrain }[];
  traps?: { hex: Hex; damage?: number; conditions?: ConditionId[] }[];
  doors?: { hex: Hex; to: string; key?: string }[];
  /** `by` = rank for 2/3/4 heroes; a missing key = the figure does not appear. */
  spawns?: { monster: string; hex: Hex; by: Partial<Record<'2' | '3' | '4', 'normal' | 'elite'>> }[];
  coins?: Hex[];
  /** `loot`: what opening the chest gives (a story item, coins, or a shop item). */
  chests?: { hex: Hex; id: string; loot?: { coins?: number; item?: string; questItem?: string } }[];
  /** Named objects (важіль, жаровня, руни) handled by scenario specials. */
  objects?: { hex: Hex; id: string; kind: string }[];
}

export type ScenarioGoal =
  | { type: 'killAll' }
  | { type: 'reachExit'; hexes: Hex[] }
  | { type: 'killBoss'; boss: string }
  | { type: 'carryItem'; item: string; to: Hex[] };

export interface ScenarioDef {
  id: string; // s1 … s5
  number: number;
  goal: ScenarioGoal;
  startRoom: string;
  startHexes: Hex[];
  rooms: RoomDef[];
  /** Rule groups this scenario introduces (for hints): `conditions`, `elements`, … */
  introduces: string[];
  specials?: string[];
  /** Fork: orbs present at start / infused every round. */
  forkOrbs?: { atStart?: { orb: OrbId; hex?: Hex }[]; eachRound?: { orb: OrbId; source: string }[] };
  reward: { goldEach: number; items?: string[]; unlock?: string[] };
}

export type ItemSlot = 'head' | 'body' | 'legs' | 'hand' | 'twoHands' | 'small';

export interface ItemDef {
  id: string;
  slot: ItemSlot;
  price: number;
  /** 0 = in the shop from the start; N = after scenario N. */
  unlockedAfter: number;
  /** `spent` is restored by a long rest, `lost` after the scenario, `passive` is always on. */
  use: 'spent' | 'lost' | 'passive';
  effect: Step[];
  /** Replaces `effect` when the orbs fork is on (Амулет світла: no Light orb). */
  forkEffect?: Step[];
}

export interface BattleGoalDef {
  id: string;
  xp: number;
  /** Named check implemented by the engine; `params` are its thresholds. */
  check: string;
  params?: Record<string, number | string | boolean>;
}

/** Edit of the hero's attack modifier deck. Card ids: `+0` `+1` `-1` `+2` `-2` `x2` `miss`, `+1:infuse`. */
export type PerkOp =
  | { op: 'add'; card: string; count: number }
  | { op: 'remove'; card: string; count: number }
  | { op: 'replace'; from: string; to: string; count: number };

export interface PerkDef {
  id: string;
  /** How many times one hero can take it. */
  max: number;
  ops: PerkOp[];
}

export interface Content {
  heroes: Record<string, HeroClass>;
  monsters: Record<string, MonsterType>;
  bosses: Record<string, BossType>;
  decks: Record<string, BehaviourDeck>;
  scenarios: Record<string, ScenarioDef>;
  /** Filled by `loadContent()`; optional so hand-built test contents need not provide them. */
  items?: Record<string, ItemDef>;
  battleGoals?: Record<string, BattleGoalDef>;
  perks?: Record<string, PerkDef>;
}
