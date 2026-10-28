// Building a new game: scenario level, heroes, the start room, monsters, decks.

import type { Content, HeroClass, PerkOp, ScenarioDef } from './content';
import { emit, isPresent, monsters, scaleMonsterStats, trapDamage, type Ctx } from './effects/context';
import { initialElements, scenarioOrbs } from './elements';
import { setupItems } from './items';
import { onRoomRevealed, onRoundStart } from './events';
import { spawnNpcs } from './scenarioRules';
import { drawIntents } from './round';
import { MONSTER_HP_BONUS_WITH_INTENTS } from './variants';
import { hexKey, type Hex } from './hex';
import { createModifierDeck, perkedCards } from './modifiers';
import { shuffle } from './rng';
import { brokenByFlag, flagBossShield } from './flags';
import type { GameSetup, GameState, HeroState, MonsterState, Tile } from './state';

const DIFFICULTY_OFFSET = { easy: -1, normal: 0, hard: 1 } as const;
export const MAX_LEVEL = 7;

/** Scenario level = ceil(average hero level / 2), then ±1 for difficulty, within 0–7. */
export function scenarioLevel(heroLevels: number[], difficulty: GameSetup['difficulty']): number {
  const avg = heroLevels.reduce((a, b) => a + b, 0) / Math.max(1, heroLevels.length);
  const level = Math.ceil(avg / 2) + DIFFICULTY_OFFSET[difficulty];
  return Math.min(MAX_LEVEL, Math.max(0, level));
}

/** Spawn column for the party size: 1 hero uses the 2-hero column. */
export function spawnKey(heroCount: number): '2' | '3' | '4' {
  return heroCount <= 2 ? '2' : heroCount === 3 ? '3' : '4';
}

/** Cards a hero may take into the scenario: class cards up to the hero's level; with `owned`
 *  (campaign) the level-1 cards plus the owned level cards. */
export function availableCards(cls: HeroClass, level: number, owned?: string[]): string[] {
  return cls.cards.filter((c) => c.level <= Math.max(1, level) && (!owned || c.level <= 1 || owned.includes(c.id))).map((c) => c.id);
}

/** The default hand from a pool: the level cards (highest level first; a levelled hero takes its new
 *  cards), then the class's `recommendedHand`, then the rest of the pool in data order. */
export function recommendedHand(cls: HeroClass, pool: string[]): string[] {
  const level = (id: string) => cls.cards.find((c) => c.id === id)?.level ?? 1;
  const rec = cls.recommendedHand ?? [];
  const rank = (id: string) => (rec.includes(id) ? rec.indexOf(id) : rec.length + pool.indexOf(id));
  return [...pool].sort((a, b) => level(b) - level(a) || rank(a) - rank(b)).slice(0, cls.handSize);
}

/** The deck edits of the hero's perks (campaign level-ups). */
function perkOps(content: Content, perks: string[] = []): PerkOp[] {
  return perks.flatMap((id) => {
    const perk = content.perks?.[id];
    if (!perk) throw new Error(`unknown perk ${id}`);
    return perk.ops;
  });
}

/** A hand picked in the camp is used when it has `handSize` different cards from the pool. */
function validHand(cls: HeroClass, pool: string[], hand: string[] | undefined): hand is string[] {
  return !!hand && hand.length === cls.handSize && new Set(hand).size === hand.length && hand.every((c) => pool.includes(c));
}

export function heroHp(cls: HeroClass, level: number): number {
  const hp = cls.hpByLevel[Math.max(0, level - 1)] ?? cls.hpByLevel[cls.hpByLevel.length - 1];
  if (hp === undefined) throw new Error(`no hp for ${cls.id}`);
  return hp;
}

/** Seed of the drop-chance stream, derived from the game seed. */
export function lootSeed(seed: number): number {
  return (seed ^ 0x9e3779b9) | 0;
}

