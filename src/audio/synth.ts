// Original sounds made in code (sfxr-style): UI clicks, the card pick, the orb charge, «Наснага»,
// level up and the initiative die tumbling. Each recipe schedules oscillators and noise on the
// given context at `at`; nothing is downloaded. Named in data/audio.json as `"synth": "<name>"`.

import { midiHz, motifNotes } from './motif';

export interface SynthOut {
  ctx: BaseAudioContext;
  dest: AudioNode;
  at: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** Attack to `peak`, then an exponential fall over `decay`. */
export function envelope(p: AudioParam, at: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(0.0001, at);
  p.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  p.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

interface ToneOpts {
  type?: OscillatorType;
  to?: number;
  attack?: number;
  detune?: number;
}

export function tone(o: SynthOut, freq: number, at: number, decay: number, peak: number, opts: ToneOpts = {}): void {
  const osc = o.ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + (opts.attack ?? 0.005) + decay * 0.8);
  if (opts.detune) osc.detune.value = opts.detune;
  const g = o.ctx.createGain();
  envelope(g.gain, at, peak, opts.attack ?? 0.005, decay);
  osc.connect(g).connect(o.dest);
  osc.start(at);
  osc.stop(at + (opts.attack ?? 0.005) + decay + 0.05);
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  attack?: number;
}

export function noise(o: SynthOut, at: number, decay: number, peak: number, opts: NoiseOpts): void {
  const src = o.ctx.createBufferSource();
  src.buffer = noiseBuffer(o.ctx);
  const f = o.ctx.createBiquadFilter();
  f.type = opts.filter ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq, at);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, at + decay);
  f.Q.value = opts.q ?? 1;
  const g = o.ctx.createGain();
  envelope(g.gain, at, peak, opts.attack ?? 0.003, decay);
  src.connect(f).connect(g).connect(o.dest);
  const attack = opts.attack ?? 0.003;
  src.start(at, Math.random() * 1.5);
  src.stop(at + attack + decay + 0.05);
}

/** A warm plucked string (lute-ish): triangle + a soft octave, low-passed as it fades. */
export function pluck(o: SynthOut, freq: number, at: number, length: number, peak: number): void {
  const ctx = o.ctx;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(Math.min(9000, freq * 8), at);
  f.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), at + length);
  f.connect(o.dest);
  const out = { ctx, dest: f, at };
  tone(out, freq, at, length, peak, { type: 'triangle', attack: 0.006 });
  tone(out, freq * 2, at, length * 0.5, peak * 0.25, { attack: 0.004, detune: 4 });
}

type Recipe = (o: SynthOut) => void;

export const SYNTHS: Record<string, Recipe> = {
  /** A soft wooden tap. */
  click: (o) => {
    tone(o, 1100, o.at, 0.045, 0.35, { to: 700, type: 'triangle', attack: 0.002 });
    noise(o, o.at, 0.02, 0.12, { filter: 'highpass', freq: 3500 });
  },
  /** Lower and shorter: back / close. */
  back: (o) => {
    tone(o, 700, o.at, 0.05, 0.3, { to: 420, type: 'triangle', attack: 0.002 });
  },
  /** A card slides off the hand and taps down. */
  cardPick: (o) => {
    noise(o, o.at, 0.09, 0.25, { freq: 2600, to: 1100, q: 0.9, attack: 0.012 });
    tone(o, 520, o.at + 0.07, 0.07, 0.25, { to: 380, type: 'triangle', attack: 0.002 });
  },
  /** The orb fills: a rising glassy tone, a fifth above it, a bell at the top. */
  orb: (o) => {
    tone(o, 330, o.at, 0.42, 0.18, { to: 990, attack: 0.18 });
    tone(o, 495, o.at + 0.04, 0.4, 0.1, { to: 1485, attack: 0.18 });
    tone(o, 1320, o.at + 0.34, 0.6, 0.16);
    tone(o, 1980, o.at + 0.36, 0.45, 0.06);
  },
  /** «Наснага» gained: a warm swell up a major chord. */
  momentum: (o) => {
    [62, 66, 69, 74].forEach((m, i) => pluck(o, midiHz(m), o.at + i * 0.055, 0.5, 0.22));
    noise(o, o.at, 0.35, 0.06, { freq: 900, to: 4000, q: 0.7, attack: 0.15 });
  },
  /** «Наснага» spent: a quick bright run and a ringing top note. */
  surge: (o) => {
    noise(o, o.at, 0.25, 0.12, { freq: 600, to: 5000, q: 0.6, attack: 0.06 });
    [69, 74, 78, 81, 86].forEach((m, i) => pluck(o, midiHz(m), o.at + 0.05 + i * 0.045, 0.45, 0.2));
    tone(o, midiHz(86), o.at + 0.3, 0.9, 0.08);
  },
  /** Level up: the Lantern theme's opening, fast, and a held chord. */
  levelUp: (o) => {
    const head = motifNotes('full').slice(0, 5);
    head.forEach((n, i) => pluck(o, midiHz(n.midi), o.at + i * 0.09, 0.35, 0.24));
    const end = o.at + head.length * 0.09;
    for (const m of [62, 66, 69, 74]) pluck(o, midiHz(m), end, 1.2, 0.14);
    tone(o, midiHz(86), end + 0.05, 1.0, 0.05);
  },
  /** The wooden initiative die: knocks that come faster and softer, then it settles. */
  die: (o) => {
    const gaps = [0, 0.11, 0.09, 0.12, 0.08, 0.15, 0.2];
    let t = o.at;
    gaps.forEach((gap, i) => {
      t += gap * (0.85 + Math.random() * 0.3);
      const k = 1 - i / (gaps.length + 1);
      noise(o, t, 0.035, 0.35 * k, { freq: 1400 + Math.random() * 1200, q: 3 });
      tone(o, 190 + Math.random() * 80, t, 0.04, 0.3 * k, { type: 'triangle', attack: 0.001 });
    });
  },
};

export function playSynth(name: string, o: SynthOut, gain = 1): boolean {
  const recipe = SYNTHS[name];
  if (!recipe) return false;
  const g = o.ctx.createGain();
  g.gain.value = gain;
  g.connect(o.dest);
  recipe({ ...o, dest: g });
  return true;
}
