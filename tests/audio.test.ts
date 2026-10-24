import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIO, eventCues, locationAmbient, locationTrack, sizeOf, stepCues } from '../src/audio/cues';
import { BEATS_PER_BAR, MOTIF_BARS, motifDuration, motifNotes } from '../src/audio/motif';
import { SYNTHS } from '../src/audio/synth';
import type { AnimStep } from '../src/render/animPlan';

const MOTIF_VARIANTS = ['full', 'camp', 'victory'];

const env = readdirSync('data/environments').map((f) => f.replace('.json', ''));

describe('data/audio.json', () => {
  it('every sound is a file or a known synth recipe', () => {
    for (const [id, s] of Object.entries(AUDIO.sounds)) {
      expect(!!s.files?.length !== !!s.synth, id).toBe(true);
      if (s.synth) expect(SYNTHS[s.synth], s.synth).toBeDefined();
    }
  });

  it('every location has an ambient bed or the default one', () => {
    expect(AUDIO.ambient.default).toBeDefined();
    for (const id of env) expect(locationAmbient(id), id).toBeDefined();
  });

  it('every sound and track file exists in public/audio', () => {
    for (const s of Object.values(AUDIO.sounds)) for (const f of s.files ?? []) expect(existsSync(`public/audio/${f}`), f).toBe(true);
    for (const m of Object.values(AUDIO.music)) expect(existsSync(`public/audio/${m.file}`), m.file).toBe(true);
  });

  it('events and UI name known sounds; screens, locations and stingers name known tracks', () => {
    for (const id of [...Object.values(AUDIO.events), ...Object.values(AUDIO.ui)]) expect(AUDIO.sounds[id], id).toBeDefined();
    for (const id of [...Object.values(AUDIO.screens), ...Object.values(AUDIO.locations), AUDIO.battle, AUDIO.stingers.victory, AUDIO.stingers.defeat]) {
      if (id.startsWith('motif:')) expect(MOTIF_VARIANTS, id).toContain(id.slice(6));
      else expect(AUDIO.music[id], id).toBeDefined();
    }
    for (const v of Object.values(AUDIO.intros)) expect(MOTIF_VARIANTS).toContain(v);
  });

  it('every location has its music', () => {
    for (const id of env) expect(AUDIO.locations[id], id).toBeDefined();
    expect(locationTrack('nowhere')).toBe(AUDIO.locations.default);
  });

  it('death sounds by creature size', () => {
    expect(sizeOf('monster:cellar-rat:1')).toBe('small');
    expect(sizeOf('monster:hammerfist:1')).toBe('large');
    expect(sizeOf('hero:warden')).toBe('medium');
    const death = (figureId: string): AnimStep => ({ kind: 'death', figureId, fog: true, wait: 1, duration: 1 });
    expect(stepCues(death('monster:cellar-rat:2'))[0]?.sound).toBe('die-small');
    expect(stepCues(death('monster:stone-sentinel:1'))[0]?.sound).toBe('die-large');
  });
});

describe('cues', () => {
  const attack = (damage: number, shield: number, label: 'miss' | null = null): AnimStep => ({ kind: 'attack', attackerId: 'hero:warden', targetId: 'monster:cellar-rat:1', ranged: false, range: 1, label, shield, damage, impact: 0.6, wait: 0.7, duration: 1 });

  it('an attack sounds at the impact: hit, blocked by a shield or a miss; twice as early at 2×', () => {
    expect(stepCues(attack(2, 0))).toEqual([{ sound: 'hit', delay: 0.6 }]);
    expect(stepCues(attack(0, 2))[0]?.sound).toBe('shield');
    expect(stepCues(attack(0, 0, 'miss'))[0]?.sound).toBe('miss');
    expect(stepCues(attack(2, 0), 2)[0]?.delay).toBeCloseTo(0.3);
  });

  it('the damage right after a heard hit stays quiet; other damage sounds', () => {
    const dmg: AnimStep = { kind: 'damage', figureId: 'monster:cellar-rat:1', amount: 2, source: 'hero:warden', wait: 0.2, duration: 1 };
    expect(stepCues(dmg, 1, 'monster:cellar-rat:1')).toEqual([]);
    expect(stepCues(dmg, 1, null)[0]?.sound).toBe('hurt');
  });

  it('a walk steps once per hex', () => {
    const walk: AnimStep = { kind: 'walk', figureId: 'hero:warden', path: [[0, 0], [1, 0], [2, 0], [3, 0]], wait: 0.9, duration: 1.1 };
    expect(stepCues(walk).map((c) => c.sound)).toEqual(['step', 'step', 'step']);
  });

  it('events without an animation sound at once (dice, levers, broken objects)', () => {
    expect(eventCues({ type: 'initiativeRolled', rolls: [] })[0]?.sound).toBe('dice');
    expect(eventCues({ type: 'objectChanged', objectId: 'x', hex: [0, 0], state: 'pulled' })[0]?.sound).toBe('lever');
    expect(eventCues({ type: 'objectChanged', objectId: 'x', hex: [0, 0], state: 'destroyed' })[0]?.sound).toBe('break');
    expect(eventCues({ type: 'moved', figureId: 'hero:warden', path: [] })).toEqual([]);
  });
});

describe('the Lantern theme', () => {
  it('eight bars of 3/4 in D major, ending home on D', () => {
    expect(MOTIF_BARS).toBe(8);
    const full = motifNotes('full');
    const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
    for (const n of full) expect(D_MAJOR, String(n.midi)).toContain(n.midi % 12);
    expect(full.at(-1)?.midi).toBe(62);
    const beat = 60 / 112;
    const bars = full.at(-1)!.at / beat / BEATS_PER_BAR;
    expect(bars).toBeCloseTo(7);
  });

  it('the victory stinger is the answering half, shorter than the menu tune', () => {
    expect(motifNotes('victory')[0]?.midi).toBe(66);
    expect(motifDuration('victory')).toBeLessThan(motifDuration('full'));
    expect(motifDuration('victory')).toBeLessThan(7);
  });
});
