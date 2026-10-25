// Tutorial: the map is valid and stays out of the normal content, the fixed seed makes the guided
// first turn friendly (+1, a rat dies), the coach steps come in order while the player follows
// them, the scenario can be won, and the device remembers the tutorial.

import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/game';
import { CoachScript, SCRIPT, SEL, TIPS, type ScreenProbe } from '../../src/app/tutorial/steps';
import { TUTORIAL_ID, TUTORIAL_SEED, tutorialContent, tutorialPlayers, tutorialSetup, tutorialStorage } from '../../src/app/tutorial/scenario';
import { saveTutorialProgress, shouldOfferTutorial, tutorialProgress } from '../../src/app/tutorial/screens';
import { gameStorage, memoryStore } from '../../src/app/storage';
import { loadContent } from '../../src/rules/load';
import type { Action, GameEvent } from '../../src/rules/state';
import { t } from '../../src/ui/i18n';
import { chooseAction } from '../replay/bot';

const HERO = 'hero:warden';

/** A screen probe answering from a set of selectors that are «on screen». */
function fakeScreen() {
  const on = new Map<string, number>();
  const probe: ScreenProbe = { has: (s) => (on.get(s) ?? 0) > 0, count: (s) => on.get(s) ?? 0 };
  return { probe, set: (s: string, n = 1) => on.set(s, n), clear: () => on.clear() };
}

function coachRun() {
  const content = tutorialContent();
  const g = GameController.start(tutorialSetup(), tutorialPlayers('A'), null, content);
  const script = new CoachScript();
  const screen = fakeScreen();
  const events: GameEvent[] = [];
  let latest: GameEvent[] = [];
  const shown: string[] = [];
  const look = () => {
    const v = script.update({ s: g.state, heroId: HERO, events, latest, screen: screen.probe });
    if (v && shown[shown.length - 1] !== v.step.id) shown.push(v.step.id);
    return v;
  };
  /** Acknowledges every info step / tip on screen now. */
  const ackAll = () => {
    for (let i = 0; i < 20; i++) {
      const v = look();
      if (!v?.step.info) return v;
      script.ack(v.step.id);
    }
    return look();
  };
  const act = (a: Action) => {
    const r = g.act(a);
    expect(r.ok, `${JSON.stringify(a)} ${r.error ?? ''}`).toBe(true);
    events.push(...r.events);
    latest = r.events;
    return r;
  };
  return { g, content, script, screen, look, ackAll, act, shown, events };
}

describe('tutorial scenario', () => {
  it('the map validates against the scenario schema (number 0 allowed)', () => {
    const schema = JSON.parse(readFileSync('data/schema/scenarios.schema.json', 'utf8'));
    // The tutorial is scenario 0 (no number in the intro title); the schema starts campaign numbers at 1.
    schema.properties.number.minimum = 0;
    const map = JSON.parse(readFileSync('data/tutorial/s0-tutorial.json', 'utf8'));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(validate(map), JSON.stringify(validate.errors)).toBe(true);
    expect(map.id).toBe(TUTORIAL_ID);
  });

  it('lives only in its own copy of the content', () => {
    expect(loadContent().scenarios[TUTORIAL_ID]).toBeUndefined();
    expect(tutorialContent().scenarios[TUTORIAL_ID]).toBeTruthy();
    expect(Object.keys(tutorialContent().scenarios)).toEqual([...Object.keys(loadContent().scenarios), TUTORIAL_ID]);
  });

  it('has names for its scenario and rooms in every language', () => {
    for (const key of ['scenario.s0', 'scenario.s0.goal', 'scenario.s0.intro', 'scenario.s0.outro', 'room.s0.yard', 'room.s0.cellar']) expect(t(key)).not.toBe(key);
    for (const step of [...SCRIPT, ...TIPS]) {
      expect(t(`tutorial.step.${step.id}.title`)).not.toContain('tutorial.step');
      expect(t(`tutorial.step.${step.id}.text`)).not.toContain('tutorial.step');
    }
  });

  it('one Warden under the full fork rules with the fixed seed', () => {
    const s = tutorialSetup();
    expect(s.seed).toBe(TUTORIAL_SEED);
    expect(s.heroes.map((x) => x.classId)).toEqual(['warden']);
    expect(Object.values(s.variants).every(Boolean)).toBe(true);
  });
});

