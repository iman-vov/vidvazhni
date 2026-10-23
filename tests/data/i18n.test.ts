import { describe, expect, it } from 'vitest';
import { VARIANT_ORDER } from '../../src/rules/variants';
import { LANGS, loadContent, loadTranslations } from '../../src/rules/load';
import { allSteps } from './crossref';

const content = loadContent();
const tables = loadTranslations();
const keys = (lang: keyof typeof tables) => Object.keys(tables[lang]).sort();
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('uk, de and en have identical key sets', () => {
    expect(keys('de')).toEqual(keys('uk'));
    expect(keys('en')).toEqual(keys('uk'));
  });

  it('no text is empty and placeholders agree across languages', () => {
    for (const key of keys('uk')) {
      for (const lang of LANGS) expect(tables[lang][key], `${lang} ${key}`).toBeTruthy();
      const base = placeholders(tables.uk[key] as string);
      expect(placeholders(tables.de[key] as string), `de ${key}`).toEqual(base);
      expect(placeholders(tables.en[key] as string), `en ${key}`).toEqual(base);
    }
  });

  it('German and English differ from Ukrainian for card names (nothing left untranslated)', () => {
    for (const hero of Object.values(content.heroes))
      for (const card of hero.cards) {
        expect(tables.de[`card.${card.id}`]).not.toBe(tables.uk[`card.${card.id}`]);
        expect(tables.en[`card.${card.id}`]).not.toBe(tables.uk[`card.${card.id}`]);
      }
  });

  it('has a text for every content id', () => {
    const need: string[] = [];
    for (const hero of Object.values(content.heroes)) {
      need.push(`class.${hero.id}`, `class.${hero.id}.role`, `complexity.${hero.complexity}`);
      if (hero.summon) need.push(`summon.${hero.summon.id}`);
      for (const card of hero.cards) need.push(`card.${card.id}`);
    }
    for (const m of Object.values(content.monsters)) {
      need.push(`monster.${m.id}`, `deck.${m.deck}`);
      for (const card of m.forkCards ?? []) need.push(`monsterCard.${card.id}`);
      for (const t of m.traits ?? []) need.push(`trait.${t.trait}`);
    }
    for (const b of Object.values(content.bosses)) {
      need.push(`boss.${b.id}`);
      for (const sp of b.special ?? []) need.push(`boss.special.${sp}`);
    }
    for (const s of Object.values(content.scenarios)) {
      need.push(`scenario.${s.id}`, `scenario.${s.id}.goal`, `scenario.${s.id}.intro`, `scenario.${s.id}.outro`);
      need.push(`goal.type.${s.goal.type}`);
      for (const i of s.introduces) need.push(`introduces.${i}`);
      for (const room of s.rooms) {
        need.push(`room.${room.id}`);
        for (const chest of room.chests ?? []) if (chest.loot?.questItem) need.push(`questItem.${chest.loot.questItem}`);
      }
    }
    for (const i of Object.values(content.items ?? {})) need.push(`item.${i.id}`, `slot.${i.slot}`, `use.${i.use}`);
    for (const g of Object.values(content.battleGoals ?? {})) need.push(`goal.${g.id}`, `goal.${g.id}.text`);
    for (const p of Object.values(content.perks ?? {})) need.push(`perk.${p.id}`);
    for (const step of allSteps(content)) {
      if (step.type === 'special') need.push(`special.${step.name}`);
      if (step.type === 'condition') need.push(`condition.${step.condition}`);
    }
    for (const id of VARIANT_ORDER) need.push(`variant.${id}`, `variant.${id}.text`);

    const missing = need.filter((k) => !(k in tables.uk));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('has names for conditions, elements and orbs', () => {
    for (const c of ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle', 'invisible', 'strengthen'])
      expect(tables.uk[`condition.${c}`] && tables.uk[`condition.${c}.text`], c).toBeTruthy();
    for (const e of ['fire', 'ice', 'air', 'earth', 'light', 'dark'])
      expect(tables.uk[`element.${e}`] && tables.uk[`element.${e}.acc`], e).toBeTruthy();
    for (const o of ['fire', 'earth', 'air']) expect(tables.uk[`orb.${o}`] && tables.uk[`orb.${o}.acc`], o).toBeTruthy();
    expect(tables.uk['orb.air']).toBe('Вітер');
  });

  it('forkName keys belong to cards that have a fork version', () => {
    for (const key of keys('uk').filter((k) => k.endsWith('.forkName'))) {
      const id = key.replace(/^card\./, '').replace(/\.forkName$/, '');
      const card = content.heroes[id.split('.')[0] as string]?.cards.find((c) => c.id === id);
      expect(card?.fork?.top || card?.fork?.bottom, key).toBeTruthy();
    }
  });

  it('has step templates and the debug-mode UI strings', () => {
    const stepTypes = [
      'move', 'attack', 'heal', 'shield', 'retaliate', 'provoke', 'bless', 'push', 'pull', 'infuse', 'consume',
      'loot', 'summon', 'trap', 'teleport', 'range', 'targets', 'pierce', 'jump', 'fly', 'xp', 'then',
    ];
    for (const t of stepTypes) expect(tables.uk[`step.${t}`], `step.${t}`).toBeTruthy();
    for (const k of ['selectCards', 'longRest', 'shortRest', 'endTurn', 'skip', 'undo', 'log'])
      expect(tables.uk[`ui.${k}`], `ui.${k}`).toBeTruthy();
    expect(tables.uk['step.attack']).toBe('Атака {value}');
  });
});
