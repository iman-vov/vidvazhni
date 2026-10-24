// Ambient beds made in code, layered under a location's music: a low drone, wind, running water,
// drips in a cave, birds, a crackling fire. Every layer is optional (data/audio.json `ambient`, by
// environment id). Adaptive: `setIntensity(0..1)` (awake monsters, a boss) lifts the wind and opens
// the drone. Random events (drips, birds, crackle) are scheduled only while the context runs.

import { noise, noiseBuffer, tone, type SynthOut } from './synth';

export interface AmbientDef {
  drone?: { freq: number; gain: number; cutoff?: number };
  wind?: { gain: number; freq?: number };
  water?: { gain: number };
  drips?: { gain: number; rate?: number };
  birds?: { gain: number; rate?: number };
  crackle?: { gain: number };
}

const FADE = 2.5;

export class AmbientBed {
  private readonly out: GainNode;
  private readonly nodes: AudioScheduledSourceNode[] = [];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private windGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
    private readonly def: AmbientDef,
  ) {
    this.out = ctx.createGain();
    this.out.connect(dest);
    const now = ctx.currentTime;
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.exponentialRampToValueAtTime(1, now + FADE);
    if (def.drone) this.drone(def.drone);
    if (def.wind) this.wind(def.wind);
    if (def.water) this.water(def.water);
    if (def.drips) this.every(() => 1.6 + Math.random() * 3.5 / (def.drips!.rate ?? 1), (o) => this.drip(o, def.drips!.gain));
    if (def.birds) this.every(() => 3 + Math.random() * 7 / (def.birds!.rate ?? 1), (o) => this.bird(o, def.birds!.gain));
    if (def.crackle) this.every(() => 0.04 + Math.random() * 0.35, (o) => this.crack(o, def.crackle!.gain));
  }

  /** 0 calm … 1 tense: more wind, a brighter drone. */
  setIntensity(x: number): void {
    const k = Math.max(0, Math.min(1, x));
    const now = this.ctx.currentTime;
    if (this.windGain && this.def.wind) this.windGain.gain.setTargetAtTime(this.def.wind.gain * (0.6 + 0.9 * k), now, 1.5);
    if (this.droneFilter && this.def.drone) this.droneFilter.frequency.setTargetAtTime((this.def.drone.cutoff ?? 320) * (1 + 1.2 * k), now, 1.5);
  }

  stop(seconds = FADE): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), now);
    this.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    for (const n of this.nodes) n.stop(now + seconds + 0.1);
    setTimeout(() => this.out.disconnect(), (seconds + 0.3) * 1000);
  }

  // ─── layers ────────────────────────────────────────────────────────────

  private lfo(freq: number, depth: number, param: AudioParam): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    this.nodes.push(o);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer(this.ctx);
    src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * 1.5);
    this.nodes.push(src);
    return src;
  }

  /** Root and fifth, slightly detuned, breathing slowly. */
  private drone(d: NonNullable<AmbientDef['drone']>): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = d.cutoff ?? 320;
    const g = this.ctx.createGain();
    g.gain.value = d.gain;
    f.connect(g).connect(this.out);
    for (const [mult, type, detune] of [[1, 'sawtooth', -4], [1, 'sine', 5], [1.5, 'triangle', 2]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = d.freq * mult;
      o.detune.value = detune;
      o.connect(f);
      o.start();
      this.nodes.push(o);
    }
    this.lfo(0.06, d.gain * 0.35, g.gain);
    this.droneFilter = f;
  }

  /** Band-passed noise whose pitch and loudness drift (gusts). */
  private wind(w: NonNullable<AmbientDef['wind']>): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = w.freq ?? 600;
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.value = w.gain * 0.6;
    this.loopNoise().connect(f).connect(g).connect(this.out);
    this.lfo(0.07, (w.freq ?? 600) * 0.45, f.frequency);
    this.lfo(0.11, w.gain * 0.3, g.gain);
    this.windGain = g;
  }

  /** A brook: low noise with a quick babbling filter and the odd bubble. */
  private water(w: NonNullable<AmbientDef['water']>): void {
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = w.gain;
    this.loopNoise().connect(hp).connect(lp).connect(g).connect(this.out);
    this.lfo(4.3, 260, lp.frequency);
    this.lfo(0.17, w.gain * 0.3, g.gain);
    this.every(() => 0.3 + Math.random() * 1.6, (o) => tone(o, 380 + Math.random() * 500, o.at, 0.06, w.gain * 1.2, { to: 900 + Math.random() * 700, attack: 0.01 }));
  }

  /** A drop in a cave, with its echo. */
  private drip(o: SynthOut, gain: number): void {
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.21 + Math.random() * 0.08;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.32;
    const lp = this.ctx.createBiquadFilter();
    lp.frequency.value = 2400;
    delay.connect(lp).connect(fb).connect(delay);
    fb.connect(this.out);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.out);
    pan.connect(delay);
    tone({ ...o, dest: pan }, 650 + Math.random() * 500, o.at, 0.09, gain, { to: 1700 + Math.random() * 900, attack: 0.003 });
    setTimeout(() => {
      pan.disconnect();
      delay.disconnect();
      fb.disconnect();
    }, 3000);
  }

  /** Two to four quick chirps. */
  private bird(o: SynthOut, gain: number): void {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    pan.connect(this.out);
    const base = 2400 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = o.at + i * (0.09 + Math.random() * 0.05);
      tone({ ...o, dest: pan }, base, at, 0.07, gain * (1 - i * 0.15), { to: base * (1.25 + Math.random() * 0.3), attack: 0.008 });
    }
    setTimeout(() => pan.disconnect(), 2000);
  }

  private crack(o: SynthOut, gain: number): void {
    noise(o, o.at, 0.01 + Math.random() * 0.02, gain * (0.3 + Math.random()), { filter: 'highpass', freq: 1800 + Math.random() * 2500 });
  }

  /** Calls `fire` after `gap()` seconds, again and again, while the bed plays. */
  private every(gap: () => number, fire: (o: SynthOut) => void): void {
    const tick = () => {
      if (this.stopped) return;
      if (this.ctx.state === 'running') fire({ ctx: this.ctx, dest: this.out, at: this.ctx.currentTime + 0.05 });
      this.timers.push(setTimeout(tick, gap() * 1000));
      if (this.timers.length > 32) this.timers.splice(0, 16);
    };
    this.timers.push(setTimeout(tick, gap() * 1000));
  }
}
