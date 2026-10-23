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
  ownerId: FigureId;
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
  | { kind: 'chooseHandBeforeScenario'; heroIds: FigureId[] };

export interface HalfInProgress {
  heroId: FigureId;
  cardId: CardId | 'basic';
  half: 'top' | 'bottom';
  steps: Step[];
  stepIndex: number;
  /** True once anything random happened (modifier drawn, room opened): undo stops here. */
  committed: boolean;
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
  /** Fork «Наснага»: Порив used this turn adds its steps in front of the current half. */
  log: GameEvent[];
}

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
  | { type: 'looted'; heroId: FigureId; coins: number; chest?: string }
  | { type: 'trapTriggered'; figureId: FigureId; damage: number }
  | { type: 'cardMoved'; heroId: FigureId; cardId: CardId; to: 'hand' | 'discard' | 'lost' | 'active' }
  | { type: 'rested'; heroId: FigureId; kind: 'short' | 'long'; lost: CardId }
  | { type: 'xpGained'; heroId: FigureId; amount: number }
  | { type: 'deckShuffled'; deck: string }
  | { type: 'scenarioWon' }
  | { type: 'scenarioLost' };

// ─── Engine API (implemented in engine.ts) ─────────────────────────────────

export interface GameSetup {
  scenarioId: string;
  seed: number;
  heroes: { classId: string; playerId: string; level: number; perks?: string[] }[];
  difficulty: 'easy' | 'normal' | 'hard';
  variants: Variants;
}

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };

export type { TargetSpec, HexKey };
