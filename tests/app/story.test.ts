import { describe, expect, it } from 'vitest';
import { beatLines, beatsFor, epilogueLine, introLines, outroLines, resolveLine, scenarioStory } from '../../src/app/story';
import { LANGS } from '../../src/rules/load';
import { loadContent } from '../../src/rules/load';
import type { GameEvent } from '../../src/rules/state';

const party = ['warden', 'rogue'];

describe('story texts in the game', () => {
  it('a hero line picks a party hero and its variant, the same for the same seed', () => {
    const line = scenarioStory('uk', 's1')!.intro.find((l) => l.speaker === 'hero')!;
    const a = resolveLine(line, party, 7)!;
    expect(party).toContain(a.speaker);
    expect(a.text).toBe(line.variants![a.speaker]);
    expect(resolveLine(line, party, 7)).toEqual(a);
    expect(resolveLine({ ...line, pick: 'actor' }, party, 7, 'rogue')?.speaker).toBe('rogue');
  });

  it('a line of a hero not in the party is left out', () => {
    expect(resolveLine({ id: 's1.x.1', speaker: 'tinker', text: 'Болт!' }, party, 1)).toBeNull();
    expect(resolveLine({ id: 's1.x.1', speaker: 'tinker', text: 'Болт!' }, ['tinker'], 1)?.text).toBe('Болт!');
  });

  it('modes: short trims, off shows nothing', () => {
    const story = scenarioStory('uk', 's1');
    const full = introLines(story, 'full', party, 1);
    expect(full.length).toBeGreaterThan(2);
    expect(introLines(story, 'short', party, 1)).toEqual(full.slice(0, 2));
    expect(introLines(story, 'off', party, 1)).toEqual([]);
    expect(outroLines(story, 'short', true, party, 1)).toHaveLength(1);
    expect(outroLines(story, 'full', false, party, 1).length).toBeGreaterThan(0);
    expect(epilogueLine(story, 'short', party, 1)?.speaker).toBe('marta');
    expect(epilogueLine(story, 'off', party, 1)).toBeNull();
  });

  it('beats fire once from engine events', () => {
    const story = scenarioStory('en', 's1');
    const fired = new Set<string>();
    const events: GameEvent[] = [
      { type: 'figureDied', figureId: 'monster:cellar-rat:2' },
      { type: 'roundStarted', round: 4 },
      { type: 'roomRevealed', roomId: 's1.wine-cellar' },
    ];
    expect(beatsFor(story, events, fired).map((b) => b.id)).toEqual(['s1.first-rat', 's1.upstairs', 's1.wine-cellar']);
    expect(beatsFor(story, [{ type: 'figureDied', figureId: 'monster:cellar-rat:3' }], fired)).toEqual([]);
    const cellar = story!.beats.find((b) => b.id === 's1.wine-cellar')!;
    expect(beatLines(cellar, 'full', ['warden'], 1).map((l) => l.speaker)).toEqual(['narrator']);
    expect(beatLines(cellar, 'off', party, 1)).toEqual([]);
  });

  it('every beat trigger names a room, monster or boss of its scenario', () => {
    const c = loadContent();
    for (const lang of LANGS)
      for (const id of ['s1', 's2', 's3', 's4', 's5']) {
        const scn = c.scenarios[id]!;
        for (const b of scenarioStory(lang, id)!.beats) {
          const { on, arg } = b.trigger;
          if (on === 'roomRevealed' || on === 'doorOpened') expect(scn.rooms.map((r) => r.id), b.id).toContain(arg);
          if (on === 'monsterKilled') expect(c.monsters[arg as string] ?? c.bosses[arg as string], b.id).toBeDefined();
          if (on === 'bossHalfHp') expect(c.bosses[arg as string], b.id).toBeDefined();
          if (on === 'round') expect(typeof arg).toBe('number');
        }
      }
  });
});
