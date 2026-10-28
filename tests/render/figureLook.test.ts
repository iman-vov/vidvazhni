import { describe, expect, it } from 'vitest';
import { DEFAULT_HEIGHT, ELITE_SCALE, figureHeight, lookOf, modelIdOf, modelScale, RESTYLES } from '../../src/render/figureLook';
import { loadContent } from '../../src/rules/load';
import type { HeroState, MonsterState, SummonState } from '../../src/rules/state';

const content = loadContent();

function monster(typeId: string, rank: MonsterState['rank'] = 'normal', number = 3): MonsterState {
  return { id: `monster:${typeId}:${number}`, kind: 'monster', typeId, rank, number, hex: [0, 0], hp: 3, maxHp: 3, conditions: {}, shields: [], retaliates: [], turnCount: 0, attackedBy: [] };
}

function hero(classId: string): HeroState {
  return { id: `hero:${classId}`, kind: 'hero', classId } as HeroState;
}

describe('figure scale table', () => {
  it('small creatures stand lower than heroes, bosses higher', () => {
    const warden = figureHeight('warden', 'hero');
    expect(figureHeight('gremlin', 'monster')).toBeLessThan(warden);
    expect(figureHeight('cellar-rat', 'monster')).toBeLessThan(figureHeight('gremlin', 'monster'));
    expect(figureHeight('bog-miller', 'boss')).toBeGreaterThan(warden);
    expect(figureHeight('shadowhand', 'boss')).toBeGreaterThan(warden);
  });

  it('elites are a bit taller; unknown models use the kind default', () => {
    expect(figureHeight('gremlin', 'elite')).toBeCloseTo(figureHeight('gremlin', 'monster') * ELITE_SCALE);
    expect(figureHeight('new-thing', 'boss')).toBe(DEFAULT_HEIGHT.boss);
  });

  it('modelScale brings a 1.7 m Meshy rig to the board height', () => {
    expect(modelScale(0.85, 1.7)).toBeCloseTo(0.5);
    expect(modelScale(1, 0)).toBe(1);
  });
});

describe('lookOf', () => {
  it('uses the class id for heroes and the file name from monster data', () => {
    expect(modelIdOf(hero('warden'))).toBe('warden');
    // data/monsters/*.json give `model` as a path: assets/models/cellar-rat.glb
    expect(modelIdOf(monster('cellar-rat'), content)).toBe('cellar-rat');
    expect(modelIdOf(monster('gremlin'))).toBe('gremlin');
    const summon = { id: 'summon:tinker.button', kind: 'summon', summonId: 'tinker.button' } as SummonState;
    expect(modelIdOf(summon)).toBe('tinker-button');
  });

  it('gives elites the gold colour, standee numbers to monsters, weapons and projectiles from the table', () => {
    const elite = lookOf(monster('gremlin', 'elite', 4), content);
    expect(elite.kind).toBe('elite');
    expect(elite.number).toBe(4);
    expect(elite.weapons).toEqual(['gremlin-slingshot']);
    expect(elite.projectile).toBe('stone');
    const archer = lookOf(hero('wind-archer'), content);
    expect(archer.weapons).toEqual(['wind-archer-bow']);
    expect(archer.projectile).toBe('arrow');
    expect(archer.attackYaw).toBeLessThan(0);
    expect(archer.number).toBeNull();
    expect(lookOf(hero('warden')).color).not.toBe(lookOf(hero('rogue')).color);
  });

  it('every hero class and monster type in the content has a look', () => {
    for (const id of Object.keys(content.heroes)) expect(lookOf(hero(id), content).initial).toMatch(/^[A-Z]{1,2}$/);
    for (const id of Object.keys(content.monsters)) expect(lookOf(monster(id), content).height).toBeGreaterThan(0.3);
  });
});

describe('restyled monsters (no Meshy model yet)', () => {
  it('use an existing model at their own scale and keep their own look id', () => {
    const automaton = lookOf(monster('brass-automaton'), content);
    expect(automaton.modelId).toBe('stone-sentinel');
    expect(automaton.restyleId).toBe('brass-automaton');
    expect(automaton.height).toBeCloseTo(figureHeight('stone-sentinel', 'monster') * 0.8);
    const queen = lookOf(monster('mist-queen', 'boss'), content);
    expect(queen.modelId).toBe('night-moth');
    expect(queen.flying).toBe(true);
    expect(lookOf(monster('stone-sentinel'), content).restyleId).toBeUndefined();
  });

  it('every restyle is a known monster or boss and builds on a model with a height', () => {
    for (const [id, r] of Object.entries(RESTYLES)) {
      expect(content.monsters[id] ?? content.bosses[id]).toBeDefined();
      expect(figureHeight(r.model, 'monster')).toBeGreaterThan(0.3);
    }
  });
});
