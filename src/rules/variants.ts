// Party settings: fork mechanics from the «Форк: свої механіки» tab, each one a separate toggle.
// All off = the rules of «Основа».

export interface Variants {
  /** Three shared orbs (Вогонь, Земля, Вітер) above their creator instead of six elements.
   *  Orbs live until the end of the next round, can be consumed from anywhere,
   *  and monsters neither create nor consume them. */
  orbs: boolean;
  /** Before card selection each monster type shows 3 possible behaviour cards; after selection
   *  one is picked at random, the other two return and the deck is shuffled.
   *  Monster decks gain the type's own conditional cards; monster health +10%. */
  threeIntents: boolean;
  /** «Підхоплення»: +1 attack against an enemy another hero already attacked this round. */
  followUp: boolean;
  /** «Наснага», single scale: lightning-marked cards add 1 charge; at 3 charges the hero may
   *  use the class «Порив» at any point of their own turn. */
  momentum: boolean;
  /** «Підняти друга»: at 0 HP a hero is knocked down instead of exhausted, once per scenario;
   *  an adjacent ally spends a top or bottom action to raise them with 3 HP. */
  reviveAlly: boolean;
  /** «Прогноз раунду»: while choosing cards the engine reports where the hero would stand
   *  in the initiative order. Engine query only; the UI shows it. */
  roundForecast: boolean;
  /** «Предмети-кнопки»: the engine reports which items can be used right now and offers
   *  attack-time prompts. Engine query only; the UI shows it. */
  itemPrompts: boolean;
}

export type VariantId = keyof Variants;

export const BASE_RULES: Readonly<Variants> = {
  orbs: false,
  threeIntents: false,
  followUp: false,
  momentum: false,
  reviveAlly: false,
  roundForecast: false,
  itemPrompts: false,
};

export const FULL_FORK: Readonly<Variants> = {
  orbs: true,
  threeIntents: true,
  followUp: true,
  momentum: true,
  reviveAlly: true,
  roundForecast: true,
  itemPrompts: true,
};

/** Order of implementation, cheapest first (from the design doc). */
export const VARIANT_ORDER: readonly VariantId[] = [
  'reviveAlly',
  'followUp',
  'orbs',
  'momentum',
  'threeIntents',
  'roundForecast',
  'itemPrompts',
];

export const MONSTER_HP_BONUS_WITH_INTENTS = 0.1;
export const MOMENTUM_MAX = 3;
export const REVIVE_HP = 3;
export const FOLLOW_UP_BONUS = 1;
