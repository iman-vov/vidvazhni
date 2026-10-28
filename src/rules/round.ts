// The round: card selection, reveal, turn order, end of round, scenario goals.

import type { MonsterCard } from './content';
import { exhaust, findCard, loseScenario } from './damage';
import { activeHeroes, emit, hero, heroes, isPresent, monsters, schedule, victoryXp, type Ctx } from './effects/context';
import { decayAtEndOfRound, scenarioOrbs } from './elements';
import { onRoundStart } from './events';
import { objectSpawns } from './scenarioRules';
import { shuffleIfNeeded } from './modifiers';
import { goalReached, lostByRules, secondaryMet, tickGoalCounter } from './objectives';
import { nextInt, shuffle } from './rng';
import type { BehaviourDeckState, CardId, HeroState, InitiativeRoll, TurnEntry } from './state';
import { INITIATIVE_DIE_MAX, INITIATIVE_DIE_SIDES } from './variants';
import { openInitiativeWindow } from './diceItems';
import { cardHasX, rollX } from './dice';

// ─── Card selection ────────────────────────────────────────────────────────

/** A hero who can neither play 2 cards nor rest is exhausted. */
export function canPlayOrRest(h: HeroState): boolean {
  return h.hand.length >= 2 || h.discard.length >= 2;
}

export function selectCards(ctx: Ctx, heroId: string, cards: [CardId, CardId], leading: CardId): string | null {
  const err = selectionError(ctx, heroId);
  if (err) return err;
  const h = hero(ctx.s, heroId);
  const [a, b] = cards;
  if (a === b) return 'two different cards needed';
  if (!h.hand.includes(a) || !h.hand.includes(b)) return 'card not in hand';
  if (leading !== a && leading !== b) return 'leading card must be one of the two';
  h.selection = { kind: 'cards', cards: [a, b], leading };
  h.initiative = findCard(ctx, h, leading).initiative;
  return null;
}

export function declareLongRest(ctx: Ctx, heroId: string): string | null {
  const err = selectionError(ctx, heroId);
  if (err) return err;
  const h = hero(ctx.s, heroId);
  if (h.discard.length < 2) return 'long rest needs at least 2 discarded cards';
  h.selection = { kind: 'longRest' };
  h.initiative = 99;
  return null;
}

function selectionError(ctx: Ctx, heroId: string): string | null {
  if (ctx.s.pending?.kind !== 'selectCards') return 'not selecting cards now';
  const h = ctx.s.figures[heroId];
  if (!h || h.kind !== 'hero' || h.exhausted) return 'no such hero';
  return null;
}

export function chooseHand(ctx: Ctx, heroId: string, cards: CardId[]): string | null {
  const p = ctx.s.pending;
  if (p?.kind !== 'chooseHandBeforeScenario' || !p.heroIds.includes(heroId)) return 'not choosing a hand now';
  const h = hero(ctx.s, heroId);
  const cls = ctx.c.heroes[h.classId];
  if (!cls) return 'unknown class';
  if (new Set(cards).size !== cards.length || cards.length !== cls.handSize) return `choose ${cls.handSize} cards`;
  if (cards.some((c) => !cls.cards.some((card) => card.id === c && card.level <= Math.max(1, h.level)) || (h.cardPool && !h.cardPool.includes(c)))) {
    return 'card not available';
  }
  h.hand = [...cards];
  p.heroIds = p.heroIds.filter((id) => id !== heroId);
  if (p.heroIds.length === 0) ctx.s.pending = { kind: 'selectCards', heroIds: activeHeroes(ctx.s).map((x) => x.id) };
  return null;
}

/** When every hero has chosen, reveal and start the turns. */
export function revealIfReady(ctx: Ctx): void {
  const all = activeHeroes(ctx.s);
  if (all.some((h) => h.selection === null)) {
    if (ctx.s.pending?.kind === 'selectCards') ctx.s.pending.heroIds = all.filter((h) => !h.selection).map((h) => h.id);
    return;
  }
  for (const h of all) {
    if (h.selection?.kind === 'cards') {
      const [a, b] = h.selection.cards;
      h.hand = h.hand.filter((c) => c !== a && c !== b);
    }
  }
  for (const typeId of typesOnBoard(ctx)) drawBehaviour(ctx, typeId);
  returnUnusedIntents(ctx);
  rollInitiative(ctx, all, typesOnBoard(ctx));
  ctx.s.turnOrder = buildTurnOrder(ctx);
  ctx.s.turnIndex = -1;
  ctx.s.phase = 'turns';
  ctx.s.pending = null;
  // «Предмети кубика»: dice items may still change the initiative before the first turn.
  if (openInitiativeWindow(ctx)) return;
  startTurns(ctx);
}

