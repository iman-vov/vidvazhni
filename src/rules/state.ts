// Game state, actions and events. The state is plain JSON (no Maps, Sets or classes), so it can be
// saved to IndexedDB, sent over the network and rebuilt from seed + action log.

import type { ConditionId, ElementId, OrbId, Step, TargetSpec } from './content';
import type { Hex, HexKey } from './hex';
import type { RngState } from './rng';
import type { Variants } from './variants';

export type FigureId = string; // `hero:warden`, `monster:cellar-rat:3`, `summon:tinker.button`
export type CardId = string;

/** A condition on a figure. `expiresAfterTurn` = the figure's own turn counter after which it ends;
 *  absent = until healed (poison, wound). */
export interface ConditionState {
  expiresAfterTurn?: number;
}

export interface ShieldEffect {
  value: number;
  source: string;
  until: 'round' | 'scenario' | { uses: number };
}

export interface FigureBase {
  id: FigureId;
  hex: Hex;
  hp: number;
  maxHp: number;
  conditions: Partial<Record<ConditionId, ConditionState>>;
  shields: ShieldEffect[];
  retaliates: { value: number; range: number; source: string; until: 'round' | 'scenario' | { uses: number } }[];
  /** Incremented each time the figure starts a turn; used for condition expiry. */
  turnCount: number;
}

export interface ModifierDeck {
  /** Card ids: `+0` `+1` `-1` `+2` `-2` `x2` `miss` `bless` `curse`, plus perk cards like `+1:infuse`. */
  draw: string[];
  discard: string[];
  needsShuffle: boolean;
}

export interface ActiveCard {
  cardId: CardId;
  half: 'top' | 'bottom';
  usesLeft?: number;
  /** Goes to `lost` instead of `discard` when it leaves the active area. */
  lossOnEnd: boolean;
}

export type CardSelection =
  | { kind: 'cards'; cards: [CardId, CardId]; leading: CardId }
  | { kind: 'longRest' };

export interface HeroState extends FigureBase {
  kind: 'hero';
  classId: string;
  playerId: string;
  level: number;
  hand: CardId[];
  discard: CardId[];
  lost: CardId[];
  active: ActiveCard[];
  selection: CardSelection | null;
  initiative: number | null;
  xp: number; // gained in this scenario
  coins: number; // picked up in this scenario
  modifierDeck: ModifierDeck;
  exhausted: boolean;
  /** Fork «Підняти друга». */
  downed: boolean;
  revived: boolean;
  /** Fork «Наснага»: 0–3 charges. */
  momentum: number;
  /** Ids of halves already played this turn, to enforce top + bottom of different cards. */
  playedThisTurn: { cardId: CardId; half: 'top' | 'bottom' }[];
  /** Short rest declared for end of round. */
  wantsShortRest: boolean;
  /** «Виклик» Вартового: radius until the end of the round; absent/null = not provoking. */
  provokeRadius?: number | null;
  /** Chest ids (scenario items) looted in this scenario. */
  chests?: string[];
  /** Story items the hero carries (a chest's `loot.questItem`, a key dropped by a monster, a
   *  carried item picked up again). A key opens its door for the whole party. */
  questItems?: string[];
  /** Items the hero carries into the scenario (absent = none). */
  items?: HeroItemState[];
  /** Fork «Наснага»: ongoing bonuses granted by the class Порив (its `active` steps), until used
   *  up or the end of the round. */
  surgeGrants?: SurgeGrant[];
  /** Item «Шкіряний шолом»: the next attack against this hero this round has disadvantage. */
  attackedDisadvantage?: boolean;
}

/** One carried item: `ready` can be used, `spent` comes back with a long rest, `lost` is gone
 *  for the scenario. Passive items stay `ready` and always apply. */
export interface HeroItemState {
  id: string;
  state: 'ready' | 'spent' | 'lost';
}

