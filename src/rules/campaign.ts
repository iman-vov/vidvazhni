// Campaign between scenarios (docs/design/camp.md): heroes keep gold, XP, perks and items; the camp
// sells, upgrades (★) and equips items. Pure functions over a plain JSON state — no DOM, no engine.
// Every change returns a new state or an error (`CampaignResult`), the input is never mutated.
//
// Items: a hero owns at most one copy of an item (`owned`, with `plus` for the ★ version) and takes
// on a mission what fits the slots (`equipped`, base ids). Found items (scenario rewards, chests,
// drops) wait in the shared `partyChest`, any hero takes one for free.

import type { CampaignRules, HeroClass, ItemDef, ItemSlot, PerkDef, ScenarioDef } from './content';
import { UPGRADED } from './items';
import type { GameSetup } from './state';
import type { Variants } from './variants';

export const CAMPAIGN_VERSION = 1;

export interface OwnedItem {
  id: string;
  /** Upgraded to ★ (carried into a scenario as `<id>+`). */
  plus: boolean;
}

export interface CampaignHero {
  classId: string;
  playerId: string;
  level: number;
  xp: number;
  gold: number;
  perks: string[];
  /** Cards owned beyond the starting hand (level 2+), and the hand picked for the next mission. */
  cardPool?: string[];
  handPick?: string[];
  owned: OwnedItem[];
  /** Base ids of the owned items taken on the next mission. */
  equipped: string[];
}

export interface CampaignState {
  version: number;
  players: string[];
  heroes: CampaignHero[];
  /** Found items any hero may take; duplicates allowed. */
  partyChest: string[];
  /** Won scenario ids, in order. */
  completed: string[];
  /** Scenario ids that can be played next. */
  unlocked: string[];
  difficulty: GameSetup['difficulty'];
  /** Id of the last scenario result applied (the game's start time): guards against counting it twice. */
  lastResultId?: string;
}

/** The content the camp needs; `loadContent()` provides it. */
export interface CampaignContent {
  items: Record<string, ItemDef>;
  scenarios: Record<string, ScenarioDef>;
  campaign: CampaignRules;
  heroes: Record<string, HeroClass>;
  perks?: Record<string, PerkDef>;
}

export type CampaignResult = { ok: true; state: CampaignState } | { ok: false; error: string };

const fail = (error: string): CampaignResult => ({ ok: false, error });

export function newCampaign(
  c: CampaignContent,
  o: { players: string[]; heroes: { classId: string; playerId: string }[]; difficulty?: GameSetup['difficulty']; firstScenario?: string },
): CampaignState {
  return {
    version: CAMPAIGN_VERSION,
    players: [...o.players],
    heroes: o.heroes.map((h) => ({
      classId: h.classId,
      playerId: h.playerId,
      level: 1,
      xp: 0,
      gold: c.campaign.startGold,
      perks: [],
      owned: [],
      equipped: [],
    })),
    partyChest: [],
    completed: [],
    unlocked: [o.firstScenario ?? 's1'],
    difficulty: o.difficulty ?? 'normal',
  };
}

/** Copy of the state with one hero changed by `fn` (which may mutate the copy it gets). */
function withHero(s: CampaignState, classId: string, fn: (h: CampaignHero, next: CampaignState) => string | null): CampaignResult {
  const next = structuredClone(s);
  const h = next.heroes.find((x) => x.classId === classId);
  if (!h) return fail(`no hero ${classId}`);
  const err = fn(h, next);
  return err ? fail(err) : { ok: true, state: next };
}

/** Number of the furthest won scenario (0 before the first win). */
export function furthestScenario(c: CampaignContent, s: CampaignState): number {
  return Math.max(0, ...s.completed.map((id) => c.scenarios[id]?.number ?? 0));
}

/** Items on sale: unlocked by the story (`unlockedAfter` ≤ the furthest won scenario); copies are unlimited. */
export function shopStock(c: CampaignContent, s: CampaignState): ItemDef[] {
  const furthest = furthestScenario(c, s);
  return Object.values(c.items).filter((it) => it.unlockedAfter <= furthest);
}

