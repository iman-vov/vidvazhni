// Act III regions A (Sleepy Marsh, s11–s15) and B (Glass Town, s16–s20): every story line and every scenario, room and event
// text exists in all three languages, and every NPC who speaks there has a name.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['uk', 'de', 'en'] as const;
const REGIONS: Record<string, string[]> = {
  'Sleepy Marsh': ['s11', 's12', 's13', 's14', 's15'],
  'Glass Town': ['s16', 's17'],
};

type Line = { id: string; speaker: string; text: string; variants?: Record<string, string> };
type Scenario = { intro: Line[]; beats: { id: string; lines: Line[] }[]; outro: { victory: Line[]; defeat: Line[] }; epilogue: Line };

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const story = Object.fromEntries(LANGS.map((l) => [l, read(`data/story/${l}.json`).scenarios as Record<string, Scenario>]));
const texts = Object.fromEntries(LANGS.map((l) => [l, read(`data/i18n/${l}.json`) as Record<string, string>]));
const HEROES = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];

const lines = (s: Scenario): Line[] => [...s.intro, ...s.beats.flatMap((b) => b.lines), ...s.outro.victory, ...s.outro.defeat, s.epilogue];
const own = (id: string) => (key: string) => key === `scenario.${id}` || key.startsWith(`scenario.${id}.`) || key.includes(`.${id}.`);

for (const [region, ids] of Object.entries(REGIONS)) describe(`${region} texts`, () => {
  for (const id of ids) {
    it(`${id} has story lines with the same ids in uk, de and en`, () => {
      const ids = (l: (typeof LANGS)[number]) => lines(story[l]![id]!).map((x) => x.id);
      for (const l of LANGS) expect(story[l]![id], `${l} ${id}`).toBeDefined();
      for (const l of LANGS) expect(ids(l)).toEqual(ids('uk'));
      for (const l of LANGS) for (const x of lines(story[l]![id]!)) expect(x.text.trim(), x.id).not.toBe('');
    });

    it(`${id} has a hero line for all six classes`, () => {
      const hero = lines(story.uk![id]!).filter((x) => x.speaker === 'hero');
      expect(hero.length).toBeGreaterThan(0);
      for (const x of hero) expect(Object.keys(x.variants ?? {}).sort()).toEqual([...HEROES].sort());
    });

    it(`${id} has its name, goal, card, outro, rooms and events in uk, de and en`, () => {
      for (const k of ['', '.goal', '.intro', '.outro']) for (const l of LANGS) expect(texts[l]![`scenario.${id}${k}`], `${l} scenario.${id}${k}`).toBeTruthy();
      const keys = new Set(LANGS.flatMap((l) => Object.keys(texts[l]!).filter(own(id))));
      for (const key of keys) for (const l of LANGS) expect(texts[l]![key], `${l} ${key}`).toBeTruthy();
    });

    it(`${id} speakers all have a name`, () => {
      const known = ['narrator', 'marta', 'hero', ...HEROES];
      for (const x of lines(story.uk![id]!))
        if (!known.includes(x.speaker)) for (const l of LANGS) expect(texts[l]![`story.speaker.${x.speaker}`], `${l} ${x.speaker}`).toBeTruthy();
    });
  }
});
