import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Line = { id: string; speaker: string; pick?: string; text: string; variants?: Record<string, string> };
type Story = {
  scenarios: Record<
    string,
    {
      intro: Line[];
      beats: { id: string; trigger: unknown; lines: Line[] }[];
      outro: { victory: Line[]; defeat: Line[] };
      epilogue: Line;
    }
  >;
};

const read = (lang: string) => JSON.parse(readFileSync(`data/story/${lang}.json`, 'utf8')) as Story;
const lines = (story: Story): Line[] =>
  Object.values(story.scenarios).flatMap((s) => [
    ...s.intro,
    ...s.beats.flatMap((b) => b.lines),
    ...s.outro.victory,
    ...s.outro.defeat,
    s.epilogue,
  ]);
const shape = (story: Story) => ({
  lines: lines(story).map((l) => [l.id, l.speaker, l.pick ?? null, Object.keys(l.variants ?? {}).sort()]),
  beats: Object.values(story.scenarios).flatMap((s) => s.beats.map((b) => [b.id, b.trigger])),
});

describe('story texts', () => {
  const uk = read('uk');
  for (const lang of ['de', 'en']) {
    const story = read(lang);
    it(`${lang} matches uk in ids, speakers, picks, variants and triggers`, () => {
      expect(shape(story)).toEqual(shape(uk));
    });
    it(`${lang} has no Ukrainian leftovers`, () => {
      const texts = lines(story).flatMap((l) => [l.text, ...Object.values(l.variants ?? {})]);
      for (const text of texts) expect(text, text).not.toMatch(/[Ѐ-ӿ]/);
    });
  }
});