/** Gold back for an item: `sellRate` of its price (plus the ★ price), rounded down. */
export function sellPrice(c: CampaignContent, item: ItemDef, plus = false): number {
  return Math.floor((item.price + (plus ? (item.upgrade?.price ?? 0) : 0)) * c.campaign.sellRate);
}

export function buy(c: CampaignContent, s: CampaignState, classId: string, itemId: string): CampaignResult {
  const item = c.items[itemId];
  if (!item) return fail(`unknown item ${itemId}`);
  if (!shopStock(c, s).includes(item)) return fail('not in the shop yet');
  return withHero(s, classId, (h) => {
    if (h.owned.some((o) => o.id === itemId)) return 'already owned';
    if (h.gold < item.price) return 'not enough gold';
    h.gold -= item.price;
    h.owned.push({ id: itemId, plus: false });
    return null;
  });
}

export function sell(c: CampaignContent, s: CampaignState, classId: string, itemId: string): CampaignResult {
  const item = c.items[itemId];
  if (!item) return fail(`unknown item ${itemId}`);
  return withHero(s, classId, (h) => {
    const owned = h.owned.find((o) => o.id === itemId);
    if (!owned) return 'not owned';
    h.gold += sellPrice(c, item, owned.plus);
    h.owned = h.owned.filter((o) => o !== owned);
    h.equipped = h.equipped.filter((id) => id !== itemId);
    return null;
  });
}

/** ★: one upgrade per item, paid with `upgrade.price`. */
export function upgrade(c: CampaignContent, s: CampaignState, classId: string, itemId: string): CampaignResult {
  const item = c.items[itemId];
  if (!item?.upgrade) return fail(`${itemId} has no upgrade`);
  const price = item.upgrade.price;
  return withHero(s, classId, (h) => {
    const owned = h.owned.find((o) => o.id === itemId);
    if (!owned) return 'not owned';
    if (owned.plus) return 'already upgraded';
    if (h.gold < price) return 'not enough gold';
    h.gold -= price;
    owned.plus = true;
    return null;
  });
}

type SlotGroup = keyof CampaignRules['slots'];

/** Which slot limit an item counts against, and how much of it it takes. */
function slotUse(slot: ItemSlot): { group: SlotGroup; size: number } {
  if (slot === 'hand') return { group: 'hands', size: 1 };
  if (slot === 'twoHands') return { group: 'hands', size: 2 };
  return { group: slot, size: 1 };
}

/** Takes an owned item on the mission. A full slot makes room: the items equipped there earliest
 *  go back to the hero's chest (a two-handed item frees both hands). */
export function equip(c: CampaignContent, s: CampaignState, classId: string, itemId: string): CampaignResult {
  const item = c.items[itemId];
  if (!item) return fail(`unknown item ${itemId}`);
  const { group, size } = slotUse(item.slot);
  const cap = c.campaign.slots[group];
  if (size > cap) return fail(`no ${group} slot`);
  return withHero(s, classId, (h) => {
    if (!h.owned.some((o) => o.id === itemId)) return 'not owned';
    if (h.equipped.includes(itemId)) return 'already equipped';
    const sizeOf = (id: string) => {
      const def = c.items[id];
      const use = def ? slotUse(def.slot) : undefined;
      return use?.group === group ? use.size : 0;
    };
    let used = h.equipped.reduce((sum, id) => sum + sizeOf(id), 0);
    while (used + size > cap) {
      const out = h.equipped.find((id) => sizeOf(id) > 0) as string;
      used -= sizeOf(out);
      h.equipped = h.equipped.filter((id) => id !== out);
    }
    h.equipped.push(itemId);
    return null;
  });
}

export function unequip(s: CampaignState, classId: string, itemId: string): CampaignResult {
  return withHero(s, classId, (h) => {
    if (!h.equipped.includes(itemId)) return 'not equipped';
    h.equipped = h.equipped.filter((id) => id !== itemId);
    return null;
  });
}