export function createGame(setup: GameSetup, content: Content): GameState {
  const scenario = content.scenarios[setup.scenarioId];
  if (!scenario) throw new Error(`unknown scenario ${setup.scenarioId}`);
  if (setup.heroes.length === 0) throw new Error('no heroes');
  if (setup.heroes.length > scenario.startHexes.length) throw new Error('not enough start hexes');
  const rng = { seed: setup.seed | 0 };
  const s: GameState = {
    version: 1,
    scenarioId: scenario.id,
    level: scenarioLevel(
      setup.heroes.map((h) => h.level),
      setup.difficulty,
    ),
    difficulty: setup.difficulty,
    variants: { ...setup.variants },
    ...(setup.flags?.length ? { flags: [...setup.flags] } : {}),
    rng,
    round: 1,
    phase: 'selectCards',
    pending: null,
    figures: {},
    board: { tiles: {}, walls: [], revealedRooms: [] },
    elements: initialElements(),
    pendingInfusions: [],
    orbs: {},
    monsterDeck: createModifierDeck(rng),
    behaviourDecks: {},
    turnOrder: [],
    turnIndex: -1,
    half: null,
    log: [],
    queue: [],
    undoPoint: null,
    lootRng: { seed: lootSeed(setup.seed) },
  };
  const ctx: Ctx = { s, c: content, ev: [], out: [] };

  const needsChoice: string[] = [];
  setup.heroes.forEach((h, i) => {
    const cls = content.heroes[h.classId];
    if (!cls) throw new Error(`unknown hero class ${h.classId}`);
    const id = `hero:${cls.id}`;
    if (s.figures[id]) throw new Error(`duplicate hero ${cls.id}`);
    const hp = heroHp(cls, h.level);
    const cards = availableCards(cls, h.level, h.cards);
    const picked = cards.length > cls.handSize && validHand(cls, cards, h.hand);
    const choose = cards.length > cls.handSize && !picked;
    const hero: HeroState = {
      id,
      kind: 'hero',
      classId: cls.id,
      playerId: h.playerId,
      level: h.level,
      hex: [...(scenario.startHexes[i] as Hex)] as Hex,
      hp,
      maxHp: hp,
      conditions: {},
      shields: [],
      retaliates: [],
      turnCount: 0,
      hand: picked ? [...(h.hand as string[])] : choose ? [] : cards,
      discard: [],
      lost: [],
      active: [],
      selection: null,
      initiative: null,
      xp: 0,
      coins: 0,
      modifierDeck: createModifierDeck(rng, [], perkedCards(perkOps(content, h.perks))),
      exhausted: false,
      downed: false,
      revived: false,
      momentum: 0,
      playedThisTurn: [],
      wantsShortRest: false,
      provokeRadius: null,
      chests: [],
    };
    if (h.cards) hero.cardPool = cards;
    s.figures[id] = hero;
    setupItems(ctx, hero, h.items ?? []);
    if (choose) needsChoice.push(id);
  });

  revealRoom(ctx, scenario, scenario.startRoom);
  scenarioOrbs(ctx, 'atStart');
  scenarioOrbs(ctx, 'eachRound');
  onRoundStart(ctx);
  drawIntents(ctx);
  s.pending =
    needsChoice.length > 0
      ? { kind: 'chooseHandBeforeScenario', heroIds: needsChoice }
      : { kind: 'selectCards', heroIds: Object.keys(s.figures).filter((id) => id.startsWith('hero:')) };
  return s;
}

