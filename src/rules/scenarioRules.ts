// Scenario rules beyond the core: gradual onboarding (`ScenarioDef.introduces`), scenario objects
// (lever, braziers, runes), story items (keys, the carried Lantern piece) and boss phases.
// Objects with their own `interact` (a floor lever opening locked doors) need no special.
// The named rules in `ScenarioDef.specials`:
//   millSluice       (s3) a hero next to the lever spends a top action → `down`; the Miller's
//                         «Потоп» no longer works. Water stays difficult terrain.
//   runeShield       (s4) a cultist standing on a rune has Shield 1.
//   carriedItemDrops (s4) the carried goal item falls on the hex of an exhausted carrier.
//   braziers         (s5) a hero next to an unlit brazier spends a bottom action → `lit` and infuses
//                         Light (fork: a Fire orb); while not every brazier burns the goal boss
//                         takes half damage (rounded down); a wraith ending its turn next to a lit
//                         brazier puts it out.

import type { Content, DropDef, RoomDef, ScenarioDef, Step } from './content';
import { emit, figureAt, heroes, isPresent, monsters, wallBetween, type Ctx } from './effects/context';
import { openDoor } from './effects/move';
import { infuse } from './elements';
import { onTaggedMonsterDied } from './events';
import { hasLineOfSight } from './geometry';
import { areAdjacent, distance, hexKey, parseHexKey, type Hex } from './hex';
import { nextFloat, nextInt, type RngState } from './rng';
import type { Figure, GameState, HeroState, MonsterState, Tile } from './state';

export function scenarioOf(ctx: Pick<Ctx, 's' | 'c'>): ScenarioDef | undefined {
  return ctx.c.scenarios[ctx.s.scenarioId];
}

export function hasSpecial(ctx: Pick<Ctx, 's' | 'c'>, name: string): boolean {
  return !!scenarioOf(ctx)?.specials?.includes(name);
}

// ─── Gradual onboarding ────────────────────────────────────────────────────

/** Whether a rule group (`conditions`, `elements`, `curse`, `monsterSummons`, …) is in play: it is
 *  introduced by this scenario or an earlier one, or by no scenario at all. */
export function ruleIntroduced(c: Content, scenarioId: string, group: string): boolean {
  const current = c.scenarios[scenarioId];
  if (!current) return true;
  const all = Object.values(c.scenarios);
  if (!all.some((sc) => sc.introduces.includes(group))) return true;
  return all.some((sc) => sc.number <= current.number && sc.introduces.includes(group));
}

/** Monster steps without the rules the scenario has not introduced yet: no conditions before
 *  `conditions`, no infusing or consuming before `elements`, no curse before `curse`, no summons
 *  before `monsterSummons`. A boss's deck comes whole with the boss (the Miller summons in s3).
 *  Hero cards are never changed. */
export function onboardingSteps(ctx: Pick<Ctx, 's' | 'c'>, m: MonsterState, steps: Step[]): Step[] {
  const has = (group: string) => ruleIntroduced(ctx.c, ctx.s.scenarioId, group);
  const conditions = has('conditions');
  const elements = has('elements');
  const curse = has('curse');
  const summons = m.rank === 'boss' || has('monsterSummons');
  if (conditions && elements && curse && summons) return steps;
  const out: Step[] = [];
  for (const st of steps) {
    if ((!conditions && st.type === 'condition') || (!elements && st.type === 'infuse') || (!summons && st.type === 'summon')) continue;
    const copy = structuredClone(st) as Step;
    if (copy.consume && !elements) delete copy.consume;
    if (copy.consume) {
      if (!curse) delete copy.consume.curse;
      if (!conditions) {
        delete copy.consume.conditions;
        delete copy.consume.replaceConditions;
      }
      // A bonus with nothing left does not consume the element either.
      const { element: _element, count: _count, ...rest } = copy.consume;
      if (Object.keys(rest).length === 0) delete copy.consume;
    }
    if (copy.type === 'attack') {
      if (!conditions) delete copy.conditions;
      if (!curse) delete copy.curse;
    }
    out.push(copy);
  }
  return out;
}

// ─── Scenario objects ──────────────────────────────────────────────────────

interface ObjectRule {
  special: string;
  kind: string;
  half: 'top' | 'bottom';
  from: string;
  to: string;
  opens?: Hex[];
}