/** Item ids for `GameSetup.heroes[].items`: the equipped items, `<id>+` for the ★ ones. */
export function equippedIds(h: CampaignHero): string[] {
  return h.equipped.map((id) => (h.owned.find((o) => o.id === id)?.plus ? `${id}${UPGRADED}` : id));
}

/** A hero takes a found item from the party chest for free. */
export function takeFromChest(s: CampaignState, classId: string, itemId: string): CampaignResult {
  return withHero(s, classId, (h, next) => {
    const at = next.partyChest.indexOf(itemId);
    if (at < 0) return 'not in the party chest';
    if (h.owned.some((o) => o.id === itemId)) return 'already owned';
    next.partyChest.splice(at, 1);
    h.owned.push({ id: itemId, plus: false });
    return null;
  });
}

/** A found item nobody can take (every hero owns one) is sold; the gold goes to the seller. */
export function sellFromChest(c: CampaignContent, s: CampaignState, classId: string, itemId: string): CampaignResult {
  const item = c.items[itemId];
  if (!item) return fail(`unknown item ${itemId}`);
  if (!s.heroes.every((h) => h.owned.some((o) => o.id === itemId))) return fail('a hero can still take it');
  return withHero(s, classId, (h, next) => {
    const at = next.partyChest.indexOf(itemId);
    if (at < 0) return 'not in the party chest';
    next.partyChest.splice(at, 1);
    h.gold += sellPrice(c, item);
    return null;
  });
}

/** «Подарувати»: gold from one hero to another, `giftStep` by default. */
export function giftGold(c: CampaignContent, s: CampaignState, fromClassId: string, toClassId: string, amount = c.campaign.giftStep): CampaignResult {
  if (fromClassId === toClassId) return fail('cannot gift to yourself');
  if (!Number.isInteger(amount) || amount <= 0) return fail('bad amount');
  if (!s.heroes.some((h) => h.classId === toClassId)) return fail(`no hero ${toClassId}`);
  return withHero(s, fromClassId, (from, next) => {
    if (from.gold < amount) return 'not enough gold';
    from.gold -= amount;
    (next.heroes.find((h) => h.classId === toClassId) as CampaignHero).gold += amount;
    return null;
  });
}

/** What a finished (won or lost) scenario brings back to the camp; `GameController.rewards()` gives it. */
export interface ScenarioResult {
  /** Unique per game (its start time); a result with the same id is applied only once. */
  id: string;
  scenarioId: string;
  won: boolean;
  /** XP and gold per hero (gold = coins × coin value + `reward.goldEach` on a win). */
  heroes: { classId: string; xp: number; gold: number }[];
  /** Shop items found in chests and on enemies (`GameState.foundItems`). */
  foundItems?: string[];
}

/** Scenario result → campaign. A loss keeps the gold, XP and found items («поразка м'яка»); a win also
 *  puts `reward.items` in the party chest, marks the scenario completed and unlocks `reward.unlock`. */
export function applyScenarioResult(c: CampaignContent, s: CampaignState, r: ScenarioResult): CampaignResult {
  if (s.lastResultId === r.id) return fail('result already applied');
  const scenario = c.scenarios[r.scenarioId];
  if (!scenario) return fail(`unknown scenario ${r.scenarioId}`);
  const next = structuredClone(s);
  for (const got of r.heroes) {
    const h = next.heroes.find((x) => x.classId === got.classId);
    if (!h) return fail(`no hero ${got.classId}`);
    h.xp += Math.max(0, got.xp);
    h.gold += Math.max(0, got.gold);
  }
  next.partyChest.push(...(r.foundItems ?? []));
  if (r.won) {
    next.partyChest.push(...(scenario.reward.items ?? []));
    if (!next.completed.includes(r.scenarioId)) next.completed.push(r.scenarioId);
    next.unlocked = next.unlocked.filter((id) => id !== r.scenarioId);
    for (const id of scenario.reward.unlock ?? []) {
      if (!next.completed.includes(id) && !next.unlocked.includes(id)) next.unlocked.push(id);
    }
  }
  next.lastResultId = r.id;
  return { ok: true, state: next };
}

// ─── Level-up ──────────────────────────────────────────────────────────────

