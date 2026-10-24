// Rules reference: texts in data/help for every topic in all three languages, valid icons and
// links, diagrams that render, search, and the maps from icons / rule hints / card words to topics.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_IDS, diagramSvg } from '../../src/app/help/diagrams';
import { searchTopics } from '../../src/app/help/helpView';
import { HELP_TEXTS } from '../../src/app/help/texts';
import { CONDITIONS, TOPICS, topicById, topicForHint, topicForIcon, visibleTopics } from '../../src/app/help/topics';
import { loadTranslations } from '../../src/rules/load';
import { ICON_NAMES, isIconName } from '../../src/ui/icons/names';

const langs = ['uk', 'de', 'en'] as const;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const iconRefs = (text: string) => [...text.matchAll(/\{icon:([a-z-]+)\}/g)].map((m) => m[1] as string);

describe('help texts', () => {
  it('uk, de and en have the same keys, none empty, same placeholders', () => {
    const uk = Object.keys(HELP_TEXTS.uk).sort();
    for (const l of langs) {
      expect(Object.keys(HELP_TEXTS[l]).sort(), l).toEqual(uk);
      for (const k of uk) {
        const text = (HELP_TEXTS[l] as Record<string, string>)[k] as string;
        expect(text, `${l} ${k}`).toBeTruthy();
        expect(placeholders(text), `${l} ${k}`).toEqual(placeholders((HELP_TEXTS.uk as Record<string, string>)[k] as string));
      }
    }
  });

  it('does not reuse keys of data/i18n and is merged into the translation tables', () => {
    const tables = loadTranslations();
    for (const l of langs) {
      const game = JSON.parse(readFileSync(`data/i18n/${l}.json`, 'utf8')) as Record<string, string>;
      for (const [k, v] of Object.entries(HELP_TEXTS[l])) {
        expect(k in game, `${l} ${k}`).toBe(false);
        expect(tables[l][k]).toBe(v);
      }
    }
  });

  it('every topic has a title, a short text and a body in every language', () => {
    for (const x of TOPICS)
      for (const l of langs)
        for (const part of ['title', 'short', 'body'])
          expect((HELP_TEXTS[l] as Record<string, string>)[`help.${x.id}.${part}`], `${l} ${x.id}.${part}`).toBeTruthy();
  });

  it('icon placeholders name real icons, German and English differ from Ukrainian', () => {
    for (const l of langs)
      for (const [k, text] of Object.entries(HELP_TEXTS[l])) for (const name of iconRefs(text)) expect(isIconName(name), `${l} ${k}: ${name}`).toBe(true);
    for (const x of TOPICS) {
      expect((HELP_TEXTS.de as Record<string, string>)[`help.${x.id}.body`]).not.toBe((HELP_TEXTS.uk as Record<string, string>)[`help.${x.id}.body`]);
      expect((HELP_TEXTS.en as Record<string, string>)[`help.${x.id}.body`]).not.toBe((HELP_TEXTS.uk as Record<string, string>)[`help.${x.id}.body`]);
    }
  });

  it('has no emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const l of langs) for (const [k, text] of Object.entries(HELP_TEXTS[l])) expect(emoji.test(text), `${l} ${k}`).toBe(false);
  });
});

describe('help topics', () => {
  it('ids are unique, icons exist, related topics exist and differ from the topic', () => {
    const ids = TOPICS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of TOPICS) {
      expect(isIconName(x.icon), x.id).toBe(true);
      for (const r of x.related) {
        expect(topicById(r), `${x.id} → ${r}`).toBeTruthy();
        expect(r).not.toBe(x.id);
      }
    }
  });

  it('covers the rules the reference promises', () => {
    const need = ['round', 'cards', 'halves', 'initiative', 'move', 'terrain', 'attack', 'modifiers', 'bless', 'curse', 'shield', 'pierce', 'retaliate', 'push', 'orbs', 'elements', 'momentum', 'followUp', 'revive', 'loss', 'discard', 'rest', 'exhaustion', 'items', 'doors', 'monsters', 'intents', 'goals', 'levels', ...CONDITIONS];
    for (const id of need) expect(topicById(id), id).toBeTruthy();
  });

  it('fork topics hide under the base rules, the elements topic under the orbs', () => {
    const base = visibleTopics({ orbs: false, fork: false }).map((x) => x.id);
    const fork = visibleTopics({ orbs: true, fork: true }).map((x) => x.id);
    expect(base).toContain('elements');
    expect(base).not.toContain('orbs');
    expect(base).not.toContain('momentum');
    expect(fork).toContain('orbs');
    expect(fork).not.toContain('elements');
    expect(visibleTopics(null).length).toBe(TOPICS.length);
  });

  it('every diagram renders as one svg', () => {
    for (const id of DIAGRAM_IDS) {
      const svg = diagramSvg(id);
      expect(svg.startsWith('<svg'), id).toBe(true);
      expect(svg).not.toContain('help.diagram');
    }
    for (const x of TOPICS) if (x.diagram) expect(DIAGRAM_IDS).toContain(x.diagram);
  });

  it('icons, rule hints and conditions lead to existing topics', () => {
    for (const name of ICON_NAMES) {
      const id = topicForIcon(name);
      if (id) expect(topicById(id), name).toBeTruthy();
    }
    expect(topicForIcon('fire', false)).toBe('elements');
    expect(topicForIcon('fire', true)).toBe('orbs');
    for (const c of CONDITIONS) expect(topicForHint(`condition.${c}`)).toBe(c);
    for (const key of ['elements', 'orbs', 'trap', 'modifiers', 'rooms', 'downed', 'momentum', 'initiative', 'shield', 'loot', 'avoidDamage', 'shortRest', 'longRest', 'followUp', 'retaliate', 'push', 'bless', 'curse', 'surge', 'items', 'exhaustion'])
      expect(topicById(topicForHint(key) ?? ''), key).toBeTruthy();
  });

  it('search finds topics by title and text', () => {
    expect(searchTopics('отрута', TOPICS)[0]?.id).toBe('poison');
    expect(searchTopics('відпочинок', TOPICS).map((x) => x.id)).toContain('rest');
    expect(searchTopics('пробиття щит', TOPICS).map((x) => x.id)).toContain('pierce');
    expect(searchTopics('', TOPICS).length).toBe(TOPICS.length);
    expect(searchTopics('жирафа', TOPICS)).toEqual([]);
  });
});