const INTERACTIONS: readonly ObjectRule[] = [
  { special: 'millSluice', kind: 'lever', half: 'top', from: 'up', to: 'down' },
  { special: 'braziers', kind: 'brazier', half: 'bottom', from: 'unlit', to: 'lit' },
];

/** The object's own `interact` from the scenario data (a lever opening doors). */
function dataRule(ctx: Pick<Ctx, 's' | 'c'>, objectId: string): ObjectRule | undefined {
  for (const room of scenarioOf(ctx)?.rooms ?? []) {
    const o = room.objects?.find((x) => x.id === objectId);
    if (!o?.interact) continue;
    const { half, from, to, opens } = o.interact;
    return { special: '', kind: o.kind, half, from: from ?? o.state ?? '', to, ...(opens ? { opens } : {}) };
  }
  return undefined;
}

/** Under the orbs fork there is no Light: a lit brazier gives a Fire orb instead. */
export const BRAZIER_ELEMENT = 'light';
export const BRAZIER_ORB = 'fire';

/** Revealed scenario objects with their hexes. */
export function boardObjects(s: GameState): { hex: Hex; tile: Tile & { object: NonNullable<Tile['object']> } }[] {
  const out: { hex: Hex; tile: Tile & { object: NonNullable<Tile['object']> } }[] = [];
  for (const [key, tile] of Object.entries(s.board.tiles)) {
    if (tile.object) out.push({ hex: parseHexKey(key), tile: tile as Tile & { object: NonNullable<Tile['object']> } });
  }
  return out;
}

/** What a hero may do with an object now: the rule, or why not. */
export function interactionFor(
  ctx: Pick<Ctx, 's' | 'c'>,
  h: HeroState,
  objectId: string,
  half: 'top' | 'bottom',
): { rule: ObjectRule; hex: Hex; tile: Tile & { object: NonNullable<Tile['object']> } } | string {
  const found = boardObjects(ctx.s).find((o) => o.tile.object.id === objectId);
  if (!found) return 'no such object';
  const rule = INTERACTIONS.find((r) => r.kind === found.tile.object.kind && hasSpecial(ctx, r.special)) ?? dataRule(ctx, objectId);
  if (!rule) return 'nothing to do with this object';
  if (rule.half !== half) return `this needs a ${rule.half} action`;
  if ((found.tile.object.state ?? '') !== rule.from) return 'already done';
  if (distance(found.hex, h.hex) !== 1 || wallBetween(ctx.s, found.hex, h.hex)) return 'the object must be adjacent';
  return { rule, hex: found.hex, tile: found.tile };
}

export function applyInteraction(ctx: Ctx, h: HeroState, found: Exclude<ReturnType<typeof interactionFor>, string>): void {
  found.tile.object.state = found.rule.to;
  emit(ctx, { type: 'objectChanged', objectId: found.tile.object.id, hex: [found.hex[0], found.hex[1]], state: found.rule.to, byId: h.id });
  if (found.rule.kind === 'brazier') infuse(ctx, ctx.s.variants.orbs ? BRAZIER_ORB : BRAZIER_ELEMENT, h.id);
  for (const hex of found.rule.opens ?? []) openDoor(ctx, hex);
}

/** s3: the Miller's «Потоп» does nothing once the sluice lever is down. */
export function sluiceLowered(ctx: Pick<Ctx, 's' | 'c'>): boolean {
  if (!hasSpecial(ctx, 'millSluice')) return false;
  return boardObjects(ctx.s).some((o) => o.tile.object.kind === 'lever' && o.tile.object.state === 'down');
}

function braziersInScenario(ctx: Pick<Ctx, 's' | 'c'>): number {
  return (scenarioOf(ctx)?.rooms ?? []).reduce((n, r) => n + (r.objects ?? []).filter((o) => o.kind === 'brazier').length, 0);
}

export function litBraziers(s: GameState): number {
  return boardObjects(s).filter((o) => o.tile.object.kind === 'brazier' && o.tile.object.state === 'lit').length;
}

function goalBoss(ctx: Pick<Ctx, 's' | 'c'>): string | undefined {
  const goal = scenarioOf(ctx)?.goal;
  return goal?.type === 'killBoss' ? goal.boss : undefined;
}