/** XP reached the next threshold of `xpByLevel` (level-up happens only in the camp). */
export function canLevelUp(c: CampaignContent, h: CampaignHero): boolean {
  const need = c.campaign.xpByLevel[h.level];
  return need !== undefined && h.xp >= need;
}

/** The new cards of the next level (the hero takes 1); empty = no card choice. */
export function levelUpCards(c: CampaignContent, h: CampaignHero): string[] {
  return (c.heroes[h.classId]?.cards ?? []).filter((card) => card.level === h.level + 1).map((card) => card.id);
}

/** Perks the hero can still take (each at most `max` times). */
export function availablePerks(c: CampaignContent, h: CampaignHero): string[] {
  return Object.values(c.perks ?? {})
    .filter((p) => h.perks.filter((id) => id === p.id).length < p.max)
    .map((p) => p.id);
}

/** New level (wizard: +health → 1 of the new cards → a perk). Health comes from `hpByLevel` in setup. */
export function levelUp(c: CampaignContent, s: CampaignState, classId: string, choice: { card?: string; perk?: string }): CampaignResult {
  return withHero(s, classId, (h) => {
    if (!canLevelUp(c, h)) return 'not enough XP';
    const offered = levelUpCards(c, h);
    if (offered.length > 0 ? !choice.card || !offered.includes(choice.card) : choice.card) return 'choose one of the new cards';
    const perks = availablePerks(c, h);
    if (perks.length > 0 ? !choice.perk || !perks.includes(choice.perk) : choice.perk) return 'choose an available perk';
    h.level += 1;
    if (choice.card) h.cardPool = [...(h.cardPool ?? []), choice.card];
    if (choice.perk) h.perks.push(choice.perk);
    return null;
  });
}

// ─── Hand and scenario setup ───────────────────────────────────────────────

/** Cards the hero picks the mission hand from: the level-1 cards plus the chosen level cards. */
export function cardPool(c: CampaignContent, h: CampaignHero): string[] {
  const owned = h.cardPool ?? [];
  return (c.heroes[h.classId]?.cards ?? []).filter((card) => card.level <= 1 || owned.includes(card.id)).map((card) => card.id);
}

/** «Карти на місію»: the hand when the pool is larger than the hand size. */
export function pickHand(c: CampaignContent, s: CampaignState, classId: string, cards: string[]): CampaignResult {
  const cls = c.heroes[classId];
  if (!cls) return fail(`unknown hero class ${classId}`);
  return withHero(s, classId, (h) => {
    const pool = cardPool(c, h);
    if (new Set(cards).size !== cards.length || cards.length !== cls.handSize) return `choose ${cls.handSize} cards`;
    if (cards.some((id) => !pool.includes(id))) return 'card not in the pool';
    h.handPick = [...cards];
    return null;
  });
}

/** Scenarios the party can start: unlocked ones (a lost one stays there) and won ones to replay. */
export function playableScenarios(s: CampaignState): string[] {
  return [...s.unlocked, ...s.completed.filter((id) => !s.unlocked.includes(id))];
}

/** Campaign → `GameSetup`: level, perks, equipped items (`<id>+` for ★), owned level cards and the
 *  camp hand (without a valid one the hero picks the hand before the scenario). */
export function setupFromCampaign(
  s: CampaignState,
  scenarioId: string,
  o: { seed: number; variants: Variants },
): { ok: true; setup: GameSetup } | { ok: false; error: string } {
  if (!playableScenarios(s).includes(scenarioId)) return { ok: false, error: `${scenarioId} is not unlocked` };
  return {
    ok: true,
    setup: {
      scenarioId,
      seed: o.seed,
      difficulty: s.difficulty,
      variants: { ...o.variants },
      heroes: s.heroes.map((h) => ({
        classId: h.classId,
        playerId: h.playerId,
        level: h.level,
        perks: [...h.perks],
        items: equippedIds(h),
        cards: [...(h.cardPool ?? [])],
        ...(h.handPick ? { hand: [...h.handPick] } : {}),
      })),
    },
  };
}