describe('tutorial coach', () => {
  it('guides the first round step by step and the seed is friendly', () => {
    const r = coachRun();
    const { screen, look, ackAll, act, script } = r;
    screen.set(SEL.introOpen);
    expect(look()?.step.id).toBe('welcome');
    script.ack('welcome');
    expect(look()?.step.id).toBe('intro');
    screen.clear();
    screen.set(SEL.curtain);
    expect(look()?.step.id).toBe('curtain');
    screen.clear();
    expect(look()?.step.id).toBe('hand');
    screen.set(SEL.picked, 2);
    screen.set(SEL.leadingSet);
    expect(look()?.step.id).toBe('leading');
    script.ack('leading');
    expect(look()?.step.id).toBe('ready');
    act({ type: 'selectCards', heroId: HERO, cards: ['warden.shield-bash', 'warden.earth-strike'], leading: 'warden.shield-bash' });
    screen.clear();
    expect(r.g.state.pending?.kind).toBe('heroTurn');
    expect(look()?.step.id).toBe('order');
    script.ack('order');
    expect(look()?.step.id).toBe('die');
    script.ack('die');
    expect(look()?.step.id).toBe('plan');
    script.ack('plan');
    expect(look()?.step.id).toBe('halfMove');

    act({ type: 'startHalf', heroId: HERO, cardId: 'warden.shield-bash', half: 'bottom' });
    const hex = look();
    expect(hex?.step.id).toBe('hex');
    expect(hex?.step.target?.({ s: r.g.state, heroId: HERO, events: [], latest: [], screen: screen.probe, acked: script.acked })).toEqual({ hex: [2, 0] });
    const move = r.g.legalOf('resolveStep').find((a) => JSON.stringify(a.choice).endsWith('[2,0]]}'));
    expect(move).toBeTruthy();
    act(move as Action);
    // Momentum from the first lightning card comes up as a tip before the script goes on.
    expect(ackAll()?.step.id).toBe('halfAttack');

    act({ type: 'startHalf', heroId: HERO, cardId: 'warden.earth-strike', half: 'top' });
    expect(look()?.step.id).toBe('target');
    const hit = act(r.g.legalOf('resolveStep').find((a) => JSON.stringify(a.choice).includes('cellar-rat:1')) as Action);
    const attacked = hit.events.find((e) => e.type === 'attacked');
    expect(attacked && attacked.type === 'attacked' ? attacked.chosen : '').toBe('+1');
    expect(r.g.state.figures['monster:cellar-rat:1']).toBeUndefined();
    // Earth Strike's second step (infuse Earth) needs only a confirmation.
    expect(look()?.step.id).toBe('infuse');
    while (r.g.state.pending?.kind === 'stepChoice') act(r.g.legalOf('resolveStep')[0] ?? { type: 'skipStep' });
    expect(look()?.step.id).toBe('modifier');
    expect(look()?.step.params?.({ s: r.g.state, heroId: HERO, events: r.events, latest: [], screen: screen.probe, acked: script.acked })).toEqual({ mod: '+1', damage: 4 });
    expect(ackAll()?.step.id).toBe('endTurn');

    act({ type: 'endTurn', heroId: HERO });
    // The other rat bites: the «avoid damage» window is explained.
    expect(r.g.state.pending?.kind).toBe('avoidDamage');
    expect(ackAll()?.step.id).toBe('avoid');
    act({ type: 'avoidDamage', heroId: HERO, choice: { kind: 'take' } });
    while (r.g.state.pending?.kind === 'avoidDamage') act({ type: 'avoidDamage', heroId: HERO, choice: { kind: 'take' } });
    expect(r.g.state.pending?.kind).toBe('endOfRound');
    expect(ackAll()?.step.id).toBe('shortRest');
    act({ type: 'shortRest', heroId: HERO, rest: false });
    expect(ackAll()?.step.id).toBe('round2');

    for (const id of ['welcome', 'intro', 'curtain', 'hand', 'leading', 'ready', 'order', 'die', 'plan', 'halfMove', 'hex', 'halfAttack', 'target', 'infuse', 'endTurn', 'round2'])
      expect(r.shown, id).toContain(id);
    for (const id of ['momentum', 'orb', 'modifier', 'monsters', 'avoid', 'shortRest']) expect(r.shown, id).toContain(id);
    expect(r.shown.indexOf('hex')).toBeLessThan(r.shown.indexOf('halfAttack'));
  });

  it('skips steps the player passed by doing something else', () => {
    const r = coachRun();
    r.script.ack('welcome');
    r.act({ type: 'selectCards', heroId: HERO, cards: ['warden.iron-wall', 'warden.ram'], leading: 'warden.iron-wall' });
    // Cards chosen without the hand/leading steps: the coach moves on to the turn.
    const v = r.ackAll();
    expect(['halfMove', 'avoid', 'modifier', 'monsters']).toContain(v?.step.id);
    expect(r.script.position).toBeGreaterThan(SCRIPT.findIndex((x) => x.id === 'ready'));
  });

  it('a bot following the engine wins the tutorial', () => {
    const r = coachRun();
    let n = 0;
    while (!r.g.over && n++ < 600) {
      r.act(towardsDoor(r.g) ?? chooseAction(r.g.state, r.content));
      r.ackAll();
    }
    expect(r.shown).toContain('openDoor');
    expect(r.g.state.phase).toBe('won');
    expect(r.g.state.round).toBeLessThan(15);
  }, 60_000);
});

