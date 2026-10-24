// Loads all game content from data/ (JSON, validated against data/schema/ at build time).
// Files are imported statically so Vite, Vitest and the PWA cache all see them.
// Adding a content file = one import line and one list entry below.

import type {
  BattleGoalDef,
  BehaviourDeck,
  BossType,
  Content,
  HeroClass,
  ItemDef,
  MonsterType,
  PerkDef,
  ScenarioDef,
} from './content';

import elementalist from '../../data/heroes/elementalist.json';
import herbalist from '../../data/heroes/herbalist.json';
import rogue from '../../data/heroes/rogue.json';
import tinker from '../../data/heroes/tinker.json';
import warden from '../../data/heroes/warden.json';
import windArcher from '../../data/heroes/wind-archer.json';

import banditBrute from '../../data/monsters/bandit-brute.json';
import banditCrossbow from '../../data/monsters/bandit-crossbow.json';
import bogSlime from '../../data/monsters/bog-slime.json';
import cellarRat from '../../data/monsters/cellar-rat.json';
import gloomCultist from '../../data/monsters/gloom-cultist.json';
import gremlin from '../../data/monsters/gremlin.json';
import greyWolf from '../../data/monsters/grey-wolf.json';
import shadowWraith from '../../data/monsters/shadow-wraith.json';
import stoneSentinel from '../../data/monsters/stone-sentinel.json';
import thornling from '../../data/monsters/thornling.json';

import bogMiller from '../../data/bosses/bog-miller.json';
import shadowhand from '../../data/bosses/shadowhand.json';

import archerDeck from '../../data/decks/archer.json';
import bossMillerDeck from '../../data/decks/boss.miller.json';
import bossShadowhandDeck from '../../data/decks/boss.shadowhand.json';
import casterDeck from '../../data/decks/caster.json';
import ghostDeck from '../../data/decks/ghost.json';
import guardDeck from '../../data/decks/guard.json';
import meleeDeck from '../../data/decks/melee.json';

import s1 from '../../data/scenarios/s1.json';
import s2 from '../../data/scenarios/s2.json';
import s3 from '../../data/scenarios/s3.json';
import s4 from '../../data/scenarios/s4.json';
import s5 from '../../data/scenarios/s5.json';

import items from '../../data/items.json';
import battleGoals from '../../data/battle-goals.json';
import perks from '../../data/perks.json';

import uk from '../../data/i18n/uk.json';
import de from '../../data/i18n/de.json';
import en from '../../data/i18n/en.json';

/** `loadContent()` always fills the optional parts of `Content`. */
export interface LoadedContent extends Content {
  items: Record<string, ItemDef>;
  battleGoals: Record<string, BattleGoalDef>;
  perks: Record<string, PerkDef>;
}

export type Lang = 'uk' | 'de' | 'en';
export const LANGS: readonly Lang[] = ['uk', 'de', 'en'];

// The JSON modules are typed by inference (strings are `string`), the schemas guarantee the real shape.
function indexById<T extends { id: string }>(list: readonly unknown[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const entry of list as T[]) {
    if (out[entry.id]) throw new Error(`content: duplicate id ${entry.id}`);
    out[entry.id] = entry;
  }
  return out;
}

let cached: LoadedContent | undefined;

export function loadContent(): LoadedContent {
  cached ??= {
    heroes: indexById<HeroClass>([warden, windArcher, herbalist, rogue, elementalist, tinker]),
    monsters: indexById<MonsterType>([
      cellarRat, gremlin, thornling, greyWolf, banditBrute,
      banditCrossbow, bogSlime, stoneSentinel, gloomCultist, shadowWraith,
    ]),
    bosses: indexById<BossType>([bogMiller, shadowhand]),
    decks: indexById<BehaviourDeck>([
      meleeDeck, guardDeck, archerDeck, casterDeck, ghostDeck, bossMillerDeck, bossShadowhandDeck,
    ]),
    scenarios: indexById<ScenarioDef>([s1, s2, s3, s4, s5]),
    items: indexById<ItemDef>(items),
    battleGoals: indexById<BattleGoalDef>(battleGoals),
    perks: indexById<PerkDef>(perks),
  };
  return cached;
}

/** Flat key → text tables; keys are documented by the tests in tests/data/i18n.test.ts. */
export function loadTranslations(): Record<Lang, Record<string, string>> {
  return { uk, de, en };
}