/** Reveals a room: tiles, walls, traps, loot and the monsters for the party size. */
export function revealRoom(ctx: Ctx, scenario: ScenarioDef, roomId: string): void {
  const s = ctx.s;
  if (s.board.revealedRooms.includes(roomId)) return;
  const room = scenario.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error(`unknown room ${roomId}`);
  s.board.revealedRooms.push(roomId);
  const tile = (hex: Hex): Tile => {
    const key = hexKey(hex);
    s.board.tiles[key] ??= { room: roomId, terrain: 'normal' };
    return s.board.tiles[key];
  };
  for (const hex of room.hexes) tile(hex);
  for (const o of room.obstacles ?? []) {
    const t = tile(o.hex);
    t.obstacle = true;
    if (o.breakable) t.breakable = { hp: o.breakable.hp, maxHp: o.breakable.hp };
    if (o.movable) t.movable = true;
  }
  for (const t of room.terrain ?? []) tile(t.hex).terrain = t.terrain;
  for (const t of room.traps ?? []) tile(t.hex).trap = { damage: t.damage ?? trapDamage(s), conditions: t.conditions ?? [] };
  for (const c of room.coins ?? []) {
    const t = tile(c);
    t.coins = (t.coins ?? 0) + 1;
  }
  for (const c of room.chests ?? []) tile(c.hex).chest = c.id;
  for (const o of room.objects ?? []) {
    // A secret mission broke it already (flags.ts).
    if (brokenByFlag(s, ctx.c, o.id)) {
      (s.destroyedObjects ??= []).push(o.id);
      continue;
    }
    const t = tile(o.hex);
    t.object = { id: o.id, kind: o.kind, ...(o.state !== undefined ? { state: o.state } : {}) };
    // Lever, brazier, millstones: impassable like an obstacle; a hero acts from a neighbouring hex.
    if (o.blocks) t.obstacle = true;
    // A totem: breakable like a crate. A floor mirror (s16) is stood on and breaks only under an
    // area attack (mirrors.ts).
    if (o.hp && !(o.kind === 'mirror' && !o.blocks)) {
      t.obstacle = true;
      t.breakable = { hp: o.hp, maxHp: o.hp };
    }
  }
  for (const d of room.doors ?? []) {
    const t = tile(d.hex);
    if (!t.door) {
      t.door = { to: d.to, open: s.board.revealedRooms.includes(d.to) };
      if (d.key) t.door.key = d.key;
      // Rubble or a barricade in the doorway blocks like an obstacle until broken or pushed aside.
      if (!t.door.open && d.breakable) t.door.breakable = { hp: d.breakable.hp, maxHp: d.breakable.hp };
      if (!t.door.open && d.movable) t.door.movable = true;
      if (t.door.breakable || t.door.movable) t.obstacle = true;
    }
  }
  // Doors of already revealed rooms that lead here are now open.
  for (const t of Object.values(s.board.tiles)) {
    if (!t.door || t.door.to !== roomId) continue;
    t.door.open = true;
    if (t.door.breakable || t.door.movable) {
      delete t.door.breakable;
      delete t.door.movable;
      delete t.obstacle;
    }
  }
  for (const [a, b] of room.walls ?? []) {
    const ka = hexKey(a);
    const kb = hexKey(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (!s.board.walls.includes(key)) s.board.walls.push(key);
  }
  emit(ctx, { type: 'roomRevealed', roomId });
  const key = spawnKey(Object.keys(s.figures).filter((id) => id.startsWith('hero:')).length);
  for (const sp of room.spawns ?? []) {
    const rank = sp.by[key];
    if (!rank) continue;
    const m = spawnMonster(ctx, sp.monster, rank, sp.hex);
    // Rooms whose last monster of a type drops a story item remember where the monster came from.
    if (room.drops?.some((d) => d.monster === sp.monster)) m.room = roomId;
    if (sp.drops) m.drops = sp.drops;
    if (sp.tag) m.tag = sp.tag;
    if (sp.asleep) m.asleep = true;
  }
  spawnNpcs(ctx, room);
  onRoomRevealed(ctx, roomId);
}

function nextStandeeNumber(s: GameState, typeId: string): number {
  const used = new Set(monsters(s).filter((m) => m.typeId === typeId).map((m) => m.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function heroCount(s: GameState): number {
  return Object.values(s.figures).filter((f) => f.kind === 'hero').length;
}

export function spawnMonster(
  ctx: Ctx,
  typeId: string,
  rank: 'normal' | 'elite',
  hex: Hex,
  summonerId?: string,
): MonsterState {
  const s = ctx.s;
  const boss = ctx.c.bosses[typeId];
  const type = ctx.c.monsters[typeId];
  if (!boss && !type) throw new Error(`unknown monster ${typeId}`);
  const number = nextStandeeNumber(s, typeId);
  const id = `monster:${typeId}:${number}`;
  let hp: number;
  let shield = 0;
  let retaliate = 0;
  if (boss) {
    const n = heroCount(s);
    hp = boss.hpPerHero * n + boss.hpPerHeroPerLevel * n * Math.max(0, s.level - 1);
    shield = flagBossShield(s, ctx.c, typeId) ?? boss.shield ?? 0;
  } else {
    const stats = scaleMonsterStats(rank === 'elite' ? type!.elite : type!.normal, s.level);
    hp = stats.hp;
    shield = stats.shield ?? 0;
    retaliate = stats.retaliate ?? 0;
  }
  if (s.variants.threeIntents) hp = withIntentsHpBonus(hp);
  const m: MonsterState = {
    id,
    kind: 'monster',
    typeId,
    rank: boss ? 'boss' : rank,
    number,
    hex: [hex[0], hex[1]],
    hp,
    maxHp: hp,
    conditions: {},
    shields: shield ? [{ value: shield, source: 'stats', until: 'scenario' }] : [],
    retaliates: retaliate ? [{ value: retaliate, range: 1, source: 'stats', until: 'scenario' }] : [],
    turnCount: 0,
    attackedBy: [],
  };
  // Summoned monsters skip the current round; monsters revealed by a door act normally.
  if (summonerId) {
    m.summonerId = summonerId;
    m.summonedRound = s.round;
  }
  s.figures[id] = m;
  if (!s.behaviourDecks[typeId]) {
    const deck = ctx.c.decks[boss ? boss.deck : type!.deck];
    if (!deck) throw new Error(`unknown behaviour deck for ${typeId}`);
    const own = s.variants.threeIntents ? (type?.forkCards ?? []) : [];
    s.behaviourDecks[typeId] = {
      draw: shuffle(s.rng, [...deck.cards, ...own].map((c) => c.id)),
      discard: [],
      current: null,
      intents: [],
      needsShuffle: false,
    };
  }
  emit(ctx, { type: 'figureSpawned', figureId: id });
  return m;
}

/** Fork «Три можливі наміри»: monster (and boss) health +10%, rounded up. */
export function withIntentsHpBonus(hp: number): number {
  return Math.ceil(Math.round(hp * (1 + MONSTER_HP_BONUS_WITH_INTENTS) * 1e6) / 1e6);
}

/** Living monsters of a type that are on the board. */
export function monstersOfType(s: GameState, typeId: string): MonsterState[] {
  return monsters(s).filter((m) => m.typeId === typeId && isPresent(m));
}