/** The order is final: reveal it and start the first turn. */
export function startTurns(ctx: Ctx): void {
  ctx.s.turnOrder = buildTurnOrder(ctx);
  emit(ctx, { type: 'cardsRevealed', order: ctx.s.turnOrder });
  schedule(ctx, { t: 'nextTurn' });
}

// ─── Behaviour cards and turn order ────────────────────────────────────────

export function typesOnBoard(ctx: Pick<Ctx, 's'>): string[] {
  const out: string[] = [];
  for (const m of monsters(ctx.s)) if (isPresent(m) && !out.includes(m.typeId)) out.push(m.typeId);
  return out;
}

/** A card of the type's behaviour deck (template cards, or the type's own fork cards). */
export function behaviourCard(ctx: Pick<Ctx, 'c'>, typeId: string, cardId: string): MonsterCard {
  const deckId = ctx.c.monsters[typeId]?.deck ?? ctx.c.bosses[typeId]?.deck;
  const card =
    (deckId ? ctx.c.decks[deckId]?.cards.find((c) => c.id === cardId) : undefined) ??
    ctx.c.monsters[typeId]?.forkCards?.find((c) => c.id === cardId);
  if (!card) throw new Error(`unknown behaviour card ${cardId} for ${typeId}`);
  return card;
}

/** Monster initiative = card + type offset, within 1–99. */
export function monsterInitiative(ctx: Pick<Ctx, 'c'>, typeId: string, card: MonsterCard): number {
  const offset = ctx.c.monsters[typeId]?.initiativeOffset ?? 0;
  return Math.min(99, Math.max(1, card.initiative + offset));
}

/** «Кубик ініціативи»: card + die, capped so a long rest (99) stays last. */
export function rolledInitiative(card: number, roll: number): number {
  return Math.min(Math.max(card, INITIATIVE_DIE_MAX), card + roll);
}

/** «Кубик ініціативи»: one d12 per hero who played cards (a long rest does not roll), then one per
 *  monster type with a card this round, in that order. */
function rollInitiative(ctx: Ctx, heroList: HeroState[], typeIds: string[]): void {
  if (!ctx.s.variants.initiativeDie) return;
  const rolls: InitiativeRoll[] = [];
  const d = () => 1 + nextInt(ctx.s.rng, INITIATIVE_DIE_SIDES);
  for (const h of heroList) {
    if (h.selection?.kind !== 'cards' || h.initiative === null) continue;
    const card = h.initiative;
    h.initiativeCard = card;
    h.initiativeRoll = d();
    h.initiative = rolledInitiative(card, h.initiativeRoll);
    rolls.push({ kind: 'hero', id: h.id, card, roll: h.initiativeRoll, initiative: h.initiative });
  }
  for (const typeId of typeIds) {
    const deck = ctx.s.behaviourDecks[typeId];
    if (!deck?.current || deck.roll !== undefined) continue;
    const card = monsterInitiative(ctx, typeId, behaviourCard(ctx, typeId, deck.current));
    deck.roll = d();
    rolls.push({ kind: 'monsterGroup', id: typeId, card, roll: deck.roll, initiative: rolledInitiative(card, deck.roll) });
  }
  if (rolls.length > 0) emit(ctx, { type: 'initiativeRolled', rolls });
}

/** A monster type's initiative this round: its card (+ type offset), plus the die when rolled. */
export function groupInitiative(ctx: Pick<Ctx, 'c' | 's'>, typeId: string, cardId: string): number {
  const card = monsterInitiative(ctx, typeId, behaviourCard(ctx, typeId, cardId));
  const roll = ctx.s.behaviourDecks[typeId]?.roll;
  return roll === undefined ? card : rolledInitiative(card, roll);
}

/** Takes the top card of a behaviour pile; an empty pile is reshuffled from the discard first. */
function takeBehaviourCard(ctx: Ctx, deck: BehaviourDeckState): string | undefined {
  if (deck.draw.length === 0) {
    deck.draw = shuffle(ctx.s.rng, deck.discard);
    deck.discard = [];
  }
  return deck.draw.shift();
}

/** Fork «Три можливі наміри»: before card selection every monster type on the board shows 3
 *  possible behaviour cards. */
