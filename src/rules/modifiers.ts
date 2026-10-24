// Attack modifier decks: one per hero, one shared by all monsters.

import type { PerkOp } from './content';
import { shuffle, type RngState } from './rng';
import type { ModifierDeck } from './state';

/** 20 cards: 6×+0, 5×+1, 5×−1, +2, −2, ×2, miss. */
export const BASE_MODIFIER_CARDS: readonly string[] = [
  ...Array<string>(6).fill('+0'),
  ...Array<string>(5).fill('+1'),
  ...Array<string>(5).fill('-1'),
  '+2',
  '-2',
  'x2',
  'miss',
];

export const MAX_BLESS_OR_CURSE = 10;

export function createModifierDeck(rng: RngState, extra: string[] = [], cards: readonly string[] = BASE_MODIFIER_CARDS): ModifierDeck {
  return { draw: shuffle(rng, [...cards, ...extra]), discard: [], needsShuffle: false };
}

/** The base cards after perk ops (`perks.json`), in order; a card that is not there is skipped. */
export function perkedCards(ops: PerkOp[], base: readonly string[] = BASE_MODIFIER_CARDS): string[] {
  const cards = [...base];
  const take = (card: string) => {
    const at = cards.indexOf(card);
    if (at >= 0) cards.splice(at, 1);
    return at >= 0;
  };
  for (const op of ops) {
    for (let i = 0; i < op.count; i++) {
      if (op.op === 'add') cards.push(op.card);
      else if (op.op === 'remove') take(op.card);
      else if (take(op.from)) cards.push(op.to);
    }
  }
  return cards;
}

/** Numeric part of a card id: `+1:infuse` → 1. */
function cardNumber(card: string): number {
  const n = Number(card.split(':')[0]);
  return Number.isFinite(n) ? n : 0;
}

function isDouble(card: string): boolean {
  return card === 'x2' || card === 'bless';
}

function isMiss(card: string): boolean {
  return card === 'miss' || card === 'curse';
}

/** Attack value after one modifier card. */
export function applyModifier(card: string, value: number): number {
  if (isMiss(card)) return 0;
  if (isDouble(card)) return value * 2;
  return Math.max(0, value + cardNumber(card));
}

/** Draws one card; an empty draw pile is reshuffled from the discard first. Bless and curse leave
 *  the deck when drawn; ×2 and miss mark the deck for shuffling at the end of the round. */
export function drawModifier(rng: RngState, deck: ModifierDeck): string {
  if (deck.draw.length === 0) {
    deck.draw = shuffle(rng, deck.discard);
    deck.discard = [];
  }
  const card = deck.draw.shift() ?? '+0';
  if (card !== 'bless' && card !== 'curse') deck.discard.push(card);
  if (card === 'x2' || card === 'miss') deck.needsShuffle = true;
  return card;
}

/** Draws for one attack. With advantage two are drawn and the better is used, with disadvantage
 *  the worse; advantage and disadvantage together cancel out. */
export function drawForAttack(
  rng: RngState,
  deck: ModifierDeck,
  value: number,
  advantage: boolean,
  disadvantage: boolean,
): { drawn: string[]; chosen: string } {
  const first = drawModifier(rng, deck);
  if (advantage === disadvantage) return { drawn: [first], chosen: first };
  const second = drawModifier(rng, deck);
  const a = applyModifier(first, value);
  const b = applyModifier(second, value);
  // Ties: prefer the first card (deterministic).
  const chosen = advantage ? (b > a ? second : first) : b < a ? second : first;
  return { drawn: [first, second], chosen };
}

/** Bless/curse are shuffled into the draw pile (at most 10 of each per deck). */
export function addToDeck(rng: RngState, deck: ModifierDeck, card: 'bless' | 'curse'): boolean {
  const count = deck.draw.filter((c) => c === card).length;
  if (count >= MAX_BLESS_OR_CURSE) return false;
  deck.draw.push(card);
  shuffle(rng, deck.draw);
  return true;
}

/** End of round: decks that drew ×2 or miss are shuffled back together. */
export function shuffleIfNeeded(rng: RngState, deck: ModifierDeck): boolean {
  if (!deck.needsShuffle) return false;
  deck.draw = shuffle(rng, [...deck.draw, ...deck.discard]);
  deck.discard = [];
  deck.needsShuffle = false;
  return true;
}
