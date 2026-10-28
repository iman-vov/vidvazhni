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
  /** «Карти з X» (dice.md §3): when the step's X was rolled, consuming rolls X again and keeps the
   *  better result instead of `add.value` (Ризикований удар: Вітер). */
  xBest?: boolean;
}

interface StepCommon {
  /** XP gained when this step is performed. */
  xp?: number;
  consume?: ConsumeBonus;
  /** «Карти з X» (dice.md §3): with `dieCards` (heroes) or `monsterDieAbilities` (monsters) the
   *  value is `x` + a roll of the X die (1 1 2 2 3 4); otherwise `value`, the fixed average, is used.
   *  Monster steps keep it relative to the base stat, like `value`. */
  x?: number;
  /** Rolled X, set by the engine on the step in play (never in data). */
  xRoll?: number;
  /** Саморобний заряд: when X shows 1 the performer takes this much damage. */
  xOnOne?: { selfDamage: number };
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
  /** The class colour (art/prompts/ui/card-frames.md): portraits, frames, board tokens. */
  color: string;
  hpByLevel: number[]; // index 0 = level 1
  handSize: number;
  /** The hand offered in one tap on the hand-pick screen («Рекомендована рука»): `handSize` level-1 cards. */
  recommendedHand?: string[];
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
  /** Moves with jump (жаба-скакун). */
  jumps?: boolean;
  /** Every third round skips its card and takes Щит +2 for the round instead (мідний автомат). */
  windUp?: boolean;
  /** Melee attacks reach range 2 and pull 1 (жаба-скакун, елітна: «Липкий язик»). */
  tonguePull?: boolean;
}

export type MonsterTrait =
  | { trait: 'advantageIfSameTypeAdjacentToTarget' } // пацюк
  | { trait: 'rangedAttacksAgainstHaveDisadvantage' } // привид
  | { trait: 'maxSummonsPerFigure'; value: number } // культист
  | { trait: 'immune'; conditions: ConditionId[] }; // боси

/** What a killed (not summoned) figure may leave behind, rolled with the game's RNG
 *  (docs/design/camp.md «Звідки здобич»). */
export interface DropDef {
  /** Coins put on the figure's hex, picked up like map coins. */
  coins?: number;
  /** Chance 0–1 of the coins; none = always. */
  coinChance?: number;
  /** One item from this table goes straight to the party chest (elites, bosses, named enemies). */
  items?: string[];
  /** Chance 0–1 of an item; none = always. */
  itemChance?: number;
}

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
  drops?: { normal?: DropDef; elite?: DropDef };
}

/** A condition that selects which branch of a conditional monster card is used. */
export type MonsterCardCondition = 'selfHpAtMostHalf' | 'twoOrMoreHeroesAdjacent' | 'heroWithinTwo';

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
  flying?: boolean;
  deck: string;
  immune: ConditionId[];
  /** Named phases implemented in src/rules/special/ (Тінерук: друга фаза ≤ 50%). */
  special?: string[];
  drops?: DropDef;
}

export type Terrain = 'normal' | 'difficult' | 'hazardous' | 'water';

/** What a hex looks like underfoot (cosmetic; the rules use `Terrain`). The board draws the surface
 *  and shows difficult, hazardous and water terrain on top of it. */
export type SurfaceId = 'planks' | 'flagstones' | 'cobblestone' | 'worn-stone' | 'forest-floor' | 'grass' | 'roots' | 'mud' | 'wet-grass' | 'walkway' | 'rock';
/** How a room is closed off from its neighbours on the board (cosmetic; the rules see walls). */
export type BoundaryKind = 'walls' | 'reeds' | 'thicket' | 'rocks' | 'logs';
/** What a door between rooms looks like and how it opens (cosmetic; the rules see a door). */
export type DoorKind = 'door' | 'gate' | 'barricade' | 'brush' | 'log' | 'rubble' | 'minecart';
/** A built interior (house, mill, cellar, castle hall, mine) or open ground (marsh, forest, path,
 *  yard, cave): what the room's floor, dividers, furniture and terrain may look like. Cosmetic. */
export type RoomKind = 'indoor' | 'outdoor';