export function drawIntents(ctx: Ctx): void {
  if (!ctx.s.variants.threeIntents) return;
  for (const typeId of typesOnBoard(ctx)) {
    const deck = ctx.s.behaviourDecks[typeId];
    if (!deck || deck.current || deck.intents.length > 0) continue;
    for (let i = 0; i < 3; i++) {
      const cardId = takeBehaviourCard(ctx, deck);
      if (cardId) deck.intents.push(cardId);
    }
    emit(ctx, { type: 'intentsDrawn', typeId, cards: [...deck.intents] });
    for (const cardId of deck.intents) rollMonsterX(ctx, typeId, cardId);
  }
}

/** «Монстри з X»: a card with `x` steps rolls its X as soon as it is revealed, so the players see
 *  the exact number. One roll per card, kept until the end of the round. */
function rollMonsterX(ctx: Ctx, typeId: string, cardId: string): void {
  if (!ctx.s.variants.monsterDieAbilities) return;
  const deck = ctx.s.behaviourDecks[typeId];
  const card = behaviourCard(ctx, typeId, cardId);
  if (!deck || deck.xRolls?.[cardId] !== undefined || (!cardHasX(card.steps) && !cardHasX(card.otherwise))) return;
  const roll = rollX(ctx);
  deck.xRolls = { ...deck.xRolls, [cardId]: roll };
  emit(ctx, { type: 'monsterDieRolled', typeId, cardId, roll });
}

/** Intents of types that left the board before the reveal go back into their pile. */
function returnUnusedIntents(ctx: Ctx): void {
  for (const deck of Object.values(ctx.s.behaviourDecks)) {
    if (deck.intents.length === 0) continue;
    deck.draw = shuffle(ctx.s.rng, [...deck.draw, ...deck.intents]);
    deck.intents = [];
    delete deck.xRolls;
  }
}

/** Draws this round's card for a monster type. Fork «Три можливі наміри»: one of the three intents
 *  is picked at random, the other two go back and the pile is shuffled. */
export function drawBehaviour(ctx: Ctx, typeId: string): void {
  const deck = ctx.s.behaviourDecks[typeId];
  if (!deck || deck.current) return;
  let cardId: string | undefined;
  if (deck.intents.length > 0) {
    const [picked] = deck.intents.splice(nextInt(ctx.s.rng, deck.intents.length), 1);
    cardId = picked;
    deck.draw = shuffle(ctx.s.rng, [...deck.draw, ...deck.intents]);
    deck.intents = [];
  } else {
    cardId = takeBehaviourCard(ctx, deck);
  }
  if (!cardId) return;
  deck.current = cardId;
  // The intents that went back lose their X; the picked card keeps its roll (or rolls now).
  const kept = deck.xRolls?.[cardId];
  if (kept === undefined) delete deck.xRolls;
  else deck.xRolls = { [cardId]: kept };
  rollMonsterX(ctx, typeId, cardId);
  const card = behaviourCard(ctx, typeId, cardId);
  if (card.shuffle) deck.needsShuffle = true;
  emit(ctx, { type: 'behaviourDrawn', typeId, cardId, initiative: monsterInitiative(ctx, typeId, card) });
}

/** Sort key: initiative; on ties heroes (and their summons, right before the owner) go before
 *  monsters; heroes tie by hero list order; monster types by first appearance. */