export interface SurgeGrant {
  on: 'attack' | 'rangedAttack' | 'attacked';
  usesLeft: number;
  grant: { advantage?: boolean; conditions?: ConditionId[]; shield?: number; range?: number };
}

export interface MonsterState extends FigureBase {
  kind: 'monster';
  typeId: string; // monster type or boss id
  rank: 'normal' | 'elite' | 'boss';
  number: number; // standee number, decides order inside a group
  /** Summoned this round: does not act until next round. */
  summonedRound?: number;
  /** Heroes that attacked this monster this round (fork «Підхоплення»). */
  attackedBy: FigureId[];
  /** The monster that summoned this one (культист: max summons per figure). */
  summonerId?: FigureId;
  /** The room the monster appeared in; set only where the room drops a story item. */
  room?: string;
  /** Boss phase (Тінерук: 2 from ≤ 50% health for the rest of the scenario); absent = 1. */
  bossPhase?: number;
}

export interface SummonState extends FigureBase {
  kind: 'summon';
  ownerId: FigureId;
  summonId: string;
  move: number;
  attack: number;
  range?: number;
}

export type Figure = HeroState | MonsterState | SummonState;

export interface Tile {
  room: string;
  terrain: 'normal' | 'difficult' | 'hazardous' | 'water';
  obstacle?: boolean;
  trap?: { damage: number; conditions: ConditionId[] };
  door?: { to: string; open: boolean; key?: string };
  coins?: number;
  chest?: string;
  object?: { id: string; kind: string; state?: string };
  /** Story items lying on the hex (a key dropped by a monster, a carried item dropped by an
   *  exhausted hero); picked up like loot. */
  questItems?: string[];
}

export interface BoardState {
  /** Only hexes of rooms that are revealed. */
  tiles: Record<HexKey, Tile>;
  /** Thin walls as `"q,r|q,r"` with the smaller key first. */
  walls: string[];
  revealedRooms: string[];
}

export interface BehaviourDeckState {
  draw: string[];
  discard: string[];
  /** The card revealed this round. */
  current: string | null;
  /** Fork «Три можливі наміри»: the three candidates shown during card selection. */
  intents: string[];
  needsShuffle: boolean;
}

export type ElementLevel = 'inert' | 'waning' | 'strong';

export interface OrbState {
  /** The figure the orb floats above, or a scenario source (`scenario`, `millstones`, …). */
  ownerId: FigureId;
  /** Scenario orbs placed on a hex instead of above a figure. */
  hex?: Hex;
  /** 0 = created this round, 1 = dimmed; extinguished at the end of the round when already 1. */
  age: 0 | 1;
}

/** One entry of the round's turn order. Monster types act as a group. */
export type TurnEntry =
  | { kind: 'hero'; figureId: FigureId; initiative: number }
  | { kind: 'summon'; figureId: FigureId; initiative: number }
  | { kind: 'monsterGroup'; typeId: string; initiative: number };

export type Phase = 'selectCards' | 'turns' | 'endOfRound' | 'won' | 'lost';

/** What the engine waits for. `null` while monster turns are resolving automatically. */
export type Pending =
  | { kind: 'selectCards'; heroIds: FigureId[] }
  | { kind: 'heroTurn'; heroId: FigureId }
  /** A step that needs a choice from the player (move destination, targets, element…). */
  | { kind: 'stepChoice'; heroId: FigureId; step: Step; stepIndex: number }
  | { kind: 'avoidDamage'; heroId: FigureId; amount: number; source: FigureId | 'trap' | 'hazard' | 'condition' }
  | { kind: 'endOfRound'; heroIds: FigureId[] } // short rest decisions
  | { kind: 'longRestLoss'; heroId: FigureId }
  | { kind: 'shortRestReroll'; heroId: FigureId; lostCard: CardId }
  | { kind: 'chooseHandBeforeScenario'; heroIds: FigureId[] }
  /** Тінерук «Згасання»: the hero loses 1 random discarded card or takes `damage`. */
  | { kind: 'fadeOut'; heroId: FigureId; damage: number; sourceId: FigureId };