export interface RoomDef {
  id: string; // `s1.cellar`
  kind?: RoomKind;
  hexes: Hex[];
  /** Thin walls between two adjacent hexes. Map edges are walls automatically. */
  walls?: [Hex, Hex][];
  /** `breakable`: heroes break it with attacks (mining crate, rubble); `movable`: an adjacent hero
   *  spends a move step to push it aside (barricade, cart). Monsters never break or move them. */
  obstacles?: { hex: Hex; model?: string; breakable?: { hp: number }; movable?: true }[];
  terrain?: { hex: Hex; terrain: Terrain }[];
  /** Look of the room's hexes; default from the location (data/environments). Cosmetic. */
  surface?: SurfaceId;
  /** Hexes that look different from the room's surface (a walkway across mud, a rug). Cosmetic. */
  surfaces?: { hex: Hex; surface: SurfaceId }[];
  /** How the room's thin walls look: masonry indoors, reeds, thicket, rock piles or fallen logs
   *  outdoors; default from the location. Cosmetic: the rules still treat them as walls. */
  boundary?: BoundaryKind;
  traps?: { hex: Hex; damage?: number; conditions?: ConditionId[] }[];
  /** `kind`: how the door looks and opens (default from the room's boundary). Cosmetic. */
  /** `breakable` / `movable`: the door blocks like an obstacle until heroes break it (rubble in a
   *  cave) or push it aside (a barricade outdoors); then it opens and reveals the room behind. */
  doors?: { hex: Hex; to: string; key?: string; kind?: DoorKind; breakable?: { hp: number }; movable?: true }[];

  /** `by` = rank for 2/3/4 heroes; a missing key = the figure does not appear.
   *  `drops`: a named enemy's own loot, replacing its type's. `tag`: names the figure for
   *  scenario events (the horn-blower, the bell runner). */
  /** `asleep`: skips its turns until woken (sleep.ts). */
  spawns?: { monster: string; hex: Hex; by: Partial<Record<'2' | '3' | '4', 'normal' | 'elite'>>; drops?: DropDef; tag?: string; asleep?: true }[];
  coins?: Hex[];
  /** `loot`: what opening the chest gives (a story item, coins, or a shop item). */
  chests?: { hex: Hex; id: string; loot?: { coins?: number; item?: string; questItem?: string } }[];
  /** Named objects (важіль, жаровня, руни) handled by scenario specials or by their own `interact`.
   *  `state` = initial state (`unlit`, `up`); `blocks` = impassable like an obstacle (lever, brazier). */
  objects?: ObjectDef[];
  /** Story items dropped by the last figure of `monster` in this room to die (ключ від ярусу). */
  drops?: { monster: string; questItem: string }[];
}

export interface ObjectDef {
  hex: Hex;
  id: string;
  kind: string;
  state?: string;
  blocks?: boolean;
  /** Without a scenario special: an adjacent hero spends a `half` action to turn the object from
   *  `from` (default: its initial state) to `to`; the doors on `opens` open (a floor lever opening
   *  a locked door on the other side of the room). */
  interact?: { half: 'top' | 'bottom'; from?: string; to: string; opens?: Hex[] };
  /** `beamMirrors` (s19): the states an adjacent hero turns it through with a top action, in
   *  order and round again; `aim` = where it sends the beam in that state (a mirror's id, or
   *  `target` for `ScenarioDef.beam.to`), none = the beam stops here (mirrors.ts). */
  turns?: { state: string; aim?: string }[];
  /** Heroes break it like a breakable obstacle (a totem, a nest); broken, it leaves the board. */
  hp?: number;
  /** While it stands, a monster of the rank for the party size appears next to it at the start of
   *  every round. */
  spawn?: { monster: string; by: Partial<Record<'2' | '3' | '4', 'normal' | 'elite'>> };
}

/** A friendly figure without an owner (the shepherd, a freed prisoner): it appears with its room,
 *  monsters attack it like a hero's summon, and on its own turn (`initiative`, default 50) it
 *  walks up to `move` hexes towards the goal zone while a hero stands within 3 hexes of it. It
 *  never attacks. If it dies the scenario is lost. */
export interface NpcDef {
  id: string;
  hex: Hex;
  hp: number;
  move: number;
  initiative?: number;
}

/** A named group of hexes the goals point at (exit, delivery spot, a point to defend). */
export interface ZoneDef {
  id: string;
  hexes: Hex[];
}

/** Goals with a place name it by `zone` (an id in `ScenarioDef.zones`) or list its hexes inline
 *  (`hexes` / `to`, the map editor's form); `goalZone` resolves either. */
