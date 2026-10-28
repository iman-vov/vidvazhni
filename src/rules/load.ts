// Loads all game content from data/ (JSON, validated against data/schema/ at build time).
// Files are imported statically so Vite, Vitest and the PWA cache all see them.
// Adding a content file = one import line and one list entry below.

import type {
  BattleGoalDef,
  BehaviourDeck,
  BossType,
  CampaignRules,
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
import mountainRam from '../../data/monsters/mountain-ram.json';
import nightMoth from '../../data/monsters/night-moth.json';
import greyWolf from '../../data/monsters/grey-wolf.json';
import shadowWraith from '../../data/monsters/shadow-wraith.json';
import stoneSentinel from '../../data/monsters/stone-sentinel.json';
import thornling from '../../data/monsters/thornling.json';
import marshHopper from '../../data/monsters/marsh-hopper.json';
import brassAutomaton from '../../data/monsters/brass-automaton.json';

import bogMiller from '../../data/bosses/bog-miller.json';
import hammerfist from '../../data/bosses/hammerfist.json';
import shadowhand from '../../data/bosses/shadowhand.json';
import mistQueen from '../../data/bosses/mist-queen.json';
import glassGuardian from '../../data/bosses/glass-guardian.json';

import archerDeck from '../../data/decks/archer.json';
import bossHammerfistDeck from '../../data/decks/boss.hammerfist.json';
import bossMillerDeck from '../../data/decks/boss.miller.json';
import bossShadowhandDeck from '../../data/decks/boss.shadowhand.json';
import bossMistQueenDeck from '../../data/decks/boss.mist-queen.json';
import bossGlassGuardianDeck from '../../data/decks/boss.glass-guardian.json';
import casterDeck from '../../data/decks/caster.json';
import ghostDeck from '../../data/decks/ghost.json';
import guardDeck from '../../data/decks/guard.json';
import meleeDeck from '../../data/decks/melee.json';

import s1 from '../../data/scenarios/s1.json';
import s2 from '../../data/scenarios/s2.json';
import s3 from '../../data/scenarios/s3.json';
import s4 from '../../data/scenarios/s4.json';
import s5 from '../../data/scenarios/s5.json';
import s6 from '../../data/scenarios/s6.json';
import s7 from '../../data/scenarios/s7.json';
import s8 from '../../data/scenarios/s8.json';
import s9 from '../../data/scenarios/s9.json';
import s10 from '../../data/scenarios/s10.json';
import s16 from '../../data/scenarios/s16.json';
import s17 from '../../data/scenarios/s17.json';
import s18 from '../../data/scenarios/s18.json';
import s19 from '../../data/scenarios/s19.json';

import items from '../../data/items.json';
import battleGoals from '../../data/battle-goals.json';
import perks from '../../data/perks.json';
import campaign from '../../data/campaign.json';

import uk from '../../data/i18n/uk.json';
import de from '../../data/i18n/de.json';
import en from '../../data/i18n/en.json';
import helpUk from '../../data/help/uk.json';
import helpDe from '../../data/help/de.json';
import helpEn from '../../data/help/en.json';

/** `loadContent()` always fills the optional parts of `Content`. */
export interface LoadedContent extends Content {
  items: Record<string, ItemDef>;
  battleGoals: Record<string, BattleGoalDef>;
  perks: Record<string, PerkDef>;
  campaign: CampaignRules;
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
      mountainRam, nightMoth, marshHopper, brassAutomaton,
    ]),
    bosses: indexById<BossType>([bogMiller, shadowhand, hammerfist, mistQueen, glassGuardian]),
    decks: indexById<BehaviourDeck>([
      meleeDeck, guardDeck, archerDeck, casterDeck, ghostDeck, bossMillerDeck, bossShadowhandDeck, bossHammerfistDeck,
      bossMistQueenDeck, bossGlassGuardianDeck,
    ]),
    scenarios: indexById<ScenarioDef>([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s16, s17, s18, s19]),
    items: indexById<ItemDef>(items),
    battleGoals: indexById<BattleGoalDef>(battleGoals),
    perks: indexById<PerkDef>(perks),
    campaign,
  };
  return cached;
}

let tables: Record<Lang, Record<string, string>> | undefined;

/** Flat key → text tables; keys are documented by the tests in tests/data/i18n.test.ts. The rules
 *  reference and the tutorial keep their texts in data/help (`help.*`, `tutorial.*`, the tutorial map's
 *  names); they are merged in here, the game texts win on a clash (tests/app/help.test.ts forbids it). */
export function loadTranslations(): Record<Lang, Record<string, string>> {
  tables ??= { uk: { ...helpUk, ...uk }, de: { ...helpDe, ...de }, en: { ...helpEn, ...en } };
  return tables;
}