export interface HalfInProgress {
  heroId: FigureId;
  cardId: CardId | 'basic';
  half: 'top' | 'bottom';
  steps: Step[];
  stepIndex: number;
  /** True once anything random happened (modifier drawn, room opened): undo stops here. */
  committed: boolean;
  /** Played as the basic action (top Атака 2 / bottom Рух 2); `cardId` is the card spent on it. */
  basic?: boolean;
  /** Fork «Наснага»: the class Порив played on its own (`cardId` = `surge`); no card moves. */
  surge?: boolean;
  /** Fork «Наснага»: steps `[from, to)` of this half were put in by a Порив used during it. */
  surgeRange?: [number, number];
}

export interface GameState {
  version: 1;
  scenarioId: string;
  level: number;
  difficulty: 'easy' | 'normal' | 'hard';
  variants: Variants;
  rng: RngState;
  round: number;
  phase: Phase;
  pending: Pending | null;
  figures: Record<FigureId, Figure>;
  board: BoardState;
  elements: Record<ElementId, ElementLevel>;
  /** Base rules: elements infused this turn become strong at the end of the turn. */
  pendingInfusions: ElementId[];
  /** Fork «Три стихії-сфери». */
  orbs: Partial<Record<OrbId, OrbState>>;
  monsterDeck: ModifierDeck;
  behaviourDecks: Record<string, BehaviourDeckState>;
  turnOrder: TurnEntry[];
  turnIndex: number;
  half: HalfInProgress | null;
  /** Every event so far. (Fork «Наснага»: a Порив used during a half puts its steps in front of
   *  the half's current step; used between halves it is played as a half of its own.) */
  log: GameEvent[];
  /** Engine work still to do (monster turns, damage awaiting «уникнути шкоди», …). Engine-internal;
   *  absent = empty. Lets every interruption resume deterministically from plain JSON. */
  queue?: EngineTask[];
  /** Snapshot taken when the current half started; `undo` restores it. Null once something random
   *  happened (modifier drawn, room revealed) or the turn ended. */
  undoPoint?: GameState | null;
}

/** Resolved numbers of one attack against one target (after card, item and consume bonuses). */
export interface AttackSpec {
  /** Attack value before poison, modifier and shield. */
  value: number;
  ranged: boolean;
  pierce: number;
  push: number;
  pull: number;
  conditions: ConditionId[];
  curse: boolean;
  advantage: boolean;
  disadvantage: boolean;
  /** Fork «Підхоплення»: the attack got the follow-up bonus (already in `value`). */
  followUp?: boolean;
}

/** Engine-internal unit of work, processed front to back by turn.ts. */
export type EngineTask =
  | { t: 'nextTurn' }
  | { t: 'startHeroTurn'; heroId: FigureId }
  | { t: 'heroReady'; heroId: FigureId }
  | { t: 'monsterGroup'; typeId: string }
  | { t: 'figureTurn'; figureId: FigureId }
  | { t: 'figureAct'; figureId: FigureId }
  | { t: 'figureStep'; figureId: FigureId; step: Step; targets: FigureId[] }
  | { t: 'endFigureTurn'; figureId: FigureId }
  | { t: 'move'; figureId: FigureId; path: Hex[]; jump?: boolean; fly?: boolean; forced?: 'push' | 'pull' }
  | { t: 'attackTarget'; attackerId: FigureId; targetId: FigureId; spec: AttackSpec; pushPath?: Hex[] }
  | { t: 'afterHit'; attackerId: FigureId; targetId: FigureId; spec: AttackSpec; pushPath?: Hex[] }
  | { t: 'retaliate'; attackerId: FigureId; targetId: FigureId }
  | { t: 'damage'; targetId: FigureId; amount: number; source: string; avoidable: boolean; conditions?: ConditionId[] }
  | { t: 'stepDone' }
  | { t: 'endRound' }
  /** `heroIds` = heroes still to decide; absent until the offer is made. */
  | { t: 'shortRests'; heroIds?: FigureId[] }
  | { t: 'finishRound' }
  /** Тінерук «Згасання»: `heroIds` = heroes still to choose; absent until it starts. */
  | { t: 'fadeOut'; sourceId: FigureId; damage: number; heroIds?: FigureId[] };