export type ScenarioGoal =
  | { type: 'killAll' }
  | { type: 'reachExit'; hexes?: Hex[]; zone?: string }
  | { type: 'killBoss'; boss: string }
  | { type: 'carryItem'; item: string; to?: Hex[]; zone?: string }
  /** Hold out until the end of round `rounds`; monsters need not be beaten. */
  | { type: 'survive'; rounds: number }
  /** Hold out `rounds` rounds; a monster standing in the zone at the end of a round loses it.
   *  With `counter` (s13's 8 fireflies) the zone holds that many lights instead: at the end of
   *  every round each monster in the zone puts out 1, and 0 loses; `counterName` is the HUD's
   *  i18n key for them (`{n}`, `{of}`). */
  | { type: 'defend'; zone: string; rounds: number; counter?: number; counterName?: string }
  /** Every hero on its feet stands in the exit zone by the end of round `rounds`; later loses
   *  (the cave-in). Monsters need not be beaten. */
  | { type: 'escape'; hexes?: Hex[]; zone?: string; rounds: number }
  /** Pick up `count` objects of `kind` (an adjacent hero spends a bottom action) and carry them into
   *  the zone: a hero ending its turn there hands over what it carries. */
  | { type: 'collect'; kind: string; count: number; to?: Hex[]; zone?: string }
  /** Bring the NPC `npc` into the zone (it walks there while a hero is near); its death loses. */
  | { type: 'escort'; npc: string; to?: Hex[]; zone?: string }
  /** Break every object of `kind` (`objects[].hp`), the ones in rooms not yet revealed too. */
  | { type: 'destroy'; kind: string }
  /** Get to the zone before the NPC `rival` (s11's frog), which runs there on its own turns
   *  whether a hero is near or not. Checked at the end of every turn: a hero there first wins
   *  (with `all`, every hero on its feet), the rival there first loses; both at once go to the
   *  heroes. The rival's death does not lose. */
  | { type: 'race'; rival: string; zone?: string; to?: Hex[]; all?: boolean }
  /** Keep the object `object` (`objects[].hp`, the Guardian's heart) standing for `rounds` rounds;
   *  broken, it loses at once. */
  | { type: 'protect'; object: string; rounds: number }
  /** Every listed object in its `state` at the end of a round (s19's mirrors); with a zone, every
   *  hero on its feet stands in it too. */
  | { type: 'objectStates'; objects: { id: string; state: string }[]; zone?: string; hexes?: Hex[] };

/** Ways to lose besides every hero exhausted (always on). `roundLimit`: the goal is not
 *  reached by the end of round `rounds` (the escape's timer). */
export type LoseRule = { type: 'roundLimit'; rounds: number };

/** Optional goal on top of the main one (docs/design/missions.md): a named check from the
 *  engine's registry (`objectives.ts`), like a battle goal, paid when the scenario is won. */
export interface SecondaryGoalDef {
  id: string;
  check: string;
  params?: Record<string, number | string | boolean>;
  /** Per hero. `unlock`: scenarios opened on a won scenario with this goal met (the key to a
   *  secret mission, s17/s18 → s19), like `ScenarioDef.reward.unlock`. */
  reward: { xp?: number; gold?: number; unlock?: string[] };
}

export interface ScenarioDef {
  id: string; // s1 … s5
  number: number;
  goal: ScenarioGoal;
  secondary?: SecondaryGoalDef[];
  zones?: ZoneDef[];
  lose?: LoseRule[];
  npcs?: NpcDef[];
  startRoom: string;
  startHexes: Hex[];
  rooms: RoomDef[];
  /** Rule groups this scenario introduces (for hints): `conditions`, `elements`, … */
  introduces: string[];
  specials?: string[];
  /** `beamMirrors` (s19): the beam enters at the window `from` towards the object `aim`; reaching
   *  `to` (the crystal door) opens the doors on `opens` (mirrors.ts). */
  beam?: { from: Hex; aim: string; to: Hex; opens?: Hex[] };
  /** Fork: orbs present at start / infused every round. */
  forkOrbs?: { atStart?: { orb: OrbId; hex?: Hex }[]; eachRound?: { orb: OrbId; source: string }[] };
  /** `closes`: the other options of a story choice (s6 or s7), dropped from the unlocked list on a win.
   *  `flags`: campaign flags set on a win (`blueprint`, `mirrors.aligned`), read by later scenarios. */
  reward: { goldEach: number; items?: string[]; unlock?: string[]; closes?: string[]; flags?: string[] };
  /** Scenario events: ambushes, calls for help, alarms, waves (events.ts). */
  events?: ScenarioEventDef[];
  /** Drafted in the map editor, not yet playtested or balanced. */
  draft?: boolean;
}

/** A scenario event (docs/design/missions.md «Події й підкріплення»): when the trigger holds, the
 *  actions run, once (a `round` trigger with `every` repeats). An event tied to a tagged monster
 *  (`monsterTurnsAlive`, `objectReached`) is prevented when the last monster with that tag dies
 *  first: then `prevented` runs instead (a reward for stopping the alarm). */