/** The greedy bot does not walk onto a door on its own: with the yard empty, play a move to the door
 *  (what the coach's «open the door» tip asks the player to do). */
function towardsDoor(g: GameController): Action | null {
  const s = g.state;
  if (Object.values(s.figures).some((f) => f.kind === 'monster')) return null;
  const p = s.pending;
  if (p?.kind === 'heroTurn' && !s.half) return g.legalOf('startHalf').find((a) => a.half === 'bottom') ?? null;
  if (p?.kind === 'stepChoice' && p.step.type === 'move') {
    const moves = g.legalOf('resolveStep');
    const dist = (a: Action) => {
      const path = a.type === 'resolveStep' && 'path' in a.choice ? (a.choice.path as [number, number][]) : [];
      const end = path[path.length - 1] ?? [9, 9];
      return Math.abs(end[0] - 3) + Math.abs(end[1] - 1) + Math.abs(end[0] + end[1] - 4);
    };
    return [...moves].sort((a, b) => dist(a) - dist(b))[0] ?? null;
  }
  return null;
}

describe('tutorial progress', () => {
  it('autosaves under its own key and resumes', () => {
    const kv = memoryStore();
    const g = GameController.start(tutorialSetup(), tutorialPlayers('A'), tutorialStorage(kv), tutorialContent());
    g.act({ type: 'selectCards', heroId: HERO, cards: ['warden.shield-bash', 'warden.earth-strike'], leading: 'warden.shield-bash' });
    g.markHint('tutorial.welcome');
    expect(gameStorage(kv).load()).toBeNull();
    const saved = tutorialStorage(kv).load();
    expect(saved?.actions.length).toBe(1);
    const again = GameController.restore(saved!, tutorialStorage(kv), tutorialContent());
    expect(again.restoreError).toBeNull();
    expect(again.state.pending?.kind).toBe(g.state.pending?.kind);
    expect(again.meta.seenHints).toContain('tutorial.welcome');
  });

  it('is offered until played or turned down', () => {
    const kv = memoryStore();
    expect(shouldOfferTutorial(kv)).toBe(true);
    saveTutorialProgress({ dismissed: true }, kv);
    expect(shouldOfferTutorial(kv)).toBe(false);
    expect(tutorialProgress(kv)).toEqual({ done: false, dismissed: true });
    const kv2 = memoryStore();
    saveTutorialProgress({ done: true }, kv2);
    expect(shouldOfferTutorial(kv2)).toBe(false);
  });
});
