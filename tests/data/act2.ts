// Act II «Сиві гори» (docs/design/act2.md) before it is wired into loadContent(): the new monsters,
// the boss and its deck, added to a copy of the content for the data tests. Wiring comes with the
// de/en texts; then this file and the ACT2 exceptions in the tests go.

import type { BehaviourDeck, BossType, Content, MonsterType } from '../../src/rules/content';
import mountainRam from '../../data/monsters/mountain-ram.json';
import nightMoth from '../../data/monsters/night-moth.json';
import hammerfist from '../../data/bosses/hammerfist.json';
import hammerfistDeck from '../../data/decks/boss.hammerfist.json';

export const ACT2 = ['s6', 's7', 's8', 's9', 's10'];

export function withAct2<T extends Content>(content: T): T {
  return {
    ...content,
    monsters: { ...content.monsters, 'mountain-ram': mountainRam as MonsterType, 'night-moth': nightMoth as MonsterType },
    bosses: { ...content.bosses, hammerfist: hammerfist as BossType },
    decks: { ...content.decks, 'boss.hammerfist': hammerfistDeck as BehaviourDeck },
  };
}