export interface ScenarioEventDef {
  id: string;
  trigger: EventTrigger;
  actions: EventAction[];
  prevented?: EventAction[];
  /** A surprise: no warning before it fires. Default: hidden for `doorOpened` and `heroEnters`
   *  (ambushes), warned in the intents and the round forecast for the rest. */
  hidden?: boolean;
}

export type EventTrigger =
  /** The room is revealed (its door opened, broken or pushed aside). */
  | { type: 'doorOpened'; room: string }
  /** A hero steps on one of `hexes`, or next to `adjacent` (a cupboard, a barrel). The move stops there. */
  | { type: 'heroEnters'; hexes?: Hex[]; adjacent?: Hex }
  /** At the start of round `round` (before the cards are chosen), then every `every` rounds. */
  | { type: 'round'; round: number; every?: number }
  /** At the end of the `turns`-th turn of a monster with `tag` (the horn-blower calls). */
  | { type: 'monsterTurnsAlive'; tag: string; turns: number }
  /** A monster with `tag` ends its turn on or next to `hex` (the bell, a door). Such a monster
   *  runs there instead of fighting. */
  | { type: 'objectReached'; tag: string; hex: Hex }
  /** The boss (`boss`, default any) drops to half its health or below (s20's second phase). */
  | { type: 'bossHalfHp'; boss?: string };

export type EventAction =
  /** `count` figures (default 1) of the rank for the party size (`by`, like room spawns) on the
   *  first free hexes of `hexes`, else the nearest free revealed hexes. `burst`: the obstacle on the
   *  first hex (barrel, cupboard) breaks open first. */
  | {
      type: 'spawn';
      monster: string;
      by: Partial<Record<'2' | '3' | '4', 'normal' | 'elite'>>;
      hexes: Hex[];
      count?: number;
      burst?: boolean;
      tag?: string;
      /** The figures sleep until woken (sleep.ts). */
      asleep?: true;
    }
  | { type: 'openDoor'; hex: Hex }
  /** A story line (i18n key) shown to the players. */
  | { type: 'story'; text: string }
  /** Coins left where the event's figure stood (the stopped bell runner's hex). */
  | { type: 'coins'; coins: number }
  /** The scenario's goal becomes `goal` (s20: kill the Guardian → protect its heart). Its rounds
   *  count from the next round, or from this one when it switches at the round's start. */
  | { type: 'setGoal'; goal: ScenarioGoal };

export type ItemSlot = 'head' | 'body' | 'legs' | 'hand' | 'twoHands' | 'small';

/** Where an item comes from (docs/design/items.md); only `shop` items are sold. */
export interface ItemSource {
  type: 'shop' | 'chest' | 'drop' | 'boss' | 'secret' | 'gift';
  /** Scenario id; the monster id for `drop`. */
  at?: string;
}

export interface ItemDef {
  id: string;
  slot: ItemSlot;
  /** Group of a small item. */
  kind?: 'potion' | 'throwable' | 'charm' | 'dice';
  rarity?: 'common' | 'rare' | 'legendary';
  price: number;
  /** 0 = in the shop from the start; N = after scenario N. */
  unlockedAfter: number;
  /** Sold only once the campaign has this story flag (`heron.saved`: Чай Чаплі, Болотяні чоботи). */
  unlockFlag?: string;
  /** Absent = `shop`. */
  source?: ItemSource;
  /** `spent` is restored by a long rest, `lost` after the scenario, `passive` is always on. */
  use: 'spent' | 'lost' | 'passive';
  effect: Step[];
  /** Replaces `effect` when the orbs fork is on (Амулет світла: no Light orb). */
  forkEffect?: Step[];
  /** The ★ version, carried as id `<id>+`: bought for `price`, its effect replaces `effect`
   *  (and `forkEffect`, which falls back to the upgraded `effect`). */
  upgrade?: { price: number; effect: Step[]; forkEffect?: Step[] };
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

/** Campaign rules (`data/campaign.json`, docs/design/camp.md). */
export interface CampaignRules {
  /** XP needed for each level; index 0 = level 1 = 0 XP. */
  xpByLevel: number[];
  startGold: number;
  /** Share of the price paid back on a sale (rounded down). */
  sellRate: number;
  /** Gold given by one tap of «Подарувати». */
  giftStep: number;
  /** Items a hero takes on a mission; a `twoHands` item fills both hands. */
  slots: { head: number; body: number; legs: number; hands: number; small: number };
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
  campaign?: CampaignRules;
}
