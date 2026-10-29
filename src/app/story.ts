// Story texts (data/story/{uk,de,en}.json, docs/design/story.md): the intro before a scenario,
// beats during the battle triggered by engine events, the victory/defeat outro and Marta's
// epilogue in the camp. No DOM here, so it is tested in node; the screens only show the lines.
//
// «Сюжет»: `full` = every line; `short` = the intro's first two lines, the first line of each
// beat and of the outro, plus the epilogue; `off` = nothing (the end screen keeps its old text).

import uk from '../../data/story/uk.json';
import de from '../../data/story/de.json';
import en from '../../data/story/en.json';
import type { Lang } from '../rules/load';
import type { FigureId, GameEvent } from '../rules/state';

export type StoryMode = 'full' | 'short' | 'off';
export const STORY_MODES: readonly StoryMode[] = ['full', 'short', 'off'];

/** Off-board voices; a hero speaks by its class id. */
export type NpcId = 'narrator' | 'marta' | 'miller' | 'bruno' | 'shadowhand' | 'lina' | 'theo' | 'flip' | 'hammerfist' | 'ferryman' | 'heron' | 'mist-queen' | 'ida' | 'glass-guardian';

export interface StoryLineDef {
  id: string;
  speaker: string;
  pick?: 'random' | 'actor';
  text: string;
  variants?: Record<string, string>;
}

export interface StoryTrigger {
  on: 'roomRevealed' | 'doorOpened' | 'round' | 'bossHalfHp' | 'monsterKilled';
  arg: string | number;
}

export interface StoryBeatDef {
  id: string;
  trigger: StoryTrigger;
  lines: StoryLineDef[];
}

export interface ScenarioStory {
  intro: StoryLineDef[];
  beats: StoryBeatDef[];
  outro: { victory: StoryLineDef[]; defeat: StoryLineDef[] };
  epilogue: StoryLineDef;
}

/** A line ready to show: who speaks (`narrator`, `marta`, … or a hero class id) and what. */
export interface StoryLine {
  id: string;
  speaker: string;
  text: string;
}

const TABLES = { uk, de, en } as unknown as Record<Lang, { scenarios: Record<string, ScenarioStory> }>;

export function scenarioStory(lang: Lang, scenarioId: string): ScenarioStory | null {
  return TABLES[lang]?.scenarios[scenarioId] ?? TABLES.uk.scenarios[scenarioId] ?? null;
}

/** Monsters that speak as an NPC when they stand on the board. */
export const NPC_FIGURES: Partial<Record<string, string>> = { miller: 'bog-miller', shadowhand: 'shadowhand', hammerfist: 'hammerfist' };

const NPC_IDS: readonly string[] = ['narrator', 'marta', 'miller', 'bruno', 'shadowhand', 'lina', 'theo', 'flip', 'hammerfist', 'ferryman', 'heron', 'mist-queen', 'ida', 'glass-guardian'] satisfies NpcId[];

export const isHeroSpeaker = (speaker: string): boolean => ![...NPC_IDS, 'hero'].includes(speaker);

/** A small stable hash (FNV-1a): the same seed and line always pick the same hero. */
function hash(text: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 0x01000193);
  return x >>> 0;
}

/** The line as it plays for this party, or null when its hero is not there. `party` = hero class
 *  ids; `actor` = the class of the hero who caused the beat (`pick: actor`), else a seeded pick. */
export function resolveLine(line: StoryLineDef, party: readonly string[], seed: number, actor?: string | null): StoryLine | null {
  if (line.speaker === 'hero') {
    if (!party.length) return null;
    const who = line.pick === 'actor' && actor && party.includes(actor) ? actor : party[hash(`${seed}:${line.id}`) % party.length]!;
    return { id: line.id, speaker: who, text: line.variants?.[who] ?? line.text };
  }
  if (isHeroSpeaker(line.speaker) && !party.includes(line.speaker)) return null;
  return { id: line.id, speaker: line.speaker, text: line.text };
}

function lines(defs: readonly StoryLineDef[], party: readonly string[], seed: number, actor?: string | null): StoryLine[] {
  return defs.map((l) => resolveLine(l, party, seed, actor)).filter((l): l is StoryLine => l !== null);
}

export function introLines(story: ScenarioStory | null, mode: StoryMode, party: readonly string[], seed: number): StoryLine[] {
  if (!story || mode === 'off') return [];
  const all = lines(story.intro, party, seed);
  return mode === 'short' ? all.slice(0, 2) : all;
}

export function outroLines(story: ScenarioStory | null, mode: StoryMode, won: boolean, party: readonly string[], seed: number): StoryLine[] {
  if (!story || mode === 'off') return [];
  const all = lines(won ? story.outro.victory : story.outro.defeat, party, seed);
  return mode === 'short' ? all.slice(0, 1) : all;
}

export function epilogueLine(story: ScenarioStory | null, mode: StoryMode, party: readonly string[], seed: number): StoryLine | null {
  if (!story || mode === 'off') return null;
  return resolveLine(story.epilogue, party, seed);
}

/** Monster type of a figure id (`monster:cellar-rat:3` → `cellar-rat`). */
const typeOf = (figureId: FigureId): string | null => (figureId.startsWith('monster:') ? (figureId.split(':')[1] ?? null) : null);

function matches(t: StoryTrigger, e: GameEvent): boolean {
  switch (t.on) {
    case 'roomRevealed':
    case 'doorOpened':
      return e.type === 'roomRevealed' && e.roomId === t.arg;
    case 'round':
      return e.type === 'roundStarted' && e.round === t.arg;
    case 'monsterKilled':
      return e.type === 'figureDied' && typeOf(e.figureId) === t.arg;
    case 'bossHalfHp':
      return e.type === 'bossHalfHp' && typeOf(e.figureId) === t.arg;
  }
}

/** Beats the events trigger, each once per scenario: `fired` holds the ids already played and is
 *  updated. A `doorOpened` beat plays before a `roomRevealed` one of the same room. */
export function beatsFor(story: ScenarioStory | null, events: readonly GameEvent[], fired: Set<string>): StoryBeatDef[] {
  if (!story) return [];
  const out: StoryBeatDef[] = [];
  for (const e of events) {
    const due = story.beats.filter((b) => !fired.has(b.id) && matches(b.trigger, e));
    due.sort((a, b) => Number(b.trigger.on === 'doorOpened') - Number(a.trigger.on === 'doorOpened'));
    for (const b of due) {
      fired.add(b.id);
      out.push(b);
    }
  }
  return out;
}

export function beatLines(beat: StoryBeatDef, mode: StoryMode, party: readonly string[], seed: number, actor?: string | null): StoryLine[] {
  if (mode === 'off') return [];
  const all = lines(beat.lines, party, seed, actor);
  return mode === 'short' ? all.slice(0, 1) : all;
}