/** s5: while not every brazier burns, the goal boss takes half damage (rounded down). */
export function adjustDamage(ctx: Pick<Ctx, 's' | 'c'>, target: Figure, amount: number): number {
  if (target.kind !== 'monster' || !hasSpecial(ctx, 'braziers') || target.typeId !== goalBoss(ctx)) return amount;
  return litBraziers(ctx.s) < braziersInScenario(ctx) ? Math.floor(amount / 2) : amount;
}

const RUNE_SHIELDED = 'gloom-cultist';

/** s4: a cultist standing on a rune has Shield 1. */
export function scenarioShield(ctx: Pick<Ctx, 's' | 'c'>, f: Figure): number {
  if (f.kind !== 'monster' || f.typeId !== RUNE_SHIELDED || !hasSpecial(ctx, 'runeShield')) return 0;
  return ctx.s.board.tiles[hexKey(f.hex)]?.object?.kind === 'rune' ? 1 : 0;
}

const BRAZIER_SNUFFER = 'shadow-wraith';

/** End of a figure's turn: s5, a wraith next to a lit brazier puts it out. */
export function onFigureTurnEnd(ctx: Ctx, f: Figure): void {
  if (f.kind !== 'monster' || f.typeId !== BRAZIER_SNUFFER || !hasSpecial(ctx, 'braziers')) return;
  for (const o of boardObjects(ctx.s)) {
    if (o.tile.object.kind !== 'brazier' || o.tile.object.state !== 'lit') continue;
    if (!areAdjacent(o.hex, f.hex) || wallBetween(ctx.s, o.hex, f.hex)) continue;
    o.tile.object.state = 'unlit';
    emit(ctx, { type: 'objectChanged', objectId: o.tile.object.id, hex: [o.hex[0], o.hex[1]], state: 'unlit', byId: f.id });
  }
}

// ─── Story items ───────────────────────────────────────────────────────────

/** A locked door opens only when some hero of the party holds its key. */
export function doorLocked(s: GameState, tile: Tile | undefined): boolean {
  const key = tile?.door?.key;
  if (!key || tile.door?.open) return false;
  return !heroes(s).some((h) => h.questItems?.includes(key));
}

export function dropQuestItem(ctx: Ctx, item: string, hex: Hex, byId: string): void {
  const tile = ctx.s.board.tiles[hexKey(hex)];
  if (!tile) return;
  (tile.questItems ??= []).push(item);
  emit(ctx, { type: 'questItemDropped', item, hex: [hex[0], hex[1]], byId });
}

type ChestLoot = NonNullable<NonNullable<RoomDef['chests']>[number]['loot']>;

/** What a chest holds: coins, a shop item, a story item (none = an empty chest). */
export function chestLoot(ctx: Pick<Ctx, 's' | 'c'>, chestId: string): ChestLoot | undefined {
  for (const room of scenarioOf(ctx)?.rooms ?? []) {
    const chest = room.chests?.find((c) => c.id === chestId);
    if (chest) return chest.loot;
  }
  return undefined;
}

/** A shop item found this scenario goes to `foundItems` (the party chest after the scenario). */
export function findItem(ctx: Ctx, item: string, from: { byId?: string; chest?: string }): void {
  (ctx.s.foundItems ??= []).push(item);
  emit(ctx, { type: 'itemFound', item, ...from });
}

/** The drop-chance stream (`GameState.lootRng`), apart from the fight's RNG. */
function lootRng(s: GameState): RngState {
  return (s.lootRng ??= { seed: 0x9e3779b9 });
}

/** A chance roll; no chance (or ≥ 1) = always, without a roll. */
function roll(ctx: Ctx, chance: number | undefined): boolean {
  return chance === undefined || chance >= 1 || nextFloat(lootRng(ctx.s)) < chance;
}

/** What a killed monster may leave: its own (named enemy), else its boss or type-and-rank drops. */
function dropsOf(ctx: Ctx, m: MonsterState): DropDef | undefined {
  if (m.drops) return m.drops;
  if (m.rank === 'boss') return ctx.c.bosses[m.typeId]?.drops;
  return ctx.c.monsters[m.typeId]?.drops?.[m.rank];
}