function orderKey(ctx: Ctx, e: TurnEntry): number[] {
  const ids = Object.keys(ctx.s.figures);
  if (e.kind === 'monsterGroup') {
    const first = ids.findIndex((id) => ctx.s.figures[id]?.kind === 'monster' && (ctx.s.figures[id] as { typeId: string }).typeId === e.typeId);
    return [e.initiative, 1, first, 0];
  }
  const f = ctx.s.figures[e.figureId];
  const ownerId = f?.kind === 'summon' ? f.ownerId : e.figureId;
  return [e.initiative, 0, ids.indexOf(ownerId), e.kind === 'summon' ? 0 : 1];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function groupEntry(ctx: Ctx, typeId: string): TurnEntry | null {
  const deck = ctx.s.behaviourDecks[typeId];
  if (!deck?.current) return null;
  const roll = deck.roll === undefined ? {} : { roll: deck.roll };
  return { kind: 'monsterGroup', typeId, initiative: groupInitiative(ctx, typeId, deck.current), ...roll };
}

export function buildTurnOrder(ctx: Ctx): TurnEntry[] {
  const entries: TurnEntry[] = [];
  for (const h of activeHeroes(ctx.s)) {
    if (h.initiative === null) continue;
    const roll = h.initiativeRoll === undefined ? {} : { roll: h.initiativeRoll };
    entries.push({ kind: 'hero', figureId: h.id, initiative: h.initiative, ...roll });
    for (const f of Object.values(ctx.s.figures)) {
      if (f.kind === 'summon' && f.ownerId === h.id) entries.push({ kind: 'summon', figureId: f.id, initiative: h.initiative, ...roll });
    }
  }
  for (const f of Object.values(ctx.s.figures)) {
    if (f.kind === 'summon' && f.npc && isPresent(f)) entries.push({ kind: 'summon', figureId: f.id, initiative: f.npc.initiative });
  }
  for (const typeId of typesOnBoard(ctx)) {
    const e = groupEntry(ctx, typeId);
    if (e) entries.push(e);
  }
  return entries.sort((a, b) => compareKeys(orderKey(ctx, a), orderKey(ctx, b)));
}

/** Monster types revealed mid-round (door) draw a card and join the remaining order; a type whose
 *  initiative has already passed acts right after the current turn. */
export function addNewGroupsToOrder(ctx: Ctx): void {
  if (ctx.s.phase !== 'turns') return;
  for (const typeId of typesOnBoard(ctx)) {
    if (ctx.s.turnOrder.some((e) => e.kind === 'monsterGroup' && e.typeId === typeId)) continue;
    drawBehaviour(ctx, typeId);
    rollInitiative(ctx, [], [typeId]);
    const entry = groupEntry(ctx, typeId);
    if (!entry) continue;
    let at = ctx.s.turnIndex + 1;
    while (at < ctx.s.turnOrder.length && compareKeys(orderKey(ctx, ctx.s.turnOrder[at]!), orderKey(ctx, entry)) <= 0) at++;
    ctx.s.turnOrder.splice(at, 0, entry);
  }
}

/** Task: move to the next entry of the turn order (or end the round). */
export function nextTurn(ctx: Ctx): void {
  const s = ctx.s;
  s.turnIndex++;
  const entry = s.turnOrder[s.turnIndex];
  if (!entry) {
    schedule(ctx, { t: 'endRound' });
    return;
  }
  if (entry.kind === 'hero') {
    const h = s.figures[entry.figureId];
    if (h?.kind === 'hero' && !h.exhausted && !h.downed) schedule(ctx, { t: 'startHeroTurn', heroId: h.id });
    else {
      if (h?.kind === 'hero' && h.downed) discardSelection(ctx, h);
      schedule(ctx, { t: 'nextTurn' });
    }
  } else if (entry.kind === 'summon') {
    if (isPresent(s.figures[entry.figureId])) schedule(ctx, { t: 'figureTurn', figureId: entry.figureId });
    schedule(ctx, { t: 'nextTurn' });
  } else {
    schedule(ctx, { t: 'monsterGroup', typeId: entry.typeId }, { t: 'nextTurn' });
  }
}

/** A downed hero's turn is skipped: the selected cards not yet played go to the discard. */
export function discardSelection(ctx: Ctx, h: HeroState): void {
  if (h.selection?.kind !== 'cards') return;
  for (const cardId of h.selection.cards) {
    if (h.playedThisTurn.some((p) => p.cardId === cardId) || h.discard.includes(cardId) || h.lost.includes(cardId)) continue;
    if (h.active.some((a) => a.cardId === cardId)) continue;
    h.discard.push(cardId);
    emit(ctx, { type: 'cardMoved', heroId: h.id, cardId, to: 'discard' });
  }
  h.selection = null;
}

// ─── End of round ──────────────────────────────────────────────────────────

/** Task: elements decay, round effects end, then short rests and the next round. */
export function endRound(ctx: Ctx): void {
  const s = ctx.s;
  s.phase = 'endOfRound';
  decayAtEndOfRound(ctx);
  for (const f of Object.values(s.figures)) {
    f.shields = f.shields.filter((x) => x.until !== 'round');
    f.retaliates = f.retaliates.filter((x) => x.until !== 'round');
    if (f.kind === 'hero') {
      f.provokeRadius = null;
      delete f.surgeGrants;
      delete f.attackedDisadvantage;
      delete f.rangedAttackedDisadvantage;
      delete f.coverUsed;
      for (const a of [...f.active]) {
        if (activeEndsWithRound(ctx, f, a.cardId, a.half, a.usesLeft)) moveActiveOut(ctx, f, a.cardId);
      }
    }
  }
  schedule(ctx, { t: 'shortRests' }, { t: 'finishRound' });
}

function activeEndsWithRound(ctx: Ctx, h: HeroState, cardId: CardId, half: 'top' | 'bottom', usesLeft?: number): boolean {
  if (usesLeft !== undefined) return false;
  const steps = findCard(ctx, h, cardId)[half].steps;
  return !steps.some(
    (st) =>
      st.type === 'summon' ||
      ('duration' in st && (st.duration === 'persistent' || st.duration === 'scenario' || typeof st.duration === 'object')),
  );
}

/** An active card leaves the active area: to the lost pile if it was a loss card, else discard. */
export function moveActiveOut(ctx: Ctx, h: HeroState, cardId: CardId): void {
  const idx = h.active.findIndex((a) => a.cardId === cardId);
  const entry = h.active[idx];
  if (!entry) return;
  h.active.splice(idx, 1);
  const source = `card:${cardId}`;
  h.shields = h.shields.filter((x) => x.source !== source);
  h.retaliates = h.retaliates.filter((x) => x.source !== source);
  const to = entry.lossOnEnd ? 'lost' : 'discard';
  h[to].push(cardId);
  emit(ctx, { type: 'cardMoved', heroId: h.id, cardId, to });
}

/** Task: shuffle decks, check the goal, start the next round. */
export function finishRound(ctx: Ctx): void {
  const s = ctx.s;
  if (shuffleIfNeeded(s.rng, s.monsterDeck)) emit(ctx, { type: 'deckShuffled', deck: 'monsters' });
  for (const h of heroes(s)) {
    if (shuffleIfNeeded(s.rng, h.modifierDeck)) emit(ctx, { type: 'deckShuffled', deck: h.id });
  }
  for (const [typeId, deck] of Object.entries(s.behaviourDecks)) {
    if (deck.current) deck.discard.push(deck.current);
    deck.current = null;
    delete deck.roll;
    delete deck.xRolls;
    if (deck.needsShuffle) {
      deck.draw = shuffle(s.rng, [...deck.draw, ...deck.discard]);
      deck.discard = [];
      deck.needsShuffle = false;
      emit(ctx, { type: 'deckShuffled', deck: typeId });
    }
  }
  emit(ctx, { type: 'roundEnded', round: s.round });
  tickGoalCounter(ctx);
  if (goalReached(ctx)) return winScenario(ctx);
  if (lostByRules(ctx)) return loseScenario(ctx);
  startRound(ctx);
}

export function startRound(ctx: Ctx): void {
  const s = ctx.s;
  s.round++;
  s.turnOrder = [];
  s.turnIndex = -1;
  for (const f of Object.values(s.figures)) {
    if (f.kind === 'monster') f.attackedBy = [];
    if (f.kind !== 'hero') continue;
    f.selection = null;
    f.initiative = null;
    delete f.initiativeRoll;
    delete f.initiativeCard;
    delete f.initiativeRerolls;
    f.playedThisTurn = [];
    f.wantsShortRest = false;
  }
  for (const h of activeHeroes(s)) if (!canPlayOrRest(h)) exhaust(ctx, h, 'cards');
  if (s.phase === 'lost') return;
  s.phase = 'selectCards';
  s.pending = { kind: 'selectCards', heroIds: activeHeroes(s).map((h) => h.id) };
  emit(ctx, { type: 'roundStarted', round: s.round });
  scenarioOrbs(ctx, 'eachRound');
  onRoundStart(ctx);
  objectSpawns(ctx);
  drawIntents(ctx);
}

// ─── Scenario goals ────────────────────────────────────────────────────────

export { goalReached };

export function winScenario(ctx: Ctx): void {
  const s = ctx.s;
  s.phase = 'won';
  s.pending = null;
  s.queue = [];
  ctx.out.length = 0;
  const bonus = victoryXp(s.level);
  for (const h of heroes(s)) {
    h.xp += bonus;
    emit(ctx, { type: 'xpGained', heroId: h.id, amount: bonus });
  }
  for (const goal of ctx.c.scenarios[s.scenarioId]?.secondary ?? []) {
    if (!secondaryMet(s, goal)) continue;
    emit(ctx, { type: 'secondaryGoalMet', goalId: goal.id });
    const xp = goal.reward.xp ?? 0;
    if (xp > 0)
      for (const h of heroes(s)) {
        h.xp += xp;
        emit(ctx, { type: 'xpGained', heroId: h.id, amount: xp });
      }
  }
  emit(ctx, { type: 'scenarioWon' });
}

export { loseScenario };
