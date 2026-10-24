// «Ліхтарик», the game's own theme: eight bars in 3/4, D major, a folk waltz (original, composed
// for «Відважні»). Note data here; `playMotif` plays it on a small pluck synth: in full on the
// menu, its first phrase slower and softer in the camp, its second half as the victory stinger,
// its opening when a hero levels up.

import { pluck, tone, type SynthOut } from './synth';

/** [midi, start beat, length in beats] */
type N = [number, number, number];

/** The tune: phrase A (bars 1–4) asks, phrase B (bars 5–8) answers home to D. */
const MELODY: N[] = [
  [69, 0, 1], [74, 1, 1], [73, 2, 0.5], [71, 2.5, 0.5],
  [69, 3, 1.5], [66, 4.5, 0.5], [69, 5, 1],
  [67, 6, 1], [71, 7, 1], [69, 8, 0.5], [67, 8.5, 0.5],
  [66, 9, 2], [64, 11, 1],
  [66, 12, 1], [69, 13, 1], [74, 14, 1],
  [76, 15, 1.5], [74, 16.5, 0.5], [71, 17, 1],
  [69, 18, 1], [66, 19, 0.5], [67, 19.5, 0.5], [64, 20, 1],
  [62, 21, 3],
];

/** One chord per bar: bass on 1, the chord on 2 and 3 (oom-pa-pa). */
const CHORDS: { bass: number; tones: number[] }[] = [
  { bass: 50, tones: [62, 66, 69] }, // D
  { bass: 50, tones: [62, 66, 69] }, // D
  { bass: 43, tones: [62, 67, 71] }, // G
  { bass: 45, tones: [61, 64, 69] }, // A
  { bass: 50, tones: [62, 66, 69] }, // D
  { bass: 43, tones: [62, 67, 71] }, // G
  { bass: 45, tones: [61, 64, 67] }, // A7
  { bass: 38, tones: [62, 66, 69] }, // D
];

export const MOTIF_BARS = CHORDS.length;
export const BEATS_PER_BAR = 3;

export type MotifVariant = 'full' | 'camp' | 'victory';

interface Arrangement {
  bpm: number;
  /** Bars played, 0-based, end exclusive. */
  from: number;
  to: number;
  melody: number;
  accomp: number;
  /** The last note rings this many beats longer, with a soft chord. */
  ring: number;
}

const ARRANGEMENTS: Record<MotifVariant, Arrangement> = {
  full: { bpm: 112, from: 0, to: 8, melody: 0.22, accomp: 0.09, ring: 1.5 },
  camp: { bpm: 96, from: 0, to: 4, melody: 0.16, accomp: 0.06, ring: 2 },
  victory: { bpm: 138, from: 4, to: 8, melody: 0.26, accomp: 0.12, ring: 3 },
};

export interface MotifNote {
  midi: number;
  /** Seconds from the start. */
  at: number;
  length: number;
}

export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The melody of a variant in seconds. */
export function motifNotes(variant: MotifVariant): MotifNote[] {
  const a = ARRANGEMENTS[variant];
  const beat = 60 / a.bpm;
  const start = a.from * BEATS_PER_BAR;
  return MELODY.filter(([, b]) => b >= start && b < a.to * BEATS_PER_BAR).map(([midi, b, len]) => ({ midi, at: (b - start) * beat, length: len * beat }));
}

/** Seconds the variant takes, its ring included. */
export function motifDuration(variant: MotifVariant): number {
  const a = ARRANGEMENTS[variant];
  return ((a.to - a.from) * BEATS_PER_BAR + a.ring) * (60 / a.bpm);
}

export function playMotif(variant: MotifVariant, o: SynthOut): number {
  const a = ARRANGEMENTS[variant];
  const beat = 60 / a.bpm;
  const notes = motifNotes(variant);
  notes.forEach((n, i) => {
    const last = i === notes.length - 1;
    // A little human timing; the last note rings.
    const at = o.at + n.at + (i ? (Math.random() - 0.5) * 0.012 : 0);
    pluck(o, midiHz(n.midi), at, last ? n.length + a.ring * beat : Math.max(0.35, n.length * 1.4), a.melody);
  });
  for (let bar = a.from; bar < a.to; bar++) {
    const c = CHORDS[bar]!;
    const t0 = o.at + (bar - a.from) * BEATS_PER_BAR * beat;
    pluck(o, midiHz(c.bass), t0, beat * 2.5, a.accomp * 1.4);
    if (bar === a.to - 1) {
      for (const m of c.tones) pluck(o, midiHz(m), t0 + beat, beat * (2 + a.ring), a.accomp);
      if (variant === 'victory') tone(o, midiHz(c.tones[2]! + 12), t0 + beat, beat * (2 + a.ring), a.accomp * 0.5);
    } else {
      for (const k of [1, 2]) for (const m of c.tones) pluck(o, midiHz(m), t0 + k * beat, beat * 0.9, a.accomp * 0.7);
    }
  }
  return motifDuration(variant);
}