/** A killed (not summoned) enemy rolls its drops with the seeded `lootRng`: coins on its hex, an item straight to `foundItems`. */
export function rollDrops(ctx: Ctx, m: MonsterState): void {
  if (m.summonerId) return;
  const drop = dropsOf(ctx, m);
  if (!drop) return;
  const tile = ctx.s.board.tiles[hexKey(m.hex)];
  if (drop.coins && tile && roll(ctx, drop.coinChance)) {
    tile.coins = (tile.coins ?? 0) + drop.coins;
    emit(ctx, { type: 'coinsDropped', byId: m.id, hex: [m.hex[0], m.hex[1]], coins: drop.coins });
  }
  const table = drop.items ?? [];
  if (table.length > 0 && roll(ctx, drop.itemChance)) {
    findItem(ctx, table[table.length > 1 ? nextInt(lootRng(ctx.s), table.length) : 0] as string, { byId: m.id });
  }
}

/** A monster died: it rolls its drops; the last one of its type from a room with `drops` leaves the
 *  story item on its hex. */
export function onMonsterDied(ctx: Ctx, m: MonsterState): void {
  rollDrops(ctx, m);
  onTaggedMonsterDied(ctx, m);
  if (!m.room) return;
  const room = scenarioOf(ctx)?.rooms.find((r) => r.id === m.room);
  for (const drop of room?.drops ?? []) {
    if (drop.monster !== m.typeId) continue;
    if (monsters(ctx.s).some((o) => o.id !== m.id && o.typeId === m.typeId && o.room === m.room && isPresent(o))) continue;
    dropQuestItem(ctx, drop.questItem, m.hex, m.id);
  }
}

/** s4: an exhausted hero drops the carried goal item on its hex. */
export function onHeroExhausted(ctx: Ctx, h: HeroState): void {
  if (!hasSpecial(ctx, 'carriedItemDrops')) return;
  const goal = scenarioOf(ctx)?.goal;
  if (goal?.type !== 'carryItem' || !h.questItems?.includes(goal.item)) return;
  h.questItems = h.questItems.filter((x) => x !== goal.item);
  dropQuestItem(ctx, goal.item, h.hex, h.id);
}

// ─── Bosses ────────────────────────────────────────────────────────────────

/** Тінерук «Друга фаза»: at ≤ 50% health the boss enters phase 2 for the rest of the scenario
 *  (Атака +1, see `monsterStats`). */
export function checkBossPhase(ctx: Ctx, m: MonsterState): void {
  if (m.rank !== 'boss' || (m.bossPhase ?? 1) >= 2 || m.hp <= 0 || m.hp * 2 > m.maxHp) return;
  if (!ctx.c.bosses[m.typeId]?.special?.includes('secondPhase')) return;
  m.bossPhase = 2;
  emit(ctx, { type: 'bossPhaseChanged', figureId: m.id, phase: 2 });
}

/** Where a monster teleports («Перенестися на вільний гекс у межах N, ігнорує все»): a free hex
 *  (no trap, no hazard, no closed door) within `range`, ranked: not next to an enemy, most enemies
 *  it can attack from there (its range, line of sight), farthest from the nearest enemy, the
 *  shortest jump, then the lowest q and r. Staying put is a candidate. */
export function teleportHex(ctx: Pick<Ctx, 's' | 'c'>, m: Figure, range: number, attackRange: number): Hex {
  const enemies = Object.values(ctx.s.figures).filter((o) => isPresent(o) && (o.kind === 'monster') !== (m.kind === 'monster'));
  const score = (hex: Hex): number[] => {
    const near = enemies.length ? Math.min(...enemies.map((e) => distance(e.hex, hex))) : 99;
    const inRange = enemies.filter((e) => {
      const d = distance(e.hex, hex);
      return d <= attackRange && (d <= 1 ? !wallBetween(ctx.s, e.hex, hex) : hasLineOfSight(ctx.s, hex, e.hex));
    }).length;
    return [near <= 1 ? 1 : 0, -inRange, -near, distance(hex, m.hex), hex[0], hex[1]];
  };
  let best = m.hex;
  let bestScore = score(m.hex);
  for (const [key, tile] of Object.entries(ctx.s.board.tiles)) {
    const hex = parseHexKey(key);
    if (distance(hex, m.hex) > range || tile.obstacle || tile.trap || tile.terrain === 'hazardous') continue;
    if (tile.door && !tile.door.open) continue;
    const other = figureAt(ctx.s, hex);
    if (other && other.id !== m.id) continue;
    const sc = score(hex);
    if (compare(sc, bestScore) < 0) {
      best = hex;
      bestScore = sc;
    }
  }
  return best;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