// ─── Actions ────────────────────────────────────────────────────────────────

/** A choice for the current step. Which fields are needed depends on the step type. */
export interface StepChoice {
  path?: Hex[]; // move: hexes stepped through, without the start hex
  targets?: FigureId[]; // attack, heal, condition, push/pull (ally choice)
  hex?: Hex; // trap, summon, teleport, area anchor
  direction?: number; // area rotation (0–5)
  element?: ElementId; // `any` infuse/consume
  consume?: boolean; // use the step's consume bonus
  pushPaths?: Record<FigureId, Hex[]>; // push/pull destinations per target
  elements?: ElementId[]; // consume of `count` > 1 `any` elements (Буря стихій)
}

export type Action =
  | { type: 'selectCards'; heroId: FigureId; cards: [CardId, CardId]; leading: CardId }
  | { type: 'declareLongRest'; heroId: FigureId }
  | { type: 'chooseHand'; heroId: FigureId; cards: CardId[] }
  | { type: 'startHalf'; heroId: FigureId; cardId: CardId; half: 'top' | 'bottom'; basic?: boolean }
  | { type: 'resolveStep'; choice: StepChoice }
  | { type: 'skipStep' }
  | { type: 'endTurn'; heroId: FigureId }
  | { type: 'longRestLoss'; heroId: FigureId; cardId: CardId }
  | { type: 'shortRest'; heroId: FigureId; rest: boolean }
  | { type: 'shortRestReroll'; heroId: FigureId; reroll: boolean }
  | { type: 'avoidDamage'; heroId: FigureId; choice: { kind: 'take' } | { kind: 'loseHand'; cardId: CardId } | { kind: 'loseDiscard'; cardIds: [CardId, CardId] } }
  /** Fork «Наснага»: use the class Порив now (3 charges, own turn). */
  | { type: 'surge'; heroId: FigureId }
  /** Fork «Підняти друга»: spend the top or bottom action of a card to raise an adjacent downed ally. */
  | { type: 'reviveAlly'; heroId: FigureId; cardId: CardId; half: 'top' | 'bottom'; targetId: FigureId }
  /** Uses a carried item during the hero's own turn; an attack or move bonus applies to the pending step. */
  | { type: 'useItem'; heroId: FigureId; itemId: string }
  /** Spends the top or bottom action of a selected card on a scenario object next to the hero
   *  (s3: top action lowers the sluice lever; s5: bottom action lights a brazier). */
  | { type: 'interact'; heroId: FigureId; cardId: CardId; half: 'top' | 'bottom'; objectId: string }
  /** Answer to Тінерук's «Згасання». */
  | { type: 'fadeOut'; heroId: FigureId; choice: 'loseCard' | 'damage' }
  | { type: 'undo' };

// ─── Events ────────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'roundStarted'; round: number }
  | { type: 'intentsDrawn'; typeId: string; cards: string[] }
  | { type: 'cardsRevealed'; order: TurnEntry[] }
  | { type: 'turnStarted'; figureId: FigureId }
  | { type: 'turnEnded'; figureId: FigureId }
  | { type: 'moved'; figureId: FigureId; path: Hex[]; jump?: boolean; fly?: boolean }
  | { type: 'pushed'; figureId: FigureId; path: Hex[]; pull?: boolean }
  | {
      type: 'attacked';
      attackerId: FigureId;
      targetId: FigureId;
      base: number;
      modifiers: string[]; // drawn modifier cards (2 with advantage/disadvantage)
      chosen: string;
      shield: number;
      damage: number;
      followUp?: boolean;
    }
  | { type: 'damaged'; figureId: FigureId; amount: number; source: string }
  | { type: 'healed'; figureId: FigureId; amount: number; removed: ConditionId[] }
  | { type: 'conditionAdded'; figureId: FigureId; condition: ConditionId }
  | { type: 'conditionRemoved'; figureId: FigureId; condition: ConditionId }
  | { type: 'shieldAdded'; figureId: FigureId; value: number }
  | { type: 'retaliated'; figureId: FigureId; targetId: FigureId; damage: number }
  | { type: 'elementChanged'; element: ElementId; level: ElementLevel }
  | { type: 'orbInfused'; orb: OrbId; ownerId: FigureId }
  | { type: 'orbConsumed'; orb: OrbId; byId: FigureId; fromId: FigureId }
  | { type: 'orbDimmed'; orb: OrbId }
  | { type: 'orbExpired'; orb: OrbId }
  | { type: 'roomRevealed'; roomId: string }
  | { type: 'figureSpawned'; figureId: FigureId }
  | { type: 'figureDied'; figureId: FigureId }
  | { type: 'heroExhausted'; heroId: FigureId; reason: 'damage' | 'cards' }
  | { type: 'heroDowned'; heroId: FigureId }
  | { type: 'heroRevived'; heroId: FigureId; byId: FigureId }
  | { type: 'momentumGained'; heroId: FigureId; charges: number }
  | { type: 'surgeUsed'; heroId: FigureId }
  | { type: 'looted'; heroId: FigureId; coins: number; chest?: string; questItems?: string[] }
  | { type: 'trapTriggered'; figureId: FigureId; damage: number }
  | { type: 'cardMoved'; heroId: FigureId; cardId: CardId; to: 'hand' | 'discard' | 'lost' | 'active' }
  | { type: 'rested'; heroId: FigureId; kind: 'short' | 'long'; lost: CardId }
  | { type: 'xpGained'; heroId: FigureId; amount: number }
  | { type: 'deckShuffled'; deck: string }
  | { type: 'scenarioWon' }
  | { type: 'scenarioLost' }
  | { type: 'behaviourDrawn'; typeId: string; cardId: string; initiative: number }
  | { type: 'damageAvoided'; heroId: FigureId; amount: number; lost: CardId[] }
  | { type: 'trapPlaced'; hex: Hex }
  | { type: 'roundEnded'; round: number }
  | { type: 'itemUsed'; heroId: FigureId; itemId: string; to: 'spent' | 'lost' }
  | { type: 'itemsRefreshed'; heroId: FigureId; itemIds: string[] }
  | { type: 'undone' }
  /** A scenario object changed state (lever `down`, brazier `lit` / `unlit`); `byId` = who did it. */
  | { type: 'objectChanged'; objectId: string; hex: Hex; state: string; byId?: FigureId }
  /** A story item fell on a hex: dropped by the last monster of a room, or by an exhausted carrier. */
  | { type: 'questItemDropped'; item: string; hex: Hex; byId: FigureId }
  | { type: 'bossPhaseChanged'; figureId: FigureId; phase: number }
  /** Тінерук «Згасання»: the hero lost a random discarded card (`lost`) or took the damage. */
  | { type: 'fadeOutResolved'; heroId: FigureId; lost?: CardId };

// ─── Engine API (implemented in engine.ts) ─────────────────────────────────

export interface GameSetup {
  scenarioId: string;
  seed: number;
  /** `items`: ids from `content.items` the hero carries (scenario data gives none yet). */
  heroes: { classId: string; playerId: string; level: number; perks?: string[]; items?: string[] }[];
  difficulty: 'easy' | 'normal' | 'hard';
  variants: Variants;
}

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };

export type { TargetSpec, HexKey };
